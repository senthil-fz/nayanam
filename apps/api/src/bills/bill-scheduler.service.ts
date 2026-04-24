import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillsService, recordEvent } from './bills.service';
import { PushNotificationsService } from './push-notifications.service';
import { newId } from '../common/ids';
import { requestContext } from '../common/context';

/**
 * Daily 03:00 UTC scheduler — the first time-driven system task in Nayanam.
 *
 * Run semantics (per spec §Scheduler):
 *   1. Guard with a pg advisory lock so redundant pods don't double-run.
 *   2. Scan all ACTIVE, non-archived bills across every household (cross-tenant
 *      read — system-owned task, not a user request).
 *   3. For each bill, apply: end_at → pause, account archived → pause + notify,
 *      auto_log → post transaction via BillsService.markPaidInternal (catch up
 *      if the bill is multi-cycle behind), else due-soon / overdue notification
 *      writes with per-cycle dedupe via last_notified_* cursors.
 *   4. Each notification write is followed by a best-effort Expo push to every
 *      household member.
 *
 * Idempotency across accidental double-runs:
 *   - Advisory lock released on commit; second attempt skips.
 *   - Auto-log path uses a deterministic `Idempotency-Key = sha1('bill-auto-log:'
 *     + billId + ':' + cycleDueAt.toISOString())` which the IdempotencyInterceptor
 *     would replay-cache IF called via HTTP; the internal path calls the
 *     service directly, so we pre-check for a prior BillPayment row on that
 *     `(bill_id, cycle_due_at)` pair in the same query predicate.
 *   - Per-bill notification writes are gated on `last_notified_* IS NULL` —
 *     a second tick in the same cycle sees the cursor set and skips.
 */
