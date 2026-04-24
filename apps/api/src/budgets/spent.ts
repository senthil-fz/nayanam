import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import {
  currentPeriodEnd,
  currentPeriodStart,
  effectivePeriodLowerBound,
  previousPeriodStart,
  type BudgetPeriod,
} from '../common/period';

export type AnyTx = Prisma.TransactionClient | PrismaService;

export type BudgetSpentInputs = {
  householdId: string;
  scope: 'HOUSEHOLD' | 'CATEGORY';
  categoryId: string | null;
  currencyCode: string;
  period: BudgetPeriod;
  startAt: Date;
  endAt: Date | null;
  amountMinor: bigint;
  rollover: boolean;
};

export type BudgetSpentResult = {
  periodStart: Date;
  periodEnd: Date;
  /** Spend-window lower bound, honoring the first-period rule. */
  effectivePeriodStart: Date;
  spentMinor: bigint;
  rolloverCarryInMinor: bigint;
  effectiveAmountMinor: bigint;
  /** True when `now >= endAt`. Callers should freeze further threshold firing. */
  inert: boolean;
};

/**
 * Aggregate EXPENSE transaction spend for a budget in its current period,
 * and (optionally) compute a rollover carry-in from the immediately-prior
 * period. The SUM excludes transfers (`transfer_id IS NULL`) and
 * soft-deleted rows. Rollover is one-period-back only (documented cap).
 *
 * The underlying SQL is the same shape used by the scheduler, real-time
 * evaluator, `/budgets/status`, and `/budgets/:id/history` — keep it in one
 * place so all four paths agree on exactly what "spent" means.
 */
export async function computeSpent(
  tx: AnyTx,
  inputs: BudgetSpentInputs,
  now: Date,
): Promise<BudgetSpentResult> {
  const periodStart = currentPeriodStart(inputs.period, inputs.startAt, now);
  const periodEnd = currentPeriodEnd(inputs.period, inputs.startAt, now);
  const effectivePeriodStart = effectivePeriodLowerBound(periodStart, inputs.startAt);
  const inert = inputs.endAt !== null && now.getTime() >= inputs.endAt.getTime();

  const spentMinor = await sumExpenseInWindow(
    tx,
    inputs.householdId,
    inputs.scope,
    inputs.categoryId,
    inputs.currencyCode,
    effectivePeriodStart,
    periodEnd,
  );

  let carryIn = 0n;
  if (inputs.rollover) {
    const prevStart = previousPeriodStart(inputs.period, inputs.startAt, now);
    // If the budget didn't exist during the previous period, carry-in is 0.
    if (inputs.startAt.getTime() <= prevStart.getTime()) {
      const prevEnd = periodStart;
      const prevSpent = await sumExpenseInWindow(
        tx,
        inputs.householdId,
        inputs.scope,
        inputs.categoryId,
        inputs.currencyCode,
        prevStart,
        prevEnd,
      );
      const unused = inputs.amountMinor - prevSpent;
      carryIn = unused > 0n ? unused : 0n;
    }
  }

  const effectiveAmountMinor = inputs.amountMinor + carryIn;

  return {
    periodStart,
    periodEnd,
    effectivePeriodStart,
    spentMinor,
    rolloverCarryInMinor: carryIn,
    effectiveAmountMinor,
    inert,
  };
}

/**
 * Variant for history: compute spent + rollover for an arbitrary prior period
 * whose boundaries are already known. carry-in is derived from the immediately
 * preceding period; when the budget's startAt is at/after that preceding
 * period's end, carry-in is 0 (we don't recurse further back than one hop).
 */
