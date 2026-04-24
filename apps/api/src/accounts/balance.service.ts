import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Accepts either a live `PrismaService` or a `Prisma.TransactionClient`
 * handed in from an enclosing `$transaction`. Only the shared surface
 * (`$queryRaw`, `$executeRaw`, and the model delegates) is used below.
 */
type TxClient = Prisma.TransactionClient | PrismaService;

export type BalanceHistoryPoint = {
  bucket: string; // "YYYY-MM"
  asOf: string; // ISO datetime
  balanceMinor: string;
};

/**
 * Owns cached-balance maintenance + point-in-time history for accounts.
 *
 * Phase 2: the `transactions` table does not exist yet (F-301 in Phase 3).
 * `applyDelta` / `recompute` are implemented against the contract we will
 * commit to in Phase 3 — specifically, a `transactions` row with
 * `account_id`, signed `amount_minor`, `occurred_at`, `deleted_at`. Until
 * that table lands these functions no-op the summation (or treat it as 0)
 * so the cached balance always equals opening balance, which is the only
 * value an account can have pre-Phase-3. This keeps the Phase 3 wire-up a
 * single-PR change with no refactor.
 */
@Injectable()
export class BalanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Apply a signed delta to `cached_balance_minor` with row-level locking.
   * Intended to be called from within an existing Prisma `$transaction` where
   * the corresponding transaction row is also being written.
   *
   * When `occurredAt` is supplied AND it falls before the account's
   * `openingBalanceAt`, the delta is NOT applied to the cached balance (the
   * transaction row still exists and is returned by list queries, but the
   * opening-balance snapshot is the truth for that window). The caller still
   * gets a successful return so the surrounding write completes atomically.
   */
  async applyDelta(
    tx: Prisma.TransactionClient,
    accountId: string,
    signedDeltaMinor: bigint,
    occurredAt?: Date,
  ): Promise<void> {
    // Lock the row for the duration of the surrounding transaction.
    const rows = await tx.$queryRaw<Array<{ opening_balance_at: Date }>>`
      SELECT opening_balance_at FROM accounts WHERE id = ${accountId} FOR UPDATE
    `;
    const openingAt = rows[0]?.opening_balance_at;
    if (occurredAt && openingAt && occurredAt < openingAt) {
      // Pre-opening: row persists, cached balance unchanged.
      return;
    }
    await tx.$executeRaw`
      UPDATE accounts
         SET cached_balance_minor = cached_balance_minor + ${signedDeltaMinor}::bigint,
             cached_balance_at = now(),
             updated_at = now()
       WHERE id = ${accountId}
    `;
  }

  /**
   * Predicate helper: whether a delta would actually be applied for a given
   * `occurredAt` on the account. Used by restore paths to verify pre/post
   * state without mutating. Not used on the hot path.
   */
  async shouldApplyDelta(accountId: string, occurredAt: Date): Promise<boolean> {
    const acct = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!acct) return false;
    return occurredAt >= acct.openingBalanceAt;
  }

  /**
   * Recompute cached balance from scratch. Safe to run outside a caller
   * transaction; internally it opens its own short transaction with row
   * locking.
   */
  async recompute(accountId: string): Promise<bigint> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${accountId} FOR UPDATE`;
      const acct = await tx.account.findUnique({ where: { id: accountId } });
      if (!acct) return 0n;
      const sum = await this.sumTransactions(tx, accountId, acct.openingBalanceAt, null);
      const total = acct.openingBalanceMinor + sum;
      await tx.account.update({
        where: { id: accountId },
        data: { cachedBalanceMinor: total, cachedBalanceAt: new Date() },
      });
      return total;
    });
  }

  /**
   * Trailing `days` balance points for a single account, bucketed daily,
   * oldest→newest. Past days use UTC end-of-day (23:59:59.999Z) as `asOf`;
   * the current UTC day uses `now()` so the last bar reflects real-time
   * balance (mirrors Phase 2's monthly convention).
   *
   * Deliberately a sibling of `balanceHistory(months)` rather than a unit
   * parameter on the existing method. Phase 2's monthly callers on web and
   * mobile are already shipped; keeping the monthly signature stable avoids
   * a cross-surface refactor. The SQL body is identical modulo the asOf
   * bucket generator.
   */
  async balanceHistoryDaily(accountId: string, days: number): Promise<BalanceHistoryPoint[]> {
    const acct = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!acct) return [];

    const now = new Date();
    const points: BalanceHistoryPoint[] = [];

    // Build bucket cutoffs oldest → newest. The final bucket is the current
    // UTC day (asOf = now()); walk backward `days - 1` days from there using
    // UTC end-of-day as `asOf`.
    const todayStart = startOfDayUTC(now);
    const cutoffs: Array<{ bucket: string; asOf: Date; isCurrent: boolean }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const dayStart = addDaysUTC(todayStart, -i);
      const isCurrent = i === 0;
      const bucket = toISODate(dayStart);
      const asOf = isCurrent ? now : endOfDayUTC(dayStart);
      cutoffs.push({ bucket, asOf, isCurrent });
    }

    for (const { bucket, asOf } of cutoffs) {
      if (asOf < acct.openingBalanceAt) {
        points.push({
          bucket,
          asOf: asOf.toISOString(),
          balanceMinor: acct.openingBalanceMinor.toString(),
        });
        continue;
      }
      const sum = await this.sumTransactions(this.prisma, accountId, acct.openingBalanceAt, asOf);
      const balance = acct.openingBalanceMinor + sum;
      points.push({
        bucket,
        asOf: asOf.toISOString(),
        balanceMinor: balance.toString(),
      });
    }

    return points;
  }

  /**
   * Trailing `months` balance points, oldest→newest. Each past month uses
   * UTC end-of-month as `asOf`; the current month uses `now()`.
   */
  async balanceHistory(accountId: string, months: number): Promise<BalanceHistoryPoint[]> {
    const acct = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!acct) return [];

    const now = new Date();
    const points: BalanceHistoryPoint[] = [];

    // Build bucket cutoffs oldest → newest. We include the *current* month as
    // the final bucket, then walk backward months-1 more.
    const cutoffs: Array<{ bucket: string; asOf: Date; isCurrent: boolean }> = [];
    for (let i = months - 1; i >= 0; i--) {
      const ref = addMonthsUTC(now, -i);
      const isCurrent = i === 0;
      const bucket = `${ref.getUTCFullYear()}-${pad2(ref.getUTCMonth() + 1)}`;
      const asOf = isCurrent ? now : endOfMonthUTC(ref);
      cutoffs.push({ bucket, asOf, isCurrent });
    }

    for (const { bucket, asOf } of cutoffs) {
      if (asOf < acct.openingBalanceAt) {
        // Pre-opening: the account didn't exist yet — report opening balance
        // as a flat prefix per spec §Edge cases #11.
        points.push({
          bucket,
          asOf: asOf.toISOString(),
          balanceMinor: acct.openingBalanceMinor.toString(),
        });
        continue;
      }
      const sum = await this.sumTransactions(this.prisma, accountId, acct.openingBalanceAt, asOf);
      const balance = acct.openingBalanceMinor + sum;
      points.push({
        bucket,
        asOf: asOf.toISOString(),
        balanceMinor: balance.toString(),
      });
    }

    return points;
  }

  /**
   * Sum signed minor-units from `transactions` for the given account in
   * [openingBalanceAt, upperBound]. Signs are derived from `type`:
   * INCOME/TRANSFER-destination add, EXPENSE/TRANSFER-source subtract. The
   * `transactions.amount_minor` column is always positive; the sign is
   * applied here so Stats queries can sum raw magnitudes cleanly.
   */
  private async sumTransactions(
    client: TxClient,
    accountId: string,
    lower: Date,
    upper: Date | null,
  ): Promise<bigint> {
    // Signed sum: INCOME positive; EXPENSE negative; TRANSFER rows carry their
    // sign based on whether this account is source or destination. Source
    // transfers on an account are the ones whose paired transfer.source_account_id
    // equals this account.
    const rows = upper
      ? await client.$queryRaw<Array<{ total: bigint | null }>>`
          SELECT COALESCE(SUM(
            CASE
              WHEN t.type = 'INCOME' THEN t.amount_minor
              WHEN t.type = 'EXPENSE' THEN -t.amount_minor
              WHEN t.type = 'TRANSFER' AND tr.source_account_id = ${accountId} THEN -t.amount_minor
              WHEN t.type = 'TRANSFER' AND tr.destination_account_id = ${accountId} THEN t.amount_minor
              ELSE 0
            END
          ), 0)::bigint AS total
            FROM transactions t
            LEFT JOIN transfers tr ON tr.id = t.transfer_id
           WHERE t.account_id = ${accountId}
             AND t.deleted_at IS NULL
             AND t.occurred_at >= ${lower}
             AND t.occurred_at <= ${upper}
        `
      : await client.$queryRaw<Array<{ total: bigint | null }>>`
          SELECT COALESCE(SUM(
            CASE
              WHEN t.type = 'INCOME' THEN t.amount_minor
              WHEN t.type = 'EXPENSE' THEN -t.amount_minor
              WHEN t.type = 'TRANSFER' AND tr.source_account_id = ${accountId} THEN -t.amount_minor
              WHEN t.type = 'TRANSFER' AND tr.destination_account_id = ${accountId} THEN t.amount_minor
              ELSE 0
            END
          ), 0)::bigint AS total
            FROM transactions t
            LEFT JOIN transfers tr ON tr.id = t.transfer_id
           WHERE t.account_id = ${accountId}
             AND t.deleted_at IS NULL
             AND t.occurred_at >= ${lower}
        `;
    return rows[0]?.total ?? 0n;
  }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Add `n` calendar months to a Date, in UTC, clamping to last-of-month. */
function addMonthsUTC(d: Date, n: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(y, m, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  target.setUTCHours(d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
  return target;
}

/** Last moment of `d`'s month in UTC, i.e. day N at 23:59:59.999Z. */
function endOfMonthUTC(d: Date): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, lastDay, 23, 59, 59, 999));
}

/** Start of `d`'s UTC day, i.e. 00:00:00.000Z. */
function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

/** End of `d`'s UTC day, i.e. 23:59:59.999Z. */
function endOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

function addDaysUTC(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n, 0, 0, 0, 0));
}

/** "YYYY-MM-DD" UTC date key. */
function toISODate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