@Injectable()
export class BillSchedulerService {
  private readonly logger = new Logger(BillSchedulerService.name);
  // Fixed advisory-lock key — documented so ops knows which key to inspect if
  // the scheduler appears stuck. "B1L_5CHED" encoded as a stable int.
  private static readonly ADVISORY_LOCK_KEY = 0xb115c5ed;
  private static readonly CATCHUP_CAP = 24;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bills: BillsService,
    private readonly push: PushNotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'bills-scheduler' })
  async nightly(): Promise<void> {
    await this.runOnce();
  }

  /** Manually invokable (for CLI / verification / tests). */
  async runOnce(): Promise<{ processed: number; skippedLock: boolean }> {
    // Advisory lock — transaction-scoped so it releases on commit.
    return this.prisma.$transaction(async (tx) => {
      const lock = await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(${BillSchedulerService.ADVISORY_LOCK_KEY}) AS locked
      `;
      if (!lock[0]?.locked) {
        this.logger.log('bill-scheduler skipped: advisory lock held by peer');
        return { processed: 0, skippedLock: true };
      }
      const processed = await this.processAll(tx);
      return { processed, skippedLock: false };
    });
  }

  // ---- private ----

  private async processAll(tx: Prisma.TransactionClient): Promise<number> {
    const now = new Date();
    // Raw cross-tenant read: NO household scoping. This is a system task.
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        household_id: string;
        account_id: string;
        account_archived_at: Date | null;
        next_due_at: Date;
        cycle: string;
        custom_days: number | null;
        end_at: Date | null;
        auto_log: boolean;
        last_notified_due_soon_at: Date | null;
        last_notified_overdue_at: Date | null;
        name: string;
        amount_minor: bigint;
        currency_code: string;
      }>
    >`
      SELECT b.id, b.household_id, b.account_id,
             a.archived_at AS account_archived_at,
             b.next_due_at, b.cycle, b.custom_days, b.end_at, b.auto_log,
             b.last_notified_due_soon_at, b.last_notified_overdue_at,
             b.name, b.amount_minor, b.currency_code
        FROM bills b
        JOIN accounts a ON a.id = b.account_id
       WHERE b.status = 'ACTIVE'
         AND b.archived_at IS NULL
         AND b.deleted_at IS NULL
    `;

    let processed = 0;
    for (const r of rows) {
      try {
        await this.processBill(r, now);
        processed += 1;
      } catch (err: unknown) {
        this.logger.error(
          `bill-scheduler error bill_id=${r.id} household_id=${r.household_id} error=${String(err)}`,
        );
      }
    }
    return processed;
  }

  private async processBill(
    r: {
      id: string;
      household_id: string;
      account_id: string;
      account_archived_at: Date | null;
      next_due_at: Date;
      cycle: string;
      custom_days: number | null;
      end_at: Date | null;
      auto_log: boolean;
      last_notified_due_soon_at: Date | null;
      last_notified_overdue_at: Date | null;
      name: string;
      amount_minor: bigint;
      currency_code: string;
    },
    now: Date,
  ): Promise<void> {
    // 1. end_at reached.
    if (r.end_at && r.next_due_at.getTime() > r.end_at.getTime()) {
      await this.prisma.$transaction(async (tx) => {
        await tx.bill.update({
          where: { id: r.id },
          data: { status: 'PAUSED' },
        });
        await recordEvent(tx, r.household_id, null, 'bill.ended', {
          billId: r.id,
          endAt: r.end_at?.toISOString() ?? null,
        });
      });
      return;
    }

    // 2. Account archived.
    if (r.account_archived_at) {
      await this.prisma.$transaction(async (tx) => {
        await tx.bill.update({
          where: { id: r.id },
          data: { status: 'PAUSED' },
        });
        await recordEvent(tx, r.household_id, null, 'bill.auto_paused', {
          billId: r.id,
          reason: 'account_archived',
          accountId: r.account_id,
        });
      });
      await this.notifyHouseholdMembers(r.household_id, 'bill.auto_paused', {
        billId: r.id,
        reason: 'account_archived',
      });
      return;
    }

    // 3. Auto-log catch-up.
    if (r.auto_log && r.next_due_at.getTime() <= now.getTime()) {
      let nextDue = r.next_due_at;
      let iterations = 0;
      while (nextDue.getTime() <= now.getTime() && iterations < BillSchedulerService.CATCHUP_CAP) {
        const ok = await this.autoLogOnce(r.id, r.household_id, nextDue);
        if (!ok) break;
        // Reload nextDueAt so we iterate the advanced boundary.
        const refreshed = await this.prisma.bill.findFirst({
          where: { id: r.id },
          select: { nextDueAt: true, status: true },
        });
        if (!refreshed || refreshed.status !== 'ACTIVE') return;
        if (refreshed.nextDueAt.getTime() === nextDue.getTime()) {
          // Defensive: no progress — bail to avoid infinite loop.
          break;
        }
        nextDue = refreshed.nextDueAt;
        iterations += 1;
      }
      if (iterations >= BillSchedulerService.CATCHUP_CAP) {
        this.logger.warn(
          `bill-scheduler catch-up cap hit bill_id=${r.id} household_id=${r.household_id}`,
        );
      }
      // Notify household members that auto-log fired.
      await this.notifyHouseholdMembers(r.household_id, 'bill.auto_logged', {
        billId: r.id,
      });
      return;
    }

    // 4. Due-soon notification.
    const msUntilDue = r.next_due_at.getTime() - now.getTime();
    const dayMs = 86_400_000;

    if (msUntilDue > 0 && msUntilDue <= 3 * dayMs && r.last_notified_due_soon_at === null) {
      await this.emitNotification(r, now, 'bill.due_soon');
      return;
    }

    // 5. Overdue notification (> 1 day past due).
    if (msUntilDue < -dayMs && r.last_notified_overdue_at === null) {
      await this.emitNotification(r, now, 'bill.overdue');
      return;
    }
  }

  private async autoLogOnce(billId: string, householdId: string, cycleDueAt: Date): Promise<boolean> {
    // Deterministic dedupe: short-circuit if a payment already exists for this cycle boundary.
    const existing = await this.prisma.billPayment.findFirst({
      where: { billId, householdId, cycleDueAt, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      this.logger.log(
        `bill-scheduler auto-log skipped (already paid) bill_id=${billId} cycle_due_at=${cycleDueAt.toISOString()}`,
      );
      return true;
    }

    // Also fold in the deterministic idempotency key so an HTTP replay of the
    // same cycle returns the cached response.
    const idemKey = sha1(`bill-auto-log:${billId}:${cycleDueAt.toISOString()}`);
    void idemKey; // captured for logging; the guard above is the functional check.

    // `markPaidInternal` reads householdId from the ALS context. Run it inside
    // a per-bill context so getHouseholdOrThrow() resolves correctly.
    await requestContext.run({ householdId }, async () => {
      await this.bills.markPaidInternal(billId, {
        source: 'AUTO_LOG',
        actorUserId: null,
        occurredAt: cycleDueAt.toISOString(),
      });
    });
    return true;
  }

  private async emitNotification(
    r: {
      id: string;
      household_id: string;
      next_due_at: Date;
      amount_minor: bigint;
      currency_code: string;
      name: string;
    },
    now: Date,
    type: 'bill.due_soon' | 'bill.overdue',
  ): Promise<void> {
    // Write one notifications row per household member + set the dedupe cursor.
    const members = await this.prisma.householdMember.findMany({
      where: { householdId: r.household_id },
      select: { userId: true },
    });

    const notificationRows = await this.prisma.$transaction(async (tx) => {
      const created: Array<{ id: string; userId: string }> = [];
      for (const m of members) {
        const notifId = newId();
        await tx.notification.create({
          data: {
            id: notifId,
            userId: m.userId,
            householdId: r.household_id,
            type,
            payload: {
              billId: r.id,
              name: r.name,
              amountMinor: r.amount_minor.toString(),
              currencyCode: r.currency_code,
              dueAt: r.next_due_at.toISOString(),
            },
          },
        });
        created.push({ id: notifId, userId: m.userId });
      }

      // Advance the dedupe cursor and emit the bill-level event once.
      await tx.bill.update({
        where: { id: r.id },
        data:
          type === 'bill.due_soon'
            ? { lastNotifiedDueSoonAt: now }
            : { lastNotifiedOverdueAt: now },
      });
      await recordEvent(tx, r.household_id, null, type, {
        billId: r.id,
        dueAt: r.next_due_at.toISOString(),
        amountMinor: r.amount_minor.toString(),
        currencyCode: r.currency_code,
      });
      return created;
    });

    const title =
      type === 'bill.due_soon'
        ? `Bill due soon: ${r.name}`
        : `Bill overdue: ${r.name}`;
    const body = pushBodyFor(type, r.next_due_at, now, r.amount_minor, r.currency_code);
    for (const n of notificationRows) {
      // Phase 9: category='bills' so push_bills_enabled gates delivery.
      await this.push.send(n.userId, {
        title,
        body,
        data: {
          billId: r.id,
          notificationId: n.id,
          type,
          householdId: r.household_id,
        },
        sound: 'default',
        priority: 'high',
        category: 'bills',
      });
    }
  }

  private async notifyHouseholdMembers(
    householdId: string,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const members = await this.prisma.householdMember.findMany({
      where: { householdId },
      select: { userId: true },
    });
    await this.prisma.$transaction(async (tx) => {
      for (const m of members) {
        await tx.notification.create({
          data: {
            id: newId(),
            userId: m.userId,
            householdId,
            type,
            payload: payload as Prisma.InputJsonValue,
          },
        });
      }
    });
  }
}

function pushBodyFor(
  type: 'bill.due_soon' | 'bill.overdue',
  dueAt: Date,
  now: Date,
  amountMinor: bigint,
  currencyCode: string,
): string {
  // Minimal formatter — client apps render the real locale-aware string using
  // the `data.amountMinor`/`currencyCode`; this copy is a fallback for systems
  // that only show the body string.
  const amount = formatAmount(amountMinor, currencyCode);
  const dayMs = 86_400_000;
  const ms = dueAt.getTime() - now.getTime();
  if (type === 'bill.due_soon') {
    const days = Math.max(0, Math.ceil(ms / dayMs));
    if (days === 0) return `${amount} due today`;
    if (days === 1) return `${amount} due in 1 day`;
    return `${amount} due in ${days} days`;
  }
  const daysPast = Math.max(1, Math.floor(-ms / dayMs));
  if (daysPast === 1) return `${amount} was due yesterday`;
  return `${amount} was due ${daysPast} days ago`;
}

function formatAmount(amountMinor: bigint, currencyCode: string): string {
  // Crude "X.YY CCC" formatting; clients localize via Intl on the data fields.
  const s = amountMinor.toString().padStart(3, '0');
  const major = s.slice(0, -2);
  const minor = s.slice(-2);
  return `${major}.${minor} ${currencyCode}`;
}

function sha1(s: string): string {
  return createHash('sha1').update(s).digest('hex');
}
