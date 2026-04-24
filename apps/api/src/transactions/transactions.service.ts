import { Injectable } from '@nestjs/common';
import { Prisma, type Transaction as TransactionRow } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BalanceService } from '../accounts/balance.service';
import { CategoriesService } from '../categories/categories.service';
import { BudgetsService } from '../budgets/budgets.service';
import { Errors } from '../common/errors';
import { newId } from '../common/ids';
import { getAuthOrThrow, getContext, getHouseholdOrThrow } from '../common/context';
import { roleAtLeast, type HouseholdRole } from '../common/household-header.guard';
import type { TransactionDTO } from './transactions.dto';

const WRITE_ROLE = 'MEMBER' as const;

type AnyTx = Prisma.TransactionClient | PrismaService;
type TxType = 'INCOME' | 'EXPENSE' | 'TRANSFER';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balance: BalanceService,
    private readonly categories: CategoriesService,
    private readonly budgets: BudgetsService,
  ) {}

  // ---- list / get ----

  async list(params: {
    cursor?: string;
    limit?: number;
    accountId?: string | string[];
    categoryId?: string | string[];
    type?: TxType;
    from?: string;
    to?: string;
    q?: string;
    includeDeleted?: boolean;
    transferId?: string;
  }): Promise<{ items: TransactionDTO[]; nextCursor: string | null }> {
    const householdId = getHouseholdOrThrow();
    const role = getContext()?.householdRole;
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);

    // includeDeleted is OWNER/ADMIN-only; silently clamp to false otherwise.
    const canSeeDeleted = role ? roleAtLeast(role, 'ADMIN') : false;
    const includeDeleted = canSeeDeleted && params.includeDeleted === true;

    // Transfer pair-row lookup short-circuits other filters.
    if (params.transferId) {
      const rows = await this.prisma.transaction.findMany({
        where: {
          householdId,
          transferId: params.transferId,
          ...(includeDeleted ? {} : { deletedAt: null }),
        },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      });
      return { items: rows.map(toDTO), nextCursor: null };
    }

    const accountIds = toArray(params.accountId);
    const categoryIds = toArray(params.categoryId);
    const cursor = params.cursor ? decodeCursor(params.cursor) : null;

    // Build WHERE fragments. We use raw SQL here to support the trigram
    // `lower(note) ILIKE ...` predicate against the GIN index and keyset
    // cursor in one statement.
    const clauses: Prisma.Sql[] = [Prisma.sql`t.household_id = ${householdId}`];
    if (!includeDeleted) clauses.push(Prisma.sql`t.deleted_at IS NULL`);
    if (accountIds.length > 0) clauses.push(Prisma.sql`t.account_id IN (${Prisma.join(accountIds)})`);
    if (categoryIds.length > 0) clauses.push(Prisma.sql`t.category_id IN (${Prisma.join(categoryIds)})`);
    if (params.type) clauses.push(Prisma.sql`t.type = ${params.type}`);
    if (params.from) clauses.push(Prisma.sql`t.occurred_at >= ${new Date(params.from)}`);
    if (params.to) clauses.push(Prisma.sql`t.occurred_at <= ${new Date(params.to)}`);
    if (params.q && params.q.trim().length > 0) {
      const q = `%${params.q.trim().toLowerCase()}%`;
      clauses.push(Prisma.sql`t.note IS NOT NULL AND lower(t.note) LIKE ${q}`);
    }
    if (cursor) {
      // Keyset: rows strictly AFTER (occurredAt DESC, id DESC) — i.e. smaller.
      clauses.push(
        Prisma.sql`(t.occurred_at, t.id) < (${cursor.occurredAt}::timestamptz, ${cursor.id})`,
      );
    }

    const whereSql = Prisma.sql`${Prisma.join(clauses, ' AND ')}`;
    const rows = await this.prisma.$queryRaw<TransactionRawRow[]>`
      SELECT t.id, t.household_id, t.account_id, t.category_id, t.type,
             t.amount_minor, t.currency_code, t.occurred_at, t.note, t.transfer_id,
             t.deleted_at, t.created_at, t.updated_at
        FROM transactions t
       WHERE ${whereSql}
       ORDER BY t.occurred_at DESC, t.id DESC
       LIMIT ${limit + 1}
    `;

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({ occurredAt: last.occurred_at.toISOString(), id: last.id })
        : null;

    return { items: page.map(rawToDTO), nextCursor };
  }

  async get(id: string): Promise<TransactionDTO> {
    const row = await this.findOrThrow(id);
    return toDTO(row);
  }

  // ---- create ----

  async create(input: CreateInput): Promise<TransactionDTO> {
    this.assertRole(WRITE_ROLE);
    const householdId = getHouseholdOrThrow();
    const { row, pushes } = await this.prisma.$transaction(async (tx) => {
      const created = await this.createWithin(tx, input);
      const p = await this.budgets.evaluateForTransactionMutation(
        tx,
        householdId,
        [created.categoryId],
        [created.currencyCode],
      );
      return { row: created, pushes: p };
    });
    await this.budgets.flushPushQueue(pushes);
    return toDTO(row);
  }

  async bulkCreate(items: CreateInput[]): Promise<{ items: TransactionDTO[] }> {
    this.assertRole(WRITE_ROLE);
    const householdId = getHouseholdOrThrow();
    const { created, pushes } = await this.prisma.$transaction(async (tx) => {
      const out: TransactionRow[] = [];
      for (const it of items) {
        out.push(await this.createWithin(tx, it));
      }
      const cats = out.map((r) => r.categoryId);
      const currencies = out.map((r) => r.currencyCode);
      const p = await this.budgets.evaluateForTransactionMutation(
        tx,
        householdId,
        cats,
        currencies,
      );
      return { created: out, pushes: p };
    });
    await this.budgets.flushPushQueue(pushes);
    return { items: created.map(toDTO) };
  }

  private async createWithin(
    tx: Prisma.TransactionClient,
    input: CreateInput,
  ): Promise<TransactionRow> {
    const householdId = getHouseholdOrThrow();
    const { userId } = getAuthOrThrow();

    if (input.type === 'TRANSFER') {
      throw Errors.validation('Use POST /transfers to create a transfer.', {
        field: 'type',
        expected: 'INCOME | EXPENSE',
      });
    }

    const currencyCode = input.currencyCode.toUpperCase();

    const account = await tx.account.findFirst({
      where: { id: input.accountId, householdId, deletedAt: null },
    });
    if (!account) throw Errors.notFound();
    if (account.archivedAt) throw Errors.accountArchived();
    if (account.currencyCode !== currencyCode) {
      throw Errors.transactionCurrencyMismatch(account.currencyCode, currencyCode);
    }

    const category = await tx.category.findFirst({
      where: {
        id: input.categoryId,
        deletedAt: null,
        OR: [{ householdId: null }, { householdId }],
      },
    });
    if (!category) {
      throw Errors.validation('Category not found.', { field: 'categoryId', reason: 'missing' });
    }
    if (category.archivedAt) {
      throw Errors.validation('Category is archived.', { field: 'categoryId', reason: 'archived' });
    }
    if (category.type !== input.type) {
      throw Errors.validation('Category type does not match transaction type.', {
        field: 'categoryId',
        expected: input.type,
      });
    }

    const amount = BigInt(input.amountMinor);
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    const id = newId();

    const row = await tx.transaction.create({
      data: {
        id,
        householdId,
        accountId: input.accountId,
        categoryId: input.categoryId,
        type: input.type,
        amountMinor: amount,
        currencyCode,
        occurredAt,
        note: normalizeNote(input.note),
        transferId: null,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    const signed = input.type === 'INCOME' ? amount : -amount;
    await this.balance.applyDelta(tx, input.accountId, signed, occurredAt);

    await recordEvent(tx, householdId, userId, 'transaction.created', {
      transactionId: row.id,
      accountId: row.accountId,
      categoryId: row.categoryId,
      type: row.type,
      amountMinor: row.amountMinor.toString(),
      currencyCode: row.currencyCode,
      occurredAt: row.occurredAt.toISOString(),
      transferId: null,
    });

    return row;
  }

  // ---- update ----

  async update(
    id: string,
    patch: {
      accountId?: string;
      categoryId?: string;
      amountMinor?: string;
      occurredAt?: string;
      note?: string | null;
      type?: string;
      currencyCode?: string;
      transferId?: string;
    },
  ): Promise<TransactionDTO> {
    this.assertRole(WRITE_ROLE);
    const { userId } = getAuthOrThrow();
    const householdId = getHouseholdOrThrow();

    if (patch.type !== undefined) {
      throw Errors.validation('type is immutable.', { field: 'type' });
    }
    if (patch.currencyCode !== undefined) {
      throw Errors.validation('currencyCode is immutable.', { field: 'currencyCode' });
    }
    if (patch.transferId !== undefined) {
      throw Errors.validation('transferId is immutable.', { field: 'transferId' });
    }

    const existing = await this.findOrThrow(id);
    if (existing.transferId) throw Errors.transactionBelongsToTransfer();

    const { updated, pushes } = await this.prisma.$transaction(async (tx) => {
      const changed: string[] = [];
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};

      // Resolve new vs old account + amount to compute balance deltas.
      const newAccountId = patch.accountId ?? existing.accountId;
      const newAmount =
        patch.amountMinor !== undefined ? BigInt(patch.amountMinor) : existing.amountMinor;
      const newOccurredAt = patch.occurredAt ? new Date(patch.occurredAt) : existing.occurredAt;

      // Account change validation
      let newAccount = null as null | { id: string; currencyCode: string; archivedAt: Date | null };
      if (patch.accountId && patch.accountId !== existing.accountId) {
        const acct = await tx.account.findFirst({
          where: { id: patch.accountId, householdId, deletedAt: null },
        });
        if (!acct) throw Errors.notFound();
        if (acct.archivedAt) throw Errors.accountArchived();
        if (acct.currencyCode !== existing.currencyCode) {
          throw Errors.transactionCurrencyMismatch(existing.currencyCode, acct.currencyCode);
        }
        newAccount = acct;
      }

      // Category change validation
      if (patch.categoryId && patch.categoryId !== existing.categoryId) {
        const cat = await tx.category.findFirst({
          where: {
            id: patch.categoryId,
            deletedAt: null,
            OR: [{ householdId: null }, { householdId }],
          },
        });
        if (!cat) {
          throw Errors.validation('Category not found.', {
            field: 'categoryId',
            reason: 'missing',
          });
        }
        if (cat.archivedAt) {
          throw Errors.validation('Category is archived.', {
            field: 'categoryId',
            reason: 'archived',
          });
        }
        if (cat.type !== existing.type) {
          throw Errors.validation('Category type does not match transaction type.', {
            field: 'categoryId',
            expected: existing.type,
          });
        }
      }

      // Apply balance math.
      const oldSignedForOld =
        existing.type === 'INCOME' ? existing.amountMinor : -existing.amountMinor;
      const newSignedForNew = existing.type === 'INCOME' ? newAmount : -newAmount;

      const accountChanged = newAccountId !== existing.accountId;
      const amountChanged = newAmount !== existing.amountMinor;
      const occurredChanged = newOccurredAt.getTime() !== existing.occurredAt.getTime();

      if (accountChanged || amountChanged || occurredChanged) {
        // Reverse old on old account (only if it previously applied).
        await this.balance.applyDelta(
          tx,
          existing.accountId,
          -oldSignedForOld,
          existing.occurredAt,
        );
        // Apply new on new account.
        await this.balance.applyDelta(tx, newAccountId, newSignedForNew, newOccurredAt);
      }

      const data: Prisma.TransactionUpdateInput = { updatedBy: userId };
      if (patch.accountId && patch.accountId !== existing.accountId) {
        data.account = { connect: { id: patch.accountId } };
        changed.push('accountId');
        before.accountId = existing.accountId;
        after.accountId = patch.accountId;
      }
      if (patch.categoryId && patch.categoryId !== existing.categoryId) {
        data.category = { connect: { id: patch.categoryId } };
        changed.push('categoryId');
        before.categoryId = existing.categoryId;
        after.categoryId = patch.categoryId;
      }
      if (amountChanged) {
        data.amountMinor = newAmount;
        changed.push('amountMinor');
        before.amountMinor = existing.amountMinor.toString();
        after.amountMinor = newAmount.toString();
      }
      if (occurredChanged) {
        data.occurredAt = newOccurredAt;
        changed.push('occurredAt');
        before.occurredAt = existing.occurredAt.toISOString();
        after.occurredAt = newOccurredAt.toISOString();
      }
      if (patch.note !== undefined) {
        const newNote = normalizeNote(patch.note);
        if (newNote !== existing.note) {
          data.note = newNote;
          changed.push('note');
          before.note = existing.note;
          after.note = newNote;
        }
      }

      const row = await tx.transaction.update({ where: { id }, data });

      if (changed.length > 0) {
        await recordEvent(tx, householdId, userId, 'transaction.updated', {
          transactionId: id,
          changedFields: changed,
          before,
          after,
        });
      }
      void newAccount;
      const p = await this.budgets.evaluateForTransactionMutation(
        tx,
        householdId,
        [existing.categoryId, row.categoryId],
        [existing.currencyCode, row.currencyCode],
      );
      return { updated: row, pushes: p };
    });

    await this.budgets.flushPushQueue(pushes);
    return toDTO(updated);
  }

  // ---- delete / restore ----

  async softDelete(id: string): Promise<TransactionDTO> {
    this.assertRole(WRITE_ROLE);
    const { userId } = getAuthOrThrow();

    const existing = await this.findOrThrow(id);
    if (existing.transferId) throw Errors.transactionBelongsToTransfer();
    if (existing.deletedAt) return toDTO(existing);

    const { updated, pushes } = await this.prisma.$transaction(async (tx) => {
      const signed = existing.type === 'INCOME' ? existing.amountMinor : -existing.amountMinor;
      // Reverse.
      await this.balance.applyDelta(tx, existing.accountId, -signed, existing.occurredAt);

      const row = await tx.transaction.update({
        where: { id },
        data: { deletedAt: new Date(), updatedBy: userId },
      });
      await recordEvent(tx, existing.householdId, userId, 'transaction.deleted', {
        transactionId: id,
        accountId: existing.accountId,
        amountMinor: existing.amountMinor.toString(),
        type: existing.type,
      });
      const p = await this.budgets.evaluateForTransactionMutation(
        tx,
        existing.householdId,
        [existing.categoryId],
        [existing.currencyCode],
      );
      return { updated: row, pushes: p };
    });
    await this.budgets.flushPushQueue(pushes);
    return toDTO(updated);
  }

  async restore(id: string): Promise<TransactionDTO> {
    this.assertRole(WRITE_ROLE);
    const { userId } = getAuthOrThrow();
    const householdId = getHouseholdOrThrow();

    const existing = await this.prisma.transaction.findFirst({
      where: { id, householdId },
    });
    if (!existing) throw Errors.notFound();
    if (!existing.deletedAt) return toDTO(existing);
    if (existing.transferId) throw Errors.transactionBelongsToTransfer();

    const { updated, pushes } = await this.prisma.$transaction(async (tx) => {
      const account = await tx.account.findFirst({
        where: { id: existing.accountId, householdId, deletedAt: null },
      });
      if (!account) throw Errors.notFound();
      if (account.archivedAt) throw Errors.accountArchived();

      const signed = existing.type === 'INCOME' ? existing.amountMinor : -existing.amountMinor;
      await this.balance.applyDelta(tx, existing.accountId, signed, existing.occurredAt);

      const row = await tx.transaction.update({
        where: { id },
        data: { deletedAt: null, updatedBy: userId },
      });
      await recordEvent(tx, householdId, userId, 'transaction.restored', {
        transactionId: id,
        accountId: existing.accountId,
        amountMinor: existing.amountMinor.toString(),
        type: existing.type,
      });
      const p = await this.budgets.evaluateForTransactionMutation(
        tx,
        householdId,
        [existing.categoryId],
        [existing.currencyCode],
      );
      return { updated: row, pushes: p };
    });
    await this.budgets.flushPushQueue(pushes);
    return toDTO(updated);
  }

  // ---- aggregates (Phase 4) ----

  /**
   * Period income/expense/net/count, per currency, for the household. Excludes
   * TRANSFER pair-rows (transfer_id IS NOT NULL OR type = 'TRANSFER') and
   * soft-deleted rows. Any role may call.
   *
   * Precedence per Phase 4 spec §4: if both `period` and `from`/`to` are
   * supplied the server rejects with VALIDATION_ERROR; if neither is given,
   * defaults to `period=month`.
   */
  async periodSummary(q: {
    period?: 'day' | 'week' | 'month' | 'year';
    from?: string;
    to?: string;
  }): Promise<{
    byCurrency: Array<{
      currencyCode: string;
      incomeMinor: string;
      expenseMinor: string;
      netMinor: string;
      transactionCount: number;
    }>;
    period: { from: string; to: string };
  }> {
    const householdId = getHouseholdOrThrow();

    const hasPeriod = q.period !== undefined;
    const hasFromTo = q.from !== undefined || q.to !== undefined;
    if (hasPeriod && hasFromTo) {
      throw Errors.validation(
        'Specify either `period` or `from`+`to`, not both.',
      );
    }

    let from: Date;
    let to: Date;
    if (hasFromTo) {
      if (!q.from || !q.to) {
        throw Errors.validation('`from` and `to` must be supplied together.');
      }
      from = new Date(q.from);
      to = new Date(q.to);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        throw Errors.validation('Invalid `from` or `to` datetime.');
      }
      if (!(from < to)) {
        throw Errors.validation('`from` must be strictly before `to`.');
      }
      const nowPlusSkew = Date.now() + 60_000;
      if (to.getTime() > nowPlusSkew) {
        throw Errors.validation('`to` must not exceed now()+1min.');
      }
      const span = to.getTime() - from.getTime();
      if (span > 366 * 24 * 60 * 60 * 1000) {
        throw Errors.validation('Custom range span must be ≤ 366 days.');
      }
    } else {
      const now = new Date();
      const period = q.period ?? 'month';
      from = startOfPeriodUTC(now, period);
      to = now;
    }

    type Row = {
      currency_code: string;
      income_minor: bigint;
      expense_minor: bigint;
      transaction_count: number;
    };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT
        currency_code,
        COALESCE(SUM(amount_minor) FILTER (
          WHERE type = 'INCOME'  AND deleted_at IS NULL AND transfer_id IS NULL
        ), 0)::bigint AS income_minor,
        COALESCE(SUM(amount_minor) FILTER (
          WHERE type = 'EXPENSE' AND deleted_at IS NULL AND transfer_id IS NULL
        ), 0)::bigint AS expense_minor,
        COALESCE(COUNT(*) FILTER (
          WHERE deleted_at IS NULL AND transfer_id IS NULL AND type IN ('INCOME','EXPENSE')
        ), 0)::int AS transaction_count
      FROM transactions
      WHERE household_id = ${householdId}
        AND occurred_at >= ${from}
        AND occurred_at <  ${to}
      GROUP BY currency_code
      ORDER BY currency_code ASC
    `;

    const byCurrency = rows
      // Drop currencies where the group is all-transfers (count=0, sums=0).
      .filter((r) => r.transaction_count > 0 || r.income_minor !== 0n || r.expense_minor !== 0n)
      .map((r) => {
        const income = r.income_minor;
        const expense = r.expense_minor;
        return {
          currencyCode: r.currency_code,
          incomeMinor: income.toString(),
          expenseMinor: expense.toString(),
          netMinor: (income - expense).toString(),
          transactionCount: Number(r.transaction_count),
        };
      });

    return {
      byCurrency,
      period: { from: from.toISOString(), to: to.toISOString() },
    };
  }

  // ---- helpers ----

  async findOrThrow(id: string): Promise<TransactionRow> {
    const householdId = getHouseholdOrThrow();
    const row = await this.prisma.transaction.findFirst({
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

type CreateInput = {
  accountId: string;
  categoryId: string;
  type: TxType;
  amountMinor: string;
  currencyCode: string;
  occurredAt?: string;
  note?: string | null;
};

type TransactionRawRow = {
  id: string;
  household_id: string;
  account_id: string;
  category_id: string;
  type: string;
  amount_minor: bigint;
  currency_code: string;
  occurred_at: Date;
  note: string | null;
  transfer_id: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function toArray(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * Start-of-period instant in UTC for the named windows. Matches Phase 4 spec:
 * - day   → today 00:00Z
 * - week  → this ISO-week Monday 00:00Z
 * - month → first-of-month 00:00Z
 * - year  → Jan 1 00:00Z
 */
function startOfPeriodUTC(now: Date, period: 'day' | 'week' | 'month' | 'year'): Date {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  switch (period) {
    case 'day':
      return new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
    case 'month':
      return new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
    case 'year':
      return new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0));
    case 'week': {
      // ISO week: Monday-start. getUTCDay: 0=Sun..6=Sat; Monday offset = (dow+6)%7.
      const dow = now.getUTCDay();
      const mondayOffset = (dow + 6) % 7;
      return new Date(Date.UTC(y, m, d - mondayOffset, 0, 0, 0, 0));
    }
  }
}

function normalizeNote(n: string | null | undefined): string | null {
  if (n === undefined || n === null) return null;
  const trimmed = n.trim();
  return trimmed.length === 0 ? null : trimmed;
}

type Cursor = { occurredAt: string; id: string };

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

function decodeCursor(s: string): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as Cursor).occurredAt === 'string' &&
      typeof (parsed as Cursor).id === 'string'
    ) {
      return parsed as Cursor;
    }
    return null;
  } catch {
    return null;
  }
}

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

export function toDTO(row: TransactionRow): TransactionDTO {
  return {
    id: row.id,
    householdId: row.householdId,
    accountId: row.accountId,
    categoryId: row.categoryId,
    type: row.type as TransactionDTO['type'],
    amountMinor: row.amountMinor.toString(),
    currencyCode: row.currencyCode,
    occurredAt: row.occurredAt.toISOString(),
    note: row.note,
    transferId: row.transferId,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rawToDTO(r: TransactionRawRow): TransactionDTO {
  return {
    id: r.id,
    householdId: r.household_id,
    accountId: r.account_id,
    categoryId: r.category_id,
    type: r.type as TransactionDTO['type'],
    amountMinor: r.amount_minor.toString(),
    currencyCode: r.currency_code,
    occurredAt: r.occurred_at.toISOString(),
    note: r.note,
    transferId: r.transfer_id,
    deletedAt: r.deleted_at ? r.deleted_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}
