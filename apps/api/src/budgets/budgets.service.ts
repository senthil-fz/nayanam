import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type Budget as BudgetRow } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Errors } from '../common/errors';
import { newId } from '../common/ids';
import {
  getAuthOrThrow,
  getContext,
  getHouseholdOrThrow,
  requestContext,
} from '../common/context';
import { roleAtLeast, type HouseholdRole } from '../common/household-header.guard';
import { isSupportedCurrency } from '../common/currencies';
import { PushNotificationsService } from '../bills/push-notifications.service';
import {
  currentPeriodEnd,
  currentPeriodStart,
  previousPeriodStart,
  type BudgetPeriod,
} from '../common/period';
import {
  THRESHOLD_LADDER,
  computeHistoricalSpent,
  computeSpent,
  pendingThresholds,
  progressPercent,
  type AnyTx,
} from './spent';
import type {
  BudgetDTO,
  BudgetHistoryResponseDTO,
  BudgetStatusItemDTO,
  BudgetSuggestionsResponseDTO,
  BudgetsStatusResponseDTO,
} from './budgets.dto';

const VIEWER: HouseholdRole = 'VIEWER';
const MEMBER: HouseholdRole = 'MEMBER';
const ADMIN: HouseholdRole = 'ADMIN';

/** Round-up-to-next-1000 helper for suggestions (documented in §7). */
const SUGGESTION_BUMP_PCT = 110n; // × 1.10
const SUGGESTION_ROUND_MINOR = 1000n; // next 10 major units

type ThresholdPushPayload = {
  userId: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
};

@Injectable()
export class BudgetsService {
  private readonly logger = new Logger(BudgetsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushNotificationsService,
  ) {}

  // ---- reads ----

  async list(params: {
    cursor?: string;
    limit?: number;
    scope?: 'HOUSEHOLD' | 'CATEGORY';
    status?: 'ACTIVE' | 'PAUSED';
    includeArchived?: boolean;
  }): Promise<{ items: BudgetDTO[]; nextCursor: string | null }> {
    this.assertRole(VIEWER);
    const householdId = getHouseholdOrThrow();
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);

    const where: Prisma.BudgetWhereInput = {
      householdId,
      deletedAt: null,
      ...(params.includeArchived ? {} : { archivedAt: null }),
      ...(params.scope ? { scope: params.scope } : {}),
      ...(params.status ? { status: params.status } : {}),
    };

