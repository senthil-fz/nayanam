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
   */
  async applyDelta(
    tx: Prisma.TransactionClient,
    accountId: string,
    signedDeltaMinor: bigint,
  ): Promise<void> {
    // Lock the row for the duration of the surrounding transaction.
    await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${accountId} FOR UPDATE`;
    await tx.$executeRaw`
      UPDATE accounts
         SET cached_balance_minor = cached_balance_minor + ${signedDeltaMinor}::bigint,
             cached_balance_at = now(),
             updated_at = now()
       WHERE id = ${accountId}
    `;
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
   * [openingBalanceAt, upperBound]. Returns 0 when the table isn't present
   * yet (Phase 2 precedes F-301).
   */
  private async sumTransactions(
    client: TxClient,
    accountId: string,
    lower: Date,
    upper: Date | null,
  ): Promise<bigint> {
    try {
      const rows = upper
        ? await client.$queryRaw<Array<{ total: bigint | null }>>`
            SELECT COALESCE(SUM(amount_minor), 0)::bigint AS total
              FROM transactions
             WHERE account_id = ${accountId}
               AND deleted_at IS NULL
               AND occurred_at >= ${lower}
               AND occurred_at <= ${upper}
          `
        : await client.$queryRaw<Array<{ total: bigint | null }>>`
            SELECT COALESCE(SUM(amount_minor), 0)::bigint AS total
              FROM transactions
             WHERE account_id = ${accountId}
               AND deleted_at IS NULL
               AND occurred_at >= ${lower}
          `;
      return rows[0]?.total ?? 0n;
    } catch (err) {
      // transactions table doesn't exist yet (Phase 2). Treat as empty.
      const msg = err instanceof Error ? err.message : String(err);
      if (/transactions/i.test(msg) && /does not exist|relation/i.test(msg)) {
        return 0n;
      }
      throw err;
    }
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
