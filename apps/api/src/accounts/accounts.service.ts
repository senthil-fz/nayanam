import { Injectable } from '@nestjs/common';
import { Prisma, type Account as AccountRow } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Errors } from '../common/errors';
import { newId } from '../common/ids';
import { isSupportedCurrency } from '../common/currencies';
import { getContext, getAuthOrThrow, getHouseholdOrThrow } from '../common/context';
import { roleAtLeast, type HouseholdRole } from '../common/household-header.guard';
import { BalanceService } from './balance.service';
import type { AccountDTO } from './accounts.dto';

const TERMINAL_MUTATION_ROLE = 'ADMIN' as const; // archive/restore/delete
const WRITE_ROLE = 'MEMBER' as const; // create/update/reorder

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balance: BalanceService,
  ) {}

  // ---- Reads ----

  async list(params: { cursor?: string; limit?: number; includeArchived?: boolean }): Promise<{
    items: AccountDTO[];
    nextCursor: string | null;
  }> {
    const householdId = getHouseholdOrThrow();
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
    const where: Prisma.AccountWhereInput = {
      householdId,
      deletedAt: null,
      ...(params.includeArchived ? {} : { archivedAt: null }),
    };

    const rows = await this.prisma.account.findMany({
      where,
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(toDTO);
    const nextCursor = hasMore ? rows[limit - 1]?.id ?? null : null;
    return { items, nextCursor };
  }

  async get(id: string): Promise<AccountDTO> {
    const row = await this.findActiveOrThrow(id);
    return toDTO(row);
  }

  async summary(): Promise<{
    byCurrency: Array<{ currencyCode: string; totalMinor: string; accountCount: number }>;
    totalAccounts: number;
    asOf: string;
  }> {
    const householdId = getHouseholdOrThrow();
    // Raw aggregate keeps bigint precision over the SUM.
    const rows = await this.prisma.$queryRaw<
      Array<{ currency_code: string; total_minor: bigint; account_count: bigint }>
    >`
      SELECT currency_code,
             COALESCE(SUM(cached_balance_minor), 0)::bigint AS total_minor,
             COUNT(*)::bigint AS account_count
        FROM accounts
       WHERE household_id = ${householdId}
         AND deleted_at IS NULL
         AND archived_at IS NULL
       GROUP BY currency_code
       ORDER BY currency_code ASC
    `;
    const byCurrency = rows.map((r) => ({
      currencyCode: r.currency_code,
      totalMinor: r.total_minor.toString(),
      accountCount: Number(r.account_count),
    }));
    const totalAccounts = byCurrency.reduce((n, b) => n + b.accountCount, 0);
    return { byCurrency, totalAccounts, asOf: new Date().toISOString() };
  }

  async balanceHistory(id: string, months: number) {
    const acct = await this.findActiveOrThrow(id);
    const points = await this.balance.balanceHistory(acct.id, months);
    return { accountId: acct.id, currencyCode: acct.currencyCode, points };
  }

  /**
   * Household-wide daily balance history across every non-archived,
   * non-deleted account, aggregated per currency. Returns exactly `days`
   * points per currency; zero-activity days flat-forward from the previous
   * day because the per-account helper emits a point for every bucket.
   *
   * Complexity: O(N_accounts * days) serial calls into the per-account SQL.
   * For Phase 4 scale (days ≤ 90, typical N < 20) this is well under the
   * 200ms budget; if profiling shows pressure later we can batch via a
   * single `generate_series` CTE.
   */
  async balanceHistoryAll(days: number): Promise<{
    byCurrency: Array<{
      currencyCode: string;
      points: Array<{ bucket: string; asOf: string; balanceMinor: string }>;
    }>;
    asOf: string;
  }> {
    const householdId = getHouseholdOrThrow();
    const now = new Date();

    const accounts = await this.prisma.account.findMany({
      where: { householdId, deletedAt: null, archivedAt: null },
      select: { id: true, currencyCode: true },
    });

    if (accounts.length === 0) {
      return { byCurrency: [], asOf: now.toISOString() };
    }

    // bucket → bigint sum
    type BucketMap = Map<string, { asOf: string; sum: bigint }>;
    const byCurrency = new Map<string, BucketMap>();

    for (const acct of accounts) {
      const points = await this.balance.balanceHistoryDaily(acct.id, days);
      let buckets = byCurrency.get(acct.currencyCode);
      if (!buckets) {
        buckets = new Map();
        byCurrency.set(acct.currencyCode, buckets);
      }
      for (const p of points) {
        const existing = buckets.get(p.bucket);
        const add = BigInt(p.balanceMinor);
        if (existing) {
          existing.sum += add;
          // asOf is identical across accounts for the same bucket.
        } else {
          buckets.set(p.bucket, { asOf: p.asOf, sum: add });
        }
      }
    }

    const currencies = Array.from(byCurrency.keys()).sort();
    const result = currencies.map((currencyCode) => {
      const buckets = byCurrency.get(currencyCode)!;
      const keys = Array.from(buckets.keys()).sort(); // "YYYY-MM-DD" sorts lexicographically.
      return {
        currencyCode,
        points: keys.map((bucket) => {
          const b = buckets.get(bucket)!;
          return { bucket, asOf: b.asOf, balanceMinor: b.sum.toString() };
        }),
      };
    });

    return { byCurrency: result, asOf: now.toISOString() };
  }

  // ---- Writes ----

  async create(input: {
    nickname: string;
    type: 'DEBIT' | 'CREDIT' | 'SAVINGS' | 'CASH';
    currencyCode: string;
    institution?: string | null;
    last4?: string | null;
    colorToken?: string;
    iconToken?: string;
    openingBalanceMinor?: string;
    openingBalanceAt?: string;
  }): Promise<AccountDTO> {
    const householdId = getHouseholdOrThrow();
    const { userId } = getAuthOrThrow();
    this.assertRole(WRITE_ROLE);

    const currencyCode = input.currencyCode.toUpperCase();
    if (!isSupportedCurrency(currencyCode)) throw Errors.currencyUnsupported(currencyCode);

    const opening = input.openingBalanceMinor ? BigInt(input.openingBalanceMinor) : 0n;
    const openingAt = input.openingBalanceAt ? new Date(input.openingBalanceAt) : new Date();

    const id = newId();
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const maxOrder = await tx.account.aggregate({
          where: { householdId, deletedAt: null },
          _max: { displayOrder: true },
        });
        const displayOrder = (maxOrder._max.displayOrder ?? -1) + 1;

        const row = await tx.account.create({
          data: {
            id,
            householdId,
            nickname: input.nickname,
            type: input.type,
            currencyCode,
            institution: input.institution ?? null,
            last4: input.last4 ?? null,
            colorToken: input.colorToken ?? 'indigo',
            iconToken: input.iconToken ?? 'wallet',
            openingBalanceMinor: opening,
            openingBalanceAt: openingAt,
            cachedBalanceMinor: opening,
            cachedBalanceAt: new Date(),
            displayOrder,
            createdBy: userId,
            updatedBy: userId,
          },
        });

        await recordEvent(tx, householdId, userId, 'account.created', {
          accountId: row.id,
          nickname: row.nickname,
          type: row.type,
          currencyCode: row.currencyCode,
          openingBalanceMinor: row.openingBalanceMinor.toString(),
        });

        return row;
      });
      return toDTO(created);
    } catch (err) {
      throw mapUniqueViolation(err, input.nickname);
    }
  }

  async update(
    id: string,
    patch: {
      nickname?: string;
      institution?: string | null;
      last4?: string | null;
      colorToken?: string;
      iconToken?: string;
      openingBalanceMinor?: string;
      openingBalanceAt?: string;
      type?: string; // rejected
      currencyCode?: string; // rejected
    },
  ): Promise<AccountDTO> {
    const { userId } = getAuthOrThrow();
    this.assertRole(WRITE_ROLE);

    if (patch.type !== undefined) throw Errors.accountFieldImmutable('type');
    if (patch.currencyCode !== undefined) throw Errors.accountFieldImmutable('currencyCode');

    const existing = await this.findActiveOrThrow(id);
    if (existing.archivedAt) throw Errors.accountArchived();

    const wantsOpeningChange =
      patch.openingBalanceMinor !== undefined || patch.openingBalanceAt !== undefined;

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        // Lock this account for the duration.
        await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${id} FOR UPDATE`;

        if (wantsOpeningChange) {
          const hasTx = await hasNonDeletedTransactions(tx, id);
          if (hasTx) throw Errors.accountOpeningBalanceLocked();
        }

        const data: Prisma.AccountUpdateInput = {
          updatedBy: userId,
          updatedAt: new Date(),
        };
        const changed: string[] = [];
        const before: Record<string, unknown> = {};
        const after: Record<string, unknown> = {};

        if (patch.nickname !== undefined && patch.nickname !== existing.nickname) {
          data.nickname = patch.nickname;
          changed.push('nickname');
          before.nickname = existing.nickname;
          after.nickname = patch.nickname;
        }
        if (patch.institution !== undefined && patch.institution !== existing.institution) {
          data.institution = patch.institution;
          changed.push('institution');
          before.institution = existing.institution;
          after.institution = patch.institution;
        }
        if (patch.last4 !== undefined && patch.last4 !== existing.last4) {
          data.last4 = patch.last4;
          changed.push('last4');
          before.last4 = existing.last4;
          after.last4 = patch.last4;
        }
        if (patch.colorToken !== undefined && patch.colorToken !== existing.colorToken) {
          data.colorToken = patch.colorToken;
          changed.push('colorToken');
          before.colorToken = existing.colorToken;
          after.colorToken = patch.colorToken;
        }
        if (patch.iconToken !== undefined && patch.iconToken !== existing.iconToken) {
          data.iconToken = patch.iconToken;
          changed.push('iconToken');
          before.iconToken = existing.iconToken;
          after.iconToken = patch.iconToken;
        }
        if (patch.openingBalanceMinor !== undefined) {
          const newOpening = BigInt(patch.openingBalanceMinor);
          if (newOpening !== existing.openingBalanceMinor) {
            data.openingBalanceMinor = newOpening;
            // Reset cached balance since opening balance is the sole determinant
            // when there are zero transactions (guaranteed above).
            data.cachedBalanceMinor = newOpening;
            data.cachedBalanceAt = new Date();
            changed.push('openingBalanceMinor');
            before.openingBalanceMinor = existing.openingBalanceMinor.toString();
            after.openingBalanceMinor = newOpening.toString();
          }
        }
        if (patch.openingBalanceAt !== undefined) {
          const newAt = new Date(patch.openingBalanceAt);
          if (newAt.getTime() !== existing.openingBalanceAt.getTime()) {
            data.openingBalanceAt = newAt;
            changed.push('openingBalanceAt');
            before.openingBalanceAt = existing.openingBalanceAt.toISOString();
            after.openingBalanceAt = newAt.toISOString();
          }
        }

        const row = await tx.account.update({ where: { id }, data });

        if (changed.length > 0) {
          await recordEvent(tx, existing.householdId, userId, 'account.updated', {
            accountId: id,
            changedFields: changed,
            before,
            after,
          });
        }

        return row;
      });
      return toDTO(updated);
    } catch (err) {
      throw mapUniqueViolation(err, patch.nickname ?? existing.nickname);
    }
  }

  async archiveOrDelete(id: string): Promise<AccountDTO> {
    const { userId } = getAuthOrThrow();
    this.assertRole(TERMINAL_MUTATION_ROLE);
    const existing = await this.findActiveOrThrow(id);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${id} FOR UPDATE`;

      // Hard-delete path: only when the account has zero lifetime transactions
      // (including soft-deleted). Otherwise archive.
      const hasAnyTx = await hasAnyTransactions(tx, id);

      if (!hasAnyTx) {
        const row = await tx.account.update({
          where: { id },
          data: { deletedAt: new Date(), updatedBy: userId },
        });
        await recordEvent(tx, existing.householdId, userId, 'account.deleted', {
          accountId: id,
          nickname: existing.nickname,
        });
        return row;
      }

      // Archive (idempotent — re-archiving returns the current row).
      if (existing.archivedAt) {
        return existing;
      }
      const row = await tx.account.update({
        where: { id },
        data: { archivedAt: new Date(), updatedBy: userId },
      });
      await recordEvent(tx, existing.householdId, userId, 'account.archived', {
        accountId: id,
        nickname: existing.nickname,
      });
      return row;
    });
    return toDTO(updated);
  }

  async restore(id: string): Promise<AccountDTO> {
    const { userId } = getAuthOrThrow();
    this.assertRole(TERMINAL_MUTATION_ROLE);

    const householdId = getHouseholdOrThrow();
    const existing = await this.prisma.account.findFirst({
      where: { id, householdId, deletedAt: null },
    });
    if (!existing) throw Errors.notFound();

    if (!existing.archivedAt) return toDTO(existing);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${id} FOR UPDATE`;
      // Nickname-uniqueness among active accounts is enforced by the DB's
      // partial unique index; a concurrent create under the same name will
      // surface as ACCOUNT_NICKNAME_TAKEN here.
      const row = await tx.account.update({
        where: { id },
        data: { archivedAt: null, updatedBy: userId },
      });
      await recordEvent(tx, existing.householdId, userId, 'account.restored', {
        accountId: id,
        nickname: row.nickname,
      });
      return row;
    }).catch((err) => {
      throw mapUniqueViolation(err, existing.nickname);
    });

    return toDTO(updated);
  }

  async reorder(entries: Array<{ id: string; displayOrder: number }>): Promise<{
    items: AccountDTO[];
  }> {
    const householdId = getHouseholdOrThrow();
    const { userId } = getAuthOrThrow();
    this.assertRole(WRITE_ROLE);

    // Load current active (non-archived, non-deleted) accounts in the household.
    const active = await this.prisma.account.findMany({
      where: { householdId, deletedAt: null, archivedAt: null },
      select: { id: true },
    });
    const activeIds = new Set(active.map((a) => a.id));

    // Filter the payload to ids that are actually in the active set. Per spec
    // §Edge cases #12 we silently skip ids that have been archived since the
    // client fetched, rather than 400-ing the whole reorder.
    const filtered = entries.filter((e) => activeIds.has(e.id));

    // If the client sent any ids we don't recognize *at all* (not even
    // archived/deleted — totally foreign), that's a real VALIDATION_ERROR.
    const knownAll = await this.prisma.account.findMany({
      where: { householdId, id: { in: entries.map((e) => e.id) } },
      select: { id: true },
    });
    const knownSet = new Set(knownAll.map((a) => a.id));
    const foreign = entries.filter((e) => !knownSet.has(e.id));
    if (foreign.length > 0) {
      throw Errors.validation('Reorder payload contains ids not in this household.', {
        foreignIds: foreign.map((f) => f.id),
      });
    }

    // Sort by the caller's desired order and renumber dense 0..N-1. Any active
    // account not referenced is appended, preserving its current order.
    filtered.sort((a, b) => a.displayOrder - b.displayOrder);
    const ordered = filtered.map((e) => e.id);
    const remaining = active.map((a) => a.id).filter((id) => !ordered.includes(id));
    const finalOrder = [...ordered, ...remaining];

    const items = await this.prisma.$transaction(async (tx) => {
      await Promise.all(
        finalOrder.map((id, idx) =>
          tx.account.update({
            where: { id },
            data: { displayOrder: idx, updatedBy: userId },
          }),
        ),
      );
      await recordEvent(tx, householdId, userId, 'account.reordered', {
        order: finalOrder.map((id, idx) => ({ accountId: id, displayOrder: idx })),
      });
      return tx.account.findMany({
        where: { householdId, deletedAt: null, archivedAt: null },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      });
    });

    return { items: items.map(toDTO) };
  }

  // ---- helpers ----

  private async findActiveOrThrow(id: string): Promise<AccountRow> {
    const householdId = getHouseholdOrThrow();
    const row = await this.prisma.account.findFirst({
      where: { id, householdId, deletedAt: null },
    });
    if (!row) throw Errors.notFound();
    return row;
  }

  private assertRole(minimum: HouseholdRole) {
    const role = getContext()?.householdRole;
    if (!role || !roleAtLeast(role, minimum)) throw Errors.forbiddenRole();
  }
}

// ---- module-local helpers ----

export function toDTO(row: AccountRow): AccountDTO {
  return {
    id: row.id,
    householdId: row.householdId,
    nickname: row.nickname,
    type: row.type as AccountDTO['type'],
    currencyCode: row.currencyCode,
    institution: row.institution,
    last4: row.last4,
    colorToken: row.colorToken,
    iconToken: row.iconToken,
    openingBalanceMinor: row.openingBalanceMinor.toString(),
    openingBalanceAt: row.openingBalanceAt.toISOString(),
    cachedBalanceMinor: row.cachedBalanceMinor.toString(),
    cachedBalanceAt: row.cachedBalanceAt.toISOString(),
    displayOrder: row.displayOrder,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type AnyTx = Prisma.TransactionClient | PrismaService;

async function recordEvent(
  tx: AnyTx,
  householdId: string,
  actorId: string,
  type: string,
  payload: unknown,
) {
  await tx.$executeRaw`
    INSERT INTO events (id, household_id, actor_id, type, payload)
    VALUES (${newId()}, ${householdId}, ${actorId}, ${type}, ${JSON.stringify(payload)}::jsonb)
  `;
}

async function hasNonDeletedTransactions(tx: AnyTx, accountId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS(
      SELECT 1 FROM transactions
       WHERE account_id = ${accountId} AND deleted_at IS NULL
    ) AS exists
  `;
  return rows[0]?.exists === true;
}

async function hasAnyTransactions(tx: AnyTx, accountId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS(
      SELECT 1 FROM transactions WHERE account_id = ${accountId}
    ) AS exists
  `;
  return rows[0]?.exists === true;
}

function mapUniqueViolation(err: unknown, nickname: string): Error {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002'
  ) {
    return Errors.accountNicknameTaken(nickname);
  }
  return err as Error;
}
