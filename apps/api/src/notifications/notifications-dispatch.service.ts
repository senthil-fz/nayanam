import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { PushNotificationsService } from '../bills/push-notifications.service';
import { newId } from '../common/ids';

export type NotificationCategory =
  | 'bills'
  | 'budgets'
  | 'household_activity'
  | 'weekly_summary';

export type DispatchInput = {
  userId: string;
  type: string;
  payload: Record<string, unknown>;
  householdId?: string | null;
  title: string;
  body: string;
  push?: {
    sound?: 'default' | null;
    priority?: 'default' | 'normal' | 'high';
    data?: Record<string, unknown>;
  };
  /** Optional transactional sender: write the `notifications` row inside the caller's tx. */
  tx?: Prisma.TransactionClient;
};

/**
 * Phase 9 shared dispatch gate. Every in-app / push / email notification
 * flows through here so per-user `user_notification_preferences` are applied
 * uniformly.
 *
 * Behavior per spec §5:
 *   - Always writes the `notifications` row (in-app center is unconditional).
 *   - Push: skipped when `push_<category>_enabled` is false.
 *   - Email: skipped when `email_<category>_enabled` is false.
 *
 * Bills and Budgets callers pass their own `tx` so the in-app row is
 * transactionally coupled to the domain mutation; push + email fan out
 * AFTER the caller's transaction commits (the dispatcher queues them and the
 * caller awaits `flushAsync()` post-commit).
 */
@Injectable()
export class NotificationsDispatchService {
  private readonly logger = new Logger(NotificationsDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushNotificationsService,
    private readonly mail: MailService,
  ) {}

  /**
   * Write the in-app row (inside caller tx if provided) and return a closure
   * that fans out push + email when invoked. Callers invoke the closure AFTER
   * their outer transaction commits so push/email failures never poison
   * the domain mutation.
   */
  async dispatch(input: DispatchInput): Promise<{
    notificationId: string;
    flush: () => Promise<void>;
  }> {
    const notificationId = newId();
    const writer: Prisma.NotificationDelegate | null = input.tx
      ? input.tx.notification
      : this.prisma.notification;

    await writer.create({
      data: {
        id: notificationId,
        userId: input.userId,
        householdId: input.householdId ?? null,
        type: input.type,
        payload: input.payload as Prisma.InputJsonValue,
      },
    });

    const category = deriveCategory(input.type);

    const flush = async (): Promise<void> => {
      // Re-read prefs outside the caller's tx so we respect post-commit toggles.
      const prefs = await this.loadPrefs(input.userId);

      const pushEnabled = pushFlagFor(prefs, category);
      const emailEnabled = emailFlagFor(prefs, category);

      if (pushEnabled) {
        try {
          await this.push.send(input.userId, {
            title: input.title,
            body: input.body,
            data: {
              ...(input.push?.data ?? {}),
              notificationId,
              type: input.type,
              ...(input.householdId ? { householdId: input.householdId } : {}),
            },
            sound: input.push?.sound === null ? null : (input.push?.sound ?? 'default'),
            priority: input.push?.priority ?? 'high',
          });
        } catch (err: unknown) {
          this.logger.warn(
            `dispatch push failed user_id=${input.userId} type=${input.type} error=${String(err)}`,
          );
        }
      }

      if (emailEnabled) {
        try {
          const user = await this.prisma.user.findUnique({
            where: { id: input.userId },
            select: { email: true },
          });
          if (user?.email) {
            await this.mail.sendGeneric(user.email, input.title, input.body);
          }
        } catch (err: unknown) {
          this.logger.warn(
            `dispatch email failed user_id=${input.userId} type=${input.type} error=${String(err)}`,
          );
        }
      }
    };

    return { notificationId, flush };
  }

  /**
   * Load-or-lazy-create preferences. Defaults defined in the DB; absent rows
   * are treated as all-defaults-on so newly registered users see expected
   * behavior before first Settings visit.
   */
  async loadPrefs(userId: string): Promise<{
    pushBillsEnabled: boolean;
    pushBudgetsEnabled: boolean;
    pushHouseholdActivityEnabled: boolean;
    pushWeeklySummaryEnabled: boolean;
    emailBillsEnabled: boolean;
    emailBudgetsEnabled: boolean;
    emailHouseholdActivityEnabled: boolean;
    emailWeeklySummaryEnabled: boolean;
  }> {
    const row = await this.prisma.userNotificationPreferences.findUnique({
      where: { userId },
    });
    if (row) return row;
    return {
      pushBillsEnabled: true,
      pushBudgetsEnabled: true,
      pushHouseholdActivityEnabled: true,
      pushWeeklySummaryEnabled: false,
      emailBillsEnabled: false,
      emailBudgetsEnabled: false,
      emailHouseholdActivityEnabled: false,
      emailWeeklySummaryEnabled: true,
    };
  }
}

export function deriveCategory(type: string): NotificationCategory {
  const prefix = type.split('.')[0];
  switch (prefix) {
    case 'bill':
    case 'bills':
      return 'bills';
    case 'budget':
    case 'budgets':
      return 'budgets';
    case 'household':
      return 'household_activity';
    case 'weekly_summary':
    case 'weekly':
      return 'weekly_summary';
    default:
      return 'household_activity';
  }
}

function pushFlagFor(
  p: Awaited<ReturnType<NotificationsDispatchService['loadPrefs']>>,
  c: NotificationCategory,
): boolean {
  switch (c) {
    case 'bills':
      return p.pushBillsEnabled;
    case 'budgets':
      return p.pushBudgetsEnabled;
    case 'household_activity':
      return p.pushHouseholdActivityEnabled;
    case 'weekly_summary':
      return p.pushWeeklySummaryEnabled;
  }
}

function emailFlagFor(
  p: Awaited<ReturnType<NotificationsDispatchService['loadPrefs']>>,
  c: NotificationCategory,
): boolean {
  switch (c) {
    case 'bills':
      return p.emailBillsEnabled;
    case 'budgets':
      return p.emailBudgetsEnabled;
    case 'household_activity':
      return p.emailHouseholdActivityEnabled;
    case 'weekly_summary':
      return p.emailWeeklySummaryEnabled;
  }
}