    const rows = await this.prisma.budget.findMany({
      where,
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;
    return { items: page.map(budgetToDTO), nextCursor };
  }

  async get(id: string): Promise<BudgetDTO> {
    this.assertRole(VIEWER);
    const row = await this.findActiveOrThrow(id);
    return budgetToDTO(row);
  }

  // ---- create ----

  async create(input: {
    name: string;
    scope: 'HOUSEHOLD' | 'CATEGORY';
    categoryId?: string | null;
    amountMinor: string;
    currencyCode: string;
    period: 'WEEKLY' | 'MONTHLY';
    rollover?: boolean;
    startAt?: string;
    endAt?: string | null;
    displayOrder?: number;
  }): Promise<BudgetDTO> {
    this.assertRole(MEMBER);
    const householdId = getHouseholdOrThrow();
    const { userId } = getAuthOrThrow();

    const currencyCode = input.currencyCode.toUpperCase();
    if (!isSupportedCurrency(currencyCode)) {
      throw Errors.currencyUnsupported(currencyCode);
    }

    // Scope ↔ categoryId coupling (service-layer counterpart to the DB CHECK).
    const categoryId = input.categoryId ?? null;
    if (input.scope === 'HOUSEHOLD' && categoryId !== null) {
      throw Errors.budgetCategoryForbidden();
    }
    if (input.scope === 'CATEGORY' && categoryId === null) {
      throw Errors.budgetCategoryRequired();
    }

    const amount = BigInt(input.amountMinor);
    if (amount <= 0n) throw Errors.validation('amountMinor must be > 0.');

    const startAt = input.startAt ? new Date(input.startAt) : new Date();
    const endAt = input.endAt ? new Date(input.endAt) : null;
    if (endAt && endAt.getTime() <= startAt.getTime()) {
      throw Errors.validation('endAt must be strictly after startAt.');
    }

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        if (categoryId) {
          const cat = await tx.category.findFirst({
            where: {
              id: categoryId,
              deletedAt: null,
              OR: [{ householdId: null }, { householdId }],
            },
          });
          if (!cat) throw Errors.notFound();
          if (cat.archivedAt) throw Errors.budgetCategoryArchived();
          if (cat.type !== 'EXPENSE') throw Errors.budgetCategoryTypeInvalid();
        }

        const maxOrder = await tx.budget.aggregate({
          where: { householdId, deletedAt: null },
          _max: { displayOrder: true },
        });
        const displayOrder =
          input.displayOrder ?? (maxOrder._max.displayOrder ?? -1) + 1;

        const id = newId();
        const now = new Date();
        const created = await tx.budget.create({
          data: {
            id,
            householdId,
            name: input.name.trim(),
            scope: input.scope,
            categoryId,
            amountMinor: amount,
            currencyCode,
            period: input.period,
            rollover: input.rollover ?? false,
            status: 'ACTIVE',
            startAt,
            endAt,
            displayOrder,
            createdBy: userId,
            updatedBy: userId,
            createdAt: now,
            updatedAt: now,
          },
        });

        await recordEvent(tx, householdId, userId, 'budget.created', {
          budgetId: created.id,
          scope: created.scope,
          categoryId: created.categoryId,
          amountMinor: created.amountMinor.toString(),
          currencyCode: created.currencyCode,
          period: created.period,
          rollover: created.rollover,
        });

        // Immediately evaluate thresholds for the brand-new budget (edge case
        // where the first period already has enough spend to breach one).
        const pushes = await this.evaluateBudgetThresholds(
          tx,
          created,
          userId,
          new Date(),
        );
        void pushes;
        return created;
      });
      return budgetToDTO(row);
    } catch (err) {
      throw mapUniqueViolation(err);
    }
  }

  // ---- update ----

  async update(
    id: string,
    patch: {
      name?: string;
      amountMinor?: string;
      rollover?: boolean;
      endAt?: string | null;
      displayOrder?: number;
      // Immutable — reject with specific codes.
      scope?: string;
      categoryId?: string | null;
      currencyCode?: string;
      period?: string;
      startAt?: string;
      status?: string;
    },
  ): Promise<BudgetDTO> {
    this.assertRole(MEMBER);
    const { userId } = getAuthOrThrow();
    const householdId = getHouseholdOrThrow();

    if (patch.scope !== undefined || patch.categoryId !== undefined || patch.startAt !== undefined) {
      throw Errors.budgetScopeImmutable();
    }
    if (patch.currencyCode !== undefined) throw Errors.budgetCurrencyImmutable();
    if (patch.period !== undefined) throw Errors.budgetPeriodImmutable();
    if (patch.status !== undefined) {
      throw Errors.validation('status is changed via /pause or /resume.', {
        field: 'status',
      });
    }

    const existing = await this.findActiveOrThrow(id);
    if (existing.archivedAt) {
      throw Errors.conflict('Budget is archived; restore it before editing.');
    }

    const pushQueue: ThresholdPushPayload[] = [];
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed: string[] = [];
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      const data: Prisma.BudgetUpdateInput = {
        updatedBy: userId,
        updatedAt: new Date(),
      };

      if (patch.name !== undefined && patch.name.trim() !== existing.name) {
        data.name = patch.name.trim();
        changed.push('name');
        before.name = existing.name;
        after.name = patch.name.trim();
      }
      let thresholdsMayFire = false;
      if (patch.amountMinor !== undefined) {
        const a = BigInt(patch.amountMinor);
        if (a <= 0n) throw Errors.validation('amountMinor must be > 0.');
        if (a !== existing.amountMinor) {
          data.amountMinor = a;
          changed.push('amountMinor');
          before.amountMinor = existing.amountMinor.toString();
          after.amountMinor = a.toString();
          thresholdsMayFire = true;
        }
      }
      if (patch.rollover !== undefined && patch.rollover !== existing.rollover) {
        data.rollover = patch.rollover;
        changed.push('rollover');
        before.rollover = existing.rollover;
        after.rollover = patch.rollover;
        thresholdsMayFire = true;
      }
      if (patch.endAt !== undefined) {
        const endAt = patch.endAt === null ? null : new Date(patch.endAt);
        if (endAt && endAt.getTime() <= existing.startAt.getTime()) {
          throw Errors.validation('endAt must be strictly after startAt.');
        }
        if ((existing.endAt?.getTime() ?? null) !== (endAt?.getTime() ?? null)) {
          data.endAt = endAt;
          changed.push('endAt');
          before.endAt = existing.endAt ? existing.endAt.toISOString() : null;
          after.endAt = endAt ? endAt.toISOString() : null;
        }
      }
      if (
        patch.displayOrder !== undefined &&
        patch.displayOrder !== existing.displayOrder
      ) {
        data.displayOrder = patch.displayOrder;
        changed.push('displayOrder');
        before.displayOrder = existing.displayOrder;
        after.displayOrder = patch.displayOrder;
      }

      const row = await tx.budget.update({ where: { id }, data });

      if (changed.length > 0) {
        await recordEvent(tx, householdId, userId, 'budget.updated', {
          budgetId: id,
          changedFields: changed,
          before,
          after,
        });
      }

      if (thresholdsMayFire && row.status === 'ACTIVE' && !row.archivedAt) {
        const pushes = await this.evaluateBudgetThresholds(tx, row, userId, new Date());
        pushQueue.push(...pushes);
      }

      return row;
    });

    // Best-effort push dispatch after the mutation transaction commits.
    await this.flushPushQueue(pushQueue);
    return budgetToDTO(updated);
  }

  // ---- archive / restore ----

  async archive(id: string): Promise<BudgetDTO> {
    this.assertRole(ADMIN);
    const { userId } = getAuthOrThrow();
    const householdId = getHouseholdOrThrow();
    const existing = await this.findActiveOrThrow(id);
    if (existing.archivedAt) return budgetToDTO(existing);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.budget.update({
        where: { id },
        data: { archivedAt: new Date(), updatedBy: userId },
      });
      await recordEvent(tx, householdId, userId, 'budget.archived', {
        budgetId: id,
      });
      return row;
    });
    return budgetToDTO(updated);
  }

  async restore(id: string): Promise<BudgetDTO> {
    this.assertRole(ADMIN);
    const { userId } = getAuthOrThrow();
    const householdId = getHouseholdOrThrow();

    const existing = await this.prisma.budget.findFirst({
      where: { id, householdId, deletedAt: null },
    });
    if (!existing) throw Errors.notFound();
    if (!existing.archivedAt) return budgetToDTO(existing);

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const row = await tx.budget.update({
          where: { id },
          data: { archivedAt: null, updatedBy: userId },
        });
        await recordEvent(tx, householdId, userId, 'budget.restored', {
          budgetId: id,
        });
        return row;
      });
      return budgetToDTO(updated);
    } catch (err) {
      throw mapUniqueViolation(err);
    }
  }

  // ---- pause / resume ----

  async pause(id: string): Promise<BudgetDTO> {
    this.assertRole(MEMBER);
    const { userId } = getAuthOrThrow();
    const householdId = getHouseholdOrThrow();
    const existing = await this.findActiveOrThrow(id);
    if (existing.archivedAt) {
      throw Errors.conflict('Budget is archived; restore it before pausing.');
    }
    if (existing.status === 'PAUSED') throw Errors.budgetAlreadyPaused();

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.budget.update({
        where: { id },
        data: { status: 'PAUSED', updatedBy: userId },
      });
      await recordEvent(tx, householdId, userId, 'budget.paused', {
        budgetId: id,
      });
      return row;
    });
    return budgetToDTO(updated);
  }

  async resume(id: string): Promise<BudgetDTO> {
    this.assertRole(MEMBER);
    const { userId } = getAuthOrThrow();
    const householdId = getHouseholdOrThrow();
    const existing = await this.findActiveOrThrow(id);
    if (existing.archivedAt) {
      throw Errors.conflict('Budget is archived; restore it before resuming.');
    }
    if (existing.status === 'ACTIVE') throw Errors.budgetAlreadyActive();

    const pushQueue: ThresholdPushPayload[] = [];
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.budget.update({
        where: { id },
        data: { status: 'ACTIVE', updatedBy: userId },
      });
      await recordEvent(tx, householdId, userId, 'budget.resumed', {
        budgetId: id,
      });
      const pushes = await this.evaluateBudgetThresholds(tx, row, userId, new Date());
      pushQueue.push(...pushes);
      return row;
    });

    await this.flushPushQueue(pushQueue);
    return budgetToDTO(updated);
  }

  // ---- reorder ----

  async reorder(
    entries: Array<{ id: string; displayOrder: number }>,
  ): Promise<{ items: BudgetDTO[] }> {
    this.assertRole(ADMIN);
    const householdId = getHouseholdOrThrow();
    const { userId } = getAuthOrThrow();

    const active = await this.prisma.budget.findMany({
      where: { householdId, deletedAt: null, archivedAt: null },
      select: { id: true },
    });
    const activeIds = new Set(active.map((a) => a.id));

    // Every id in the payload must belong to this household (active or archived).
    const known = await this.prisma.budget.findMany({
      where: { householdId, id: { in: entries.map((e) => e.id) } },
      select: { id: true },
    });
    const knownSet = new Set(known.map((k) => k.id));
    const foreign = entries.filter((e) => !knownSet.has(e.id));
    if (foreign.length > 0) {
      throw Errors.validation('Reorder payload contains ids not in this household.', {
        foreignIds: foreign.map((f) => f.id),
      });
    }

    const filtered = entries.filter((e) => activeIds.has(e.id));
    filtered.sort((a, b) => a.displayOrder - b.displayOrder);
    const ordered = filtered.map((e) => e.id);
    const remaining = active.map((a) => a.id).filter((aid) => !ordered.includes(aid));
    const finalOrder = [...ordered, ...remaining];

    const items = await this.prisma.$transaction(async (tx) => {
      await Promise.all(
        finalOrder.map((bid, idx) =>
          tx.budget.update({
            where: { id: bid },
            data: { displayOrder: idx, updatedBy: userId },
          }),
        ),
      );
      await recordEvent(tx, householdId, userId, 'budget.reordered', {
        order: finalOrder,
      });
      return tx.budget.findMany({
        where: { householdId, deletedAt: null, archivedAt: null },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      });
    });
    return { items: items.map(budgetToDTO) };
  }

  // ---- status ----

  async status(params: {
    scope?: 'HOUSEHOLD' | 'CATEGORY';
    includeArchived?: boolean;
    asOf?: string;
  }): Promise<BudgetsStatusResponseDTO> {
    this.assertRole(VIEWER);
    const householdId = getHouseholdOrThrow();

    const asOfDate = params.asOf ? new Date(params.asOf) : new Date();
    if (Number.isNaN(asOfDate.getTime())) {
      throw Errors.validation('Invalid asOf datetime.');
    }

    const rows = await this.prisma.budget.findMany({
      where: {
        householdId,
        deletedAt: null,
        status: 'ACTIVE',
        ...(params.includeArchived ? {} : { archivedAt: null }),
        ...(params.scope ? { scope: params.scope } : {}),
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      // Soft cap to protect the endpoint from pathological households.
      take: 200,
    });

    const items: BudgetStatusItemDTO[] = [];
    for (const b of rows) {
      const item = await this.computeStatusItem(this.prisma, b, asOfDate);
      items.push(item);
    }

    return { asOf: asOfDate.toISOString(), items };
  }

  // ---- suggestions ----

  async suggest(): Promise<BudgetSuggestionsResponseDTO> {
    this.assertRole(VIEWER);
    const householdId = getHouseholdOrThrow();

    const household = await this.prisma.household.findFirst({
      where: { id: householdId },
      select: { defaultCurrencyCode: true },
    });
    if (!household) throw Errors.notFound();

    const now = new Date();
    const lowerBound = new Date(now.getTime() - 30 * 86_400_000);

    // Most-common transaction currency over last 30 days, falling back to
    // the household's default.
    type Row = { currency_code: string; count: bigint };
    const currencyRows = await this.prisma.$queryRaw<Row[]>`
      SELECT currency_code, COUNT(*)::bigint AS count
        FROM transactions
       WHERE household_id = ${householdId}
         AND deleted_at IS NULL
         AND type = 'EXPENSE'
         AND transfer_id IS NULL
         AND occurred_at >= ${lowerBound}
       GROUP BY currency_code
       ORDER BY count DESC
    `;
    const currencyCode =
      currencyRows[0]?.currency_code ?? household.defaultCurrencyCode;

    // Trailing-30d spend per category in that currency, excluding archived
    // categories and categories that already have an active non-archived
    // budget in the same currency.
    type SpendRow = {
      category_id: string;
      label: string;
      category_type: string;
      archived_at: Date | null;
      spend_minor: bigint;
    };
    const spendRows = await this.prisma.$queryRaw<SpendRow[]>`
      SELECT c.id AS category_id,
             c.label,
             c.type AS category_type,
             c.archived_at,
             COALESCE(SUM(t.amount_minor), 0)::bigint AS spend_minor
        FROM transactions t
        JOIN categories c ON c.id = t.category_id
       WHERE t.household_id = ${householdId}
         AND t.deleted_at IS NULL
         AND t.type = 'EXPENSE'
         AND t.transfer_id IS NULL
         AND t.currency_code = ${currencyCode}
         AND t.occurred_at >= ${lowerBound}
         AND c.type = 'EXPENSE'
         AND c.deleted_at IS NULL
         AND c.archived_at IS NULL
       GROUP BY c.id, c.label, c.type, c.archived_at
       ORDER BY spend_minor DESC
       LIMIT 25
    `;

    // Filter out categories that already have an active budget in this currency.
    const categoryIds = spendRows.map((r) => r.category_id);
    const existing =
      categoryIds.length === 0
        ? []
        : await this.prisma.budget.findMany({
            where: {
              householdId,
              deletedAt: null,
              archivedAt: null,
              scope: 'CATEGORY',
              currencyCode,
              categoryId: { in: categoryIds },
            },
            select: { categoryId: true },
          });
    const taken = new Set(existing.map((e) => e.categoryId));

    const items = spendRows
      .filter((r) => !taken.has(r.category_id) && r.spend_minor > 0n)
      .slice(0, 5)
      .map((r) => {
        // × 1.10 then round UP to the next 1000 minor units.
        const scaled = (r.spend_minor * SUGGESTION_BUMP_PCT) / 100n;
        const remainder = scaled % SUGGESTION_ROUND_MINOR;
        const suggested =
          remainder === 0n ? scaled : scaled + (SUGGESTION_ROUND_MINOR - remainder);
        return {
          categoryId: r.category_id,
          categoryName: r.label,
          suggestedAmountMinor: suggested.toString(),
          currencyCode,
        };
      });

    return { items };
  }

  // ---- history ----

  async history(
    id: string,
    periodsWanted: number,
  ): Promise<BudgetHistoryResponseDTO> {
    this.assertRole(VIEWER);
    const householdId = getHouseholdOrThrow();
    const n = Math.max(1, Math.min(24, Math.floor(periodsWanted)));

    const budget = await this.prisma.budget.findFirst({
      where: { id, householdId, deletedAt: null },
    });
    if (!budget) throw Errors.notFound();

    const now = new Date();
    const period = budget.period as BudgetPeriod;

    // Walk periods backwards: period[0] = current, period[1] = previous, etc.
    const boundaries: Array<{ periodStart: Date; periodEnd: Date }> = [];
    let cursorStart = currentPeriodStart(period, budget.startAt, now);
    let cursorEnd = currentPeriodEnd(period, budget.startAt, now);
    for (let i = 0; i < n; i += 1) {
      boundaries.push({ periodStart: cursorStart, periodEnd: cursorEnd });
      // Shift back one period.
      const newEnd = cursorStart;
      const newStart = previousPeriodStart(period, budget.startAt, cursorStart);
      cursorStart = newStart;
      cursorEnd = newEnd;
    }

    const firedMap = await fetchThresholdsFiredMap(
      this.prisma,
      id,
      boundaries.map((b) => b.periodStart),
    );

    const inputs = {
      householdId: budget.householdId,
      scope: budget.scope as 'HOUSEHOLD' | 'CATEGORY',
      categoryId: budget.categoryId,
      currencyCode: budget.currencyCode,
      period,
      startAt: budget.startAt,
      endAt: budget.endAt,
      amountMinor: budget.amountMinor,
      rollover: budget.rollover,
    };

    const outPeriods = await Promise.all(
      boundaries.map(async (b) => {
        const result = await computeHistoricalSpent(
          this.prisma,
          inputs,
          b.periodStart,
          b.periodEnd,
        );
        const fired =
          firedMap.get(b.periodStart.toISOString())?.slice().sort((a, z) => a - z) ?? [];
        return {
          periodStart: b.periodStart.toISOString(),
          periodEnd: b.periodEnd.toISOString(),
          effectiveAmountMinor: result.effectiveAmountMinor.toString(),
          spentMinor: result.spentMinor.toString(),
          remainingMinor: (result.effectiveAmountMinor - result.spentMinor).toString(),
          isOverspent: result.spentMinor > result.effectiveAmountMinor,
          thresholdsFired: fired,
        };
      }),
    );

    return { budgetId: id, periods: outPeriods };
  }

  // ---- real-time evaluation hook ----

  /**
   * Call AFTER a transaction mutation inside the same `$transaction`. Evaluates
   * all ACTIVE, non-archived budgets whose scope matches the mutation:
   *   - every HOUSEHOLD budget in the touched currencies, AND
   *   - every CATEGORY budget on the affected category ids.
   *
   * Inserts threshold rows via ON CONFLICT DO NOTHING. Emits events inline.
   * Returns a push queue for the caller to dispatch AFTER the outer commit —
   * pushes are best-effort and must not fail the mutation.
   */
  async evaluateForTransactionMutation(
    tx: Prisma.TransactionClient,
    householdId: string,
    affectedCategoryIds: Array<string | null>,
    currencyCodes: string[],
  ): Promise<ThresholdPushPayload[] | null> {
    const cats = Array.from(
      new Set(affectedCategoryIds.filter((c): c is string => !!c)),
    );
    const currencies = Array.from(new Set(currencyCodes));
    if (currencies.length === 0) return null;

    const budgets = await tx.budget.findMany({
      where: {
        householdId,
        deletedAt: null,
        archivedAt: null,
        status: 'ACTIVE',
        currencyCode: { in: currencies },
        OR: [{ scope: 'HOUSEHOLD' }, ...(cats.length > 0 ? [{ categoryId: { in: cats } }] : [])],
      },
    });
    if (budgets.length === 0) return [];

    const auth = getContext()?.auth;
    const now = new Date();
    const pushes: ThresholdPushPayload[] = [];
    for (const b of budgets) {
      const result = await this.evaluateBudgetThresholds(tx, b, auth?.userId ?? null, now);
      pushes.push(...result);
    }
    return pushes;
  }

  /**
   * Public helper: flush a push queue returned by `evaluateForTransactionMutation`.
   * Safe to call outside any transaction. Best-effort only; errors are logged.
   */
  async flushPushQueue(pushes: ThresholdPushPayload[] | null | undefined): Promise<void> {
    if (!pushes || pushes.length === 0) return;
    for (const p of pushes) {
      try {
        await this.push.send(p.userId, {
          title: p.title,
          body: p.body,
          data: p.data,
          sound: 'default',
          priority: 'high',
        });
      } catch (err: unknown) {
        this.logger.warn(`budget-threshold push failed user_id=${p.userId} error=${String(err)}`);
      }
    }
  }

  // ---- auto-archive on category archive ----

  /**
   * Called from `CategoriesService.archive` inside the same `$transaction`.
   * Soft-archives every ACTIVE, non-archived budget tied to the category and
   * emits `budget.auto_archived` per archived budget. Notifications to household
   * members are written in the same tx so the user knows why.
   *
   * Actor id: propagated from ALS when present (the mutation runner); null when
   * called by a system path.
   */
  async autoArchiveForCategory(
    tx: Prisma.TransactionClient,
    householdId: string,
    categoryId: string,
    actorUserId: string | null,
  ): Promise<{ archivedBudgetIds: string[] }> {
    const rows = await tx.budget.findMany({
      where: {
        householdId,
        deletedAt: null,
        archivedAt: null,
        categoryId,
        scope: 'CATEGORY',
      },
      select: { id: true, name: true },
    });
    if (rows.length === 0) return { archivedBudgetIds: [] };

    const now = new Date();
    const archivedIds: string[] = [];
    for (const b of rows) {
      await tx.budget.update({
        where: { id: b.id },
        data: { archivedAt: now, updatedBy: actorUserId ?? b.id },
      });
      archivedIds.push(b.id);
      await recordEvent(tx, householdId, null, 'budget.auto_archived', {
        budgetId: b.id,
        reason: 'CATEGORY_ARCHIVED',
        categoryId,
      });
    }

    // Per-member notifications so users understand why a budget vanished.
    const members = await tx.householdMember.findMany({
      where: { householdId },
      select: { userId: true },
    });
    for (const b of rows) {
      for (const m of members) {
        await tx.notification.create({
          data: {
            id: newId(),
            userId: m.userId,
            householdId,
            type: 'budget.auto_archived',
            payload: {
              budgetId: b.id,
              name: b.name,
              categoryId,
              reason: 'CATEGORY_ARCHIVED',
            },
          },
        });
      }
    }
    return { archivedBudgetIds: archivedIds };
  }

  // ---- internal helpers ----

  /**
   * Evaluate one budget in the current period. Writes threshold rows + per-user
   * notifications + events inside `tx` via ON CONFLICT DO NOTHING. Returns the
   * push queue — caller dispatches AFTER commit.
   */
  async evaluateBudgetThresholds(
    tx: Prisma.TransactionClient,
    budget: BudgetRow,
    actorUserId: string | null,
    now: Date,
  ): Promise<ThresholdPushPayload[]> {
    if (budget.status !== 'ACTIVE' || budget.archivedAt || budget.deletedAt) return [];
    if (budget.endAt && now.getTime() >= budget.endAt.getTime()) return [];

    const inputs = {
      householdId: budget.householdId,
      scope: budget.scope as 'HOUSEHOLD' | 'CATEGORY',
      categoryId: budget.categoryId,
      currencyCode: budget.currencyCode,
      period: budget.period as BudgetPeriod,
      startAt: budget.startAt,
      endAt: budget.endAt,
      amountMinor: budget.amountMinor,
      rollover: budget.rollover,
    };

    const result = await computeSpent(tx, inputs, now);
    const progress = progressPercent(result.spentMinor, result.effectiveAmountMinor);

    const alreadyFired = await tx.budgetThresholdNotification.findMany({
      where: { budgetId: budget.id, periodStart: result.periodStart },
      select: { thresholdPercent: true },
    });
    const firedSet = new Set(alreadyFired.map((r) => r.thresholdPercent));
    const pending = pendingThresholds(progress, firedSet);
    if (pending.length === 0) return [];

    const members = await tx.householdMember.findMany({
      where: { householdId: budget.householdId },
      select: { userId: true },
    });

    const pushes: ThresholdPushPayload[] = [];
    const budgetLabel = budget.name;

    for (const threshold of pending) {
      // Insert ONE dedupe row via ON CONFLICT DO NOTHING using the first member's
      // notification id as the join anchor. If the dedupe row already exists
      // (race with the scheduler or a concurrent mutation), we skip cleanly.
      if (members.length === 0) {
        // No recipients — still attempt to create a dedupe row with a synthetic
        // notification fan-out? We need at least one notification to satisfy
        // the FK. Skip this threshold cleanly: once a member exists, the next
        // evaluation will fire.
        continue;
      }

      // Create one notifications row per member, inside the same tx.
      const notifIds: Array<{ id: string; userId: string }> = [];
      const payload = {
        budgetId: budget.id,
        householdId: budget.householdId,
        thresholdPercent: threshold,
        periodStart: result.periodStart.toISOString(),
        spentMinor: result.spentMinor.toString(),
        effectiveAmountMinor: result.effectiveAmountMinor.toString(),
        currencyCode: budget.currencyCode,
        name: budgetLabel,
      } satisfies Prisma.InputJsonValue;

      for (const m of members) {
        const nid = newId();
        await tx.notification.create({
          data: {
            id: nid,
            userId: m.userId,
            householdId: budget.householdId,
            type: 'budget.threshold_fired',
            payload,
          },
        });
        notifIds.push({ id: nid, userId: m.userId });
      }

      // Dedupe insert. If it fails (unique conflict), the notifications we just
      // wrote are wasted but not user-visible (they'll see the single earlier
      // notification). We use $queryRaw so ON CONFLICT DO NOTHING is explicit.
      const dedupeId = newId();
      const inserted = await tx.$executeRaw`
        INSERT INTO budget_threshold_notifications (
          id, household_id, budget_id, period_start, threshold_percent, notification_id
        ) VALUES (
          ${dedupeId}, ${budget.householdId}, ${budget.id},
          ${result.periodStart}, ${threshold}, ${notifIds[0]!.id}
        )
        ON CONFLICT (budget_id, period_start, threshold_percent) DO NOTHING
      `;
      if (inserted === 0) {
        // Lost the race — roll back the notifications we just wrote for this
        // threshold by deleting them. Safer than leaving ghost rows.
        await tx.notification.deleteMany({
          where: { id: { in: notifIds.map((n) => n.id) } },
        });
        continue;
      }

      await recordEvent(
        tx,
        budget.householdId,
        actorUserId,
        'budget.threshold_fired',
        {
          budgetId: budget.id,
          periodStart: result.periodStart.toISOString(),
          thresholdPercent: threshold,
          spentMinor: result.spentMinor.toString(),
          effectiveAmountMinor: result.effectiveAmountMinor.toString(),
          currencyCode: budget.currencyCode,
        },
      );

      const title = titleFor(threshold, budgetLabel);
      const body = bodyFor(
        threshold,
        result.spentMinor,
        result.effectiveAmountMinor,
        budget.currencyCode,
      );
      for (const n of notifIds) {
        pushes.push({
          userId: n.userId,
          title,
          body,
          data: {
            ...payload,
            notificationId: n.id,
            type: 'budget.threshold_fired',
            deepLink: `nayanam://budgets?highlight=${budget.id}`,
          },
        });
      }
    }
    void THRESHOLD_LADDER; // referenced for clarity; pendingThresholds uses it.
    return pushes;
  }

  private async computeStatusItem(
    tx: AnyTx,
    budget: BudgetRow,
    asOf: Date,
  ): Promise<BudgetStatusItemDTO> {
    const inputs = {
      householdId: budget.householdId,
      scope: budget.scope as 'HOUSEHOLD' | 'CATEGORY',
      categoryId: budget.categoryId,
      currencyCode: budget.currencyCode,
      period: budget.period as BudgetPeriod,
      startAt: budget.startAt,
      endAt: budget.endAt,
      amountMinor: budget.amountMinor,
      rollover: budget.rollover,
    };
    const result = await computeSpent(tx, inputs, asOf);

    const firedRows = await tx.budgetThresholdNotification.findMany({
      where: { budgetId: budget.id, periodStart: result.periodStart },
      select: { thresholdPercent: true },
    });
    const thresholdsFired = firedRows
      .map((r) => r.thresholdPercent)
      .sort((a, b) => a - b);

    const progress = progressPercent(result.spentMinor, result.effectiveAmountMinor);
    const remaining = result.effectiveAmountMinor - result.spentMinor;
    return {
      budget: budgetToDTO(budget),
      periodStart: result.periodStart.toISOString(),
      periodEnd: result.periodEnd.toISOString(),
      effectiveAmountMinor: result.effectiveAmountMinor.toString(),
      spentMinor: result.spentMinor.toString(),
      remainingMinor: remaining.toString(),
      progressPercent: progress,
      rolloverCarryInMinor: result.rolloverCarryInMinor.toString(),
      thresholdsFired,
      isOverspent: result.spentMinor > result.effectiveAmountMinor,
      isOverThreshold: thresholdsFired.some((t) => t >= 100),
    };
  }

  private async findActiveOrThrow(id: string): Promise<BudgetRow> {
    const householdId = getHouseholdOrThrow();
    const row = await this.prisma.budget.findFirst({
      where: { id, householdId, deletedAt: null },
    });
    if (!row) throw Errors.notFound();
    return row;
  }

  private assertRole(minimum: HouseholdRole) {
    const role = getContext()?.householdRole;
    if (!role || !roleAtLeast(role, minimum)) throw Errors.forbiddenRole();
  }

  /**
   * Cross-tenant scheduler entry point: run `fn` with the given household on
   * the ALS stack so queries that rely on context resolve correctly.
   */
  async runAsHousehold<T>(householdId: string, fn: () => Promise<T>): Promise<T> {
    return requestContext.run({ householdId }, fn);
  }
}