export async function computeHistoricalSpent(
  tx: AnyTx,
  inputs: BudgetSpentInputs,
  periodStart: Date,
  periodEnd: Date,
): Promise<BudgetSpentResult> {
  const effectivePeriodStart = effectivePeriodLowerBound(periodStart, inputs.startAt);
  const inert = inputs.endAt !== null && periodStart.getTime() >= inputs.endAt.getTime();

  const spentMinor = await sumExpenseInWindow(
    tx,
    inputs.householdId,
    inputs.scope,
    inputs.categoryId,
    inputs.currencyCode,
    effectivePeriodStart,
    periodEnd,
  );

  let carryIn = 0n;
  if (inputs.rollover) {
    // Derive the prior period by shifting back one `period` worth of time.
    const prevEnd = periodStart;
    const prevStart =
      inputs.period === 'MONTHLY'
        ? new Date(
            Date.UTC(
              periodStart.getUTCFullYear(),
              periodStart.getUTCMonth() - 1,
              1,
              0,
              0,
              0,
              0,
            ),
          )
        : new Date(periodStart.getTime() - 7 * 86_400_000);
    if (inputs.startAt.getTime() <= prevStart.getTime()) {
      const prevSpent = await sumExpenseInWindow(
        tx,
        inputs.householdId,
        inputs.scope,
        inputs.categoryId,
        inputs.currencyCode,
        prevStart,
        prevEnd,
      );
      const unused = inputs.amountMinor - prevSpent;
      carryIn = unused > 0n ? unused : 0n;
    }
  }

  const effectiveAmountMinor = inputs.amountMinor + carryIn;

  return {
    periodStart,
    periodEnd,
    effectivePeriodStart,
    spentMinor,
    rolloverCarryInMinor: carryIn,
    effectiveAmountMinor,
    inert,
  };
}

async function sumExpenseInWindow(
  tx: AnyTx,
  householdId: string,
  scope: 'HOUSEHOLD' | 'CATEGORY',
  categoryId: string | null,
  currencyCode: string,
  from: Date,
  toExclusive: Date,
): Promise<bigint> {
  // Empty window — spend is trivially 0.
  if (from.getTime() >= toExclusive.getTime()) return 0n;

  type Row = { total: bigint | null };
  const rows =
    scope === 'HOUSEHOLD'
      ? await tx.$queryRaw<Row[]>`
          SELECT COALESCE(SUM(amount_minor), 0)::bigint AS total
            FROM transactions
           WHERE household_id = ${householdId}
             AND deleted_at IS NULL
             AND type = 'EXPENSE'
             AND transfer_id IS NULL
             AND currency_code = ${currencyCode}
             AND occurred_at >= ${from}
             AND occurred_at <  ${toExclusive}
        `
      : await tx.$queryRaw<Row[]>`
          SELECT COALESCE(SUM(amount_minor), 0)::bigint AS total
            FROM transactions
           WHERE household_id = ${householdId}
             AND deleted_at IS NULL
             AND type = 'EXPENSE'
             AND transfer_id IS NULL
             AND currency_code = ${currencyCode}
             AND category_id = ${categoryId}
             AND occurred_at >= ${from}
             AND occurred_at <  ${toExclusive}
        `;
  return rows[0]?.total ?? 0n;
}

/**
 * Non-negative integer floor of `spent * 100 / effective`. Defensive against
 * `effective = 0` (impossible given DB CHECK but we guard anyway).
 */
export function progressPercent(
  spentMinor: bigint,
  effectiveAmountMinor: bigint,
): number {
  if (effectiveAmountMinor <= 0n) return 0;
  const raw = (spentMinor * 100n) / effectiveAmountMinor;
  if (raw < 0n) return 0;
  // Clamp to Number-safe range (progress can only grow so much in practice).
  if (raw > BigInt(Number.MAX_SAFE_INTEGER)) return Number.MAX_SAFE_INTEGER;
  return Number(raw);
}

export const THRESHOLD_LADDER: readonly number[] = [50, 80, 100, 120] as const;

/**
 * Given the current `progressPercent` and the set of thresholds already fired,
 * return the subset of ladder thresholds that should fire now (monotonic).
 */
export function pendingThresholds(
  progress: number,
  alreadyFired: ReadonlySet<number>,
): number[] {
  return THRESHOLD_LADDER.filter((t) => progress >= t && !alreadyFired.has(t));
}
