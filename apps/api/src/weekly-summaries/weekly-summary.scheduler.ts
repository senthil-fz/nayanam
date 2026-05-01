import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventType } from '../common/event-types';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { newId } from '../common/ids';
import { WeeklySummariesService } from './weekly-summaries.service';
import { requestContext } from '../common/context';

/**
 * Sunday 14:00 UTC per spec §6. Advisory lock 0xDEBBA9 guards against
 * redundant runs across pods. Idempotent: `weekly_summary_sends.(user_id,
 * week_ending_at)` is unique.
 */
@Injectable()
export class WeeklySummaryScheduler {
  private readonly logger = new Logger(WeeklySummaryScheduler.name);
  private static readonly ADVISORY_LOCK_KEY = 0x00debba9;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly summaries: WeeklySummariesService,
  ) {}

  @Cron('0 14 * * 0', { name: 'weekly-summary-scheduler' })
  async weekly(): Promise<void> {
    await this.runOnce();
  }

  async runOnce(): Promise<{ sent: number; skippedLock: boolean; skippedEmpty: number }> {
    return this.prisma.crossTenant('scheduler:weekly-summary', async (raw) =>
      raw.$transaction(async (tx) => {
        const lock = await tx.$queryRaw<Array<{ locked: boolean }>>`
          SELECT pg_try_advisory_xact_lock(${WeeklySummaryScheduler.ADVISORY_LOCK_KEY}) AS locked
        `;
        if (!lock[0]?.locked) {
          this.logger.log('weekly-summary skipped: advisory lock held by peer');
          return { sent: 0, skippedLock: true, skippedEmpty: 0 };
        }

        const { weekStart, weekEnd } = this.summaries.resolveWeek();

        // Every user with email_weekly_summary_enabled = true AND no prior send
        // for this week.
        const candidates = await tx.$queryRaw<
          Array<{ user_id: string; email: string }>
        >`
          SELECT u.id AS user_id, u.email
            FROM users u
            JOIN user_notification_preferences p ON p.user_id = u.id
            LEFT JOIN weekly_summary_sends s
                   ON s.user_id = u.id AND s.week_ending_at = ${weekEnd}
           WHERE p.email_weekly_summary_enabled = TRUE
             AND s.id IS NULL
        `;

        let sent = 0;
        let skippedEmpty = 0;
        for (const c of candidates) {
          try {
            const total = await this.summaries.totalTransactionsForUser(
              c.user_id,
              weekStart,
              weekEnd,
            );
            if (total === 0) {
              skippedEmpty += 1;
              continue;
            }
            const summary = await this.summaries.computePreviewForUser(
              c.user_id,
              weekEnd.toISOString(),
            );
            const { subject, text, html } = renderEmail(summary);
            await this.mail.sendGeneric(c.email, subject, text, html);

            await tx.weeklySummarySend.create({
              data: {
                id: newId(),
                userId: c.user_id,
                weekEndingAt: weekEnd,
              },
            });

            // Fan-out: emit one `user.weekly_summary_sent` event per household
            // the user belongs to, so the activity log isn't mis-attributed to
            // a single arbitrary household. System event — actor_id = NULL.
            const memberships = await tx.householdMember.findMany({
              where: { userId: c.user_id },
              select: { householdId: true },
            });
            for (const m of memberships) {
              await requestContext.run(
                { householdId: m.householdId },
                async () => {
                  await tx.$executeRaw`
                    INSERT INTO events (id, household_id, actor_id, type, payload)
                    VALUES (
                      ${newId()}, ${m.householdId}, NULL, ${EventType.USER_WEEKLY_SUMMARY_SENT},
                      ${JSON.stringify({ userId: c.user_id, weekEndAt: weekEnd.toISOString(), transactionCount: total })}::jsonb
                    )
                  `;
                },
              );
            }
            sent += 1;
          } catch (err: unknown) {
            this.logger.error(
              `weekly-summary send failed user_id=${c.user_id} error=${String(err)}`,
            );
          }
        }

        return { sent, skippedLock: false, skippedEmpty };
      }),
    );
  }
}

function renderEmail(summary: {
  weekStartAt: string;
  weekEndAt: string;
  households: Array<{
    householdId: string;
    name: string;
    byCurrency: Array<{
      currencyCode: string;
      incomeMinor: string;
      expenseMinor: string;
      netMinor: string;
      transactionCount: number;
    }>;
  }>;
}): { subject: string; text: string; html: string } {
  const startDate = summary.weekStartAt.slice(0, 10);
  const endDate = summary.weekEndAt.slice(0, 10);
  const subject = `Your Nayanam weekly summary: ${startDate} → ${endDate}`;

  const lines: string[] = [`Weekly summary (${startDate} → ${endDate})`, ''];
  for (const h of summary.households) {
    lines.push(`# ${h.name}`);
    if (h.byCurrency.length === 0) {
      lines.push('  (no activity)');
    } else {
      for (const b of h.byCurrency) {
        lines.push(
          `  ${b.currencyCode}: +${formatMinor(b.incomeMinor)} income / -${formatMinor(b.expenseMinor)} expense / net ${formatMinor(b.netMinor)} (${b.transactionCount} tx)`,
        );
      }
    }
    lines.push('');
  }
  const text = lines.join('\n');
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif">
    <h1>Weekly summary</h1>
    <p>${startDate} → ${endDate}</p>
    ${summary.households
      .map(
        (h) => `
      <h2>${escapeHtml(h.name)}</h2>
      ${
        h.byCurrency.length === 0
          ? '<p><em>No activity</em></p>'
          : `<ul>${h.byCurrency
              .map(
                (b) =>
                  `<li><b>${escapeHtml(b.currencyCode)}</b>: +${formatMinor(b.incomeMinor)} / -${formatMinor(b.expenseMinor)} / net ${formatMinor(b.netMinor)} (${b.transactionCount} tx)</li>`,
              )
              .join('')}</ul>`
      }
    `,
      )
      .join('')}
  </body></html>`;
  return { subject, text, html };
}

function formatMinor(minor: string): string {
  const n = BigInt(minor);
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const s = abs.toString().padStart(3, '0');
  const major = s.slice(0, -2);
  const cents = s.slice(-2);
  return `${neg ? '-' : ''}${major}.${cents}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return c;
    }
  });
}