// ---- module-local helpers ----

async function fetchThresholdsFiredMap(
  prisma: PrismaService,
  budgetId: string,
  periodStarts: Date[],
): Promise<Map<string, number[]>> {
  if (periodStarts.length === 0) return new Map();
  const rows = await prisma.budgetThresholdNotification.findMany({
    where: {
      budgetId,
      periodStart: { in: periodStarts },
    },
    select: { periodStart: true, thresholdPercent: true },
  });
  const out = new Map<string, number[]>();
  for (const r of rows) {
    const key = r.periodStart.toISOString();
    const arr = out.get(key) ?? [];
    arr.push(r.thresholdPercent);
    out.set(key, arr);
  }
  return out;
}

export function budgetToDTO(row: BudgetRow): BudgetDTO {
  return {
    id: row.id,
    householdId: row.householdId,
    name: row.name,
    scope: row.scope as BudgetDTO['scope'],
    categoryId: row.categoryId ?? null,
    amountMinor: row.amountMinor.toString(),
    currencyCode: row.currencyCode,
    period: row.period as BudgetDTO['period'],
    rollover: row.rollover,
    status: row.status as BudgetDTO['status'],
    startAt: row.startAt.toISOString(),
    endAt: row.endAt ? row.endAt.toISOString() : null,
    displayOrder: row.displayOrder,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function recordEvent(
  tx: AnyTx,
  householdId: string,
  actorId: string | null,
  type: string,
  payload: unknown,
) {
  await tx.$executeRaw`
    INSERT INTO events (id, household_id, actor_id, type, payload)
    VALUES (${newId()}, ${householdId}, ${actorId}, ${type}, ${JSON.stringify(payload)}::jsonb)
  `;
}

function mapUniqueViolation(err: unknown): Error {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return Errors.budgetAlreadyExists();
  }
  return err as Error;
}

function titleFor(threshold: number, name: string): string {
  if (threshold === 50) return `${name} budget: 50% used`;
  if (threshold === 80) return `${name} budget: 80% used`;
  if (threshold === 100) return `${name} budget: 100% used`;
  return `${name} budget: ${threshold}% used`;
}

function bodyFor(
  threshold: number,
  spentMinor: bigint,
  effectiveMinor: bigint,
  currencyCode: string,
): string {
  const spent = formatAmount(spentMinor, currencyCode);
  const effective = formatAmount(effectiveMinor, currencyCode);
  if (threshold >= 120) {
    const over = spentMinor - effectiveMinor;
    return `${formatAmount(over > 0n ? over : 0n, currencyCode)} over — spent ${spent} of ${effective}`;
  }
  if (threshold >= 100) return `Over budget if you spend more (${spent} of ${effective})`;
  return `${spent} of ${effective}`;
}

function formatAmount(amountMinor: bigint, currencyCode: string): string {
  const s = amountMinor.toString().padStart(3, '0');
  const major = s.slice(0, -2);
  const minor = s.slice(-2);
  return `${major}.${minor} ${currencyCode}`;
}
