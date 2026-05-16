import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BudgetsService, ThresholdPushPayload } from './budgets.service';
import { requestContext } from '../common/context';

/**
 * Daily 04:00 UTC scheduler — mirrors `bill-scheduler.service.ts`.
 *
 * Run semantics (per spec §Scheduler):
 *   1. Guard with a pg advisory lock so redundant pods don't double-run.
 *   2. Scan every ACTIVE, non-archived, non-deleted budget across every
 *      household (cross-tenant read — system task).
 *   3. For each budget, inside the SAME advisory-lock-holding transaction,
 *      call `BudgetsService.evaluateBudgetThresholds`. The method writes
 *      threshold rows + per-user notifications + events via
 *      INSERT ... ON CONFLICT DO NOTHING, so a second scheduler tick the
 *      same day is a no-op.
 *   4. Collected push payloads are dispatched BEST-EFFORT after the advisory
 *      lock transaction commits. Push errors do NOT roll back.
 *
 * Idempotency:
 *   - Advisory lock (transaction-scoped) rejects concurrent runs.
 *   - UNIQUE(budget_id, period_start, threshold_percent) dedupes per period.
 */
@Injectable()
export class BudgetSchedulerService {
  private readonly logger = new Logger(BudgetSchedulerService.name);
  // `0xB006E700` — "b006e7 00" sentinel for budgets, documented for ops.
  private static readonly ADVISORY_LOCK_KEY = 0xb006e700;

  /** Accumulated push payloads from the current run; flushed post-commit. */
  private _pendingPushes: ThresholdPushPayload[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly budgets: BudgetsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'budgets-scheduler' })
  async nightly(): Promise<void> {
    await this.runOnce();
  }

  /** Manually invokable (for CLI / verification). */
  async runOnce(): Promise<{ processed: number; skippedLock: boolean }> {
    const now = new Date();
    this._pendingPushes = [];

    // All per-budget work runs inside the advisory-lock-holding transaction so
    // the lock is held for the full scan (mirrors bill-scheduler pattern).
    const locked = await this.prisma.crossTenant(
      'scheduler:budgets',
      async (raw) =>
        raw.$transaction(async (tx) => {
          const rows = await tx.$queryRaw<Array<{ locked: boolean }>>`
            SELECT pg_try_advisory_xact_lock(${BudgetSchedulerService.ADVISORY_LOCK_KEY}) AS locked
          `;
          const got = rows[0]?.locked === true;
          if (!got) return false;
          // Hold the lock for the entire scan — all per-budget work uses this
          // same tx connection, keeping it on the advisory-lock-holding session.
          await this.processAllWithinLock(tx, now);
          return true;
        }),
    );

    if (!locked) {
      this.logger.log('budget-scheduler skipped: advisory lock held by peer');
      return { processed: 0, skippedLock: true };
    }

    // Dispatch pushes BEST-EFFORT after the lock transaction commits.
    await this.budgets.flushPushQueue(this._pendingPushes);
    this._pendingPushes = [];

    return { processed: 0, skippedLock: false };
  }

  private async processAllWithinLock(
    lockTx: Prisma.TransactionClient,
    now: Date,
  ): Promise<void> {
    // Cross-tenant read: NO household scoping. System task.
    const budgetRows = await lockTx.$queryRaw<Array<{ id: string; household_id: string }>>`
      SELECT id, household_id FROM budgets
       WHERE status = 'ACTIVE'
         AND archived_at IS NULL
         AND deleted_at IS NULL
         AND (end_at IS NULL OR end_at > ${now})
    `;

    for (const b of budgetRows) {
      try {
        await requestContext.run({ householdId: b.household_id }, () =>
          this.processOne(lockTx, b.id, b.household_id, now),
        );
      } catch (err: unknown) {
        this.logger.error(
          `budget-scheduler error budget_id=${b.id} household_id=${b.household_id} error=${String(err)}`,
        );
      }
    }
  }

  private async processOne(
    tx: Prisma.TransactionClient,
    budgetId: string,
    householdId: string,
    now: Date,
  ): Promise<void> {
    // Use the lock-holding tx directly — no new $transaction. This keeps all
    // work on the same connection that holds the advisory lock, and avoids
    // nested transaction overhead.
    const budget = await tx.budget.findFirst({
      where: { id: budgetId, householdId },
    });
    if (!budget) return;

    const pushes = await this.budgets.evaluateBudgetThresholds(tx, budget, null, now);
    // Accumulate; will be flushed after the outer tx commits.
    this._pendingPushes.push(...pushes);
  }
}
