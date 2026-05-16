import { Injectable } from '@nestjs/common';
import { Prisma, type Bill as BillRow, type BillPayment as BillPaymentRow } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BalanceService } from '../accounts/balance.service';
import { BudgetsService } from '../budgets/budgets.service';
import { Errors } from '../common/errors';
import { newId } from '../common/ids';
import { getAuthOrThrow, getContext, getHouseholdOrThrow } from '../common/context';
import { roleAtLeast, type HouseholdRole } from '../common/household-header.guard';
import { EventType } from '../common/event-types';
import {
  advance,
  normalizedMonthlyCostMinor,
  type Cycle,
} from './cycle';
import type { BillDTO, BillPaymentDTO } from './bills.dto';
import { toDTO as txToDTO } from '../transactions/transactions.service';
import type { TransactionDTO } from '../transactions/transactions.dto';

type AnyTx = Prisma.TransactionClient | PrismaService;

const MEMBER: HouseholdRole = 'MEMBER';
const ADMIN: HouseholdRole = 'ADMIN';

const DUE_SOON_DAYS = 7;

@Injectable()
export class BillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balance: BalanceService,
    private readonly budgets: BudgetsService,
  ) {}

  // ---- reads ----

  async list(params: {
    cursor?: string;
    limit?: number;
    filter?: 'all' | 'due-soon' | 'active' | 'paused';
    status?: 'ACTIVE' | 'PAUSED';
    includeArchived?: boolean;
  }): Promise<{ items: BillDTO[]; nextCursor: string | null }> {
    const householdId = getHouseholdOrThrow();
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
    const filter = params.filter ?? 'all';

    // `filter` wins over `status` when both are supplied.
    let statusFilter: 'ACTIVE' | 'PAUSED' | undefined;
    let dueSoon = false;
    if (filter === 'active') statusFilter = 'ACTIVE';
    else if (filter === 'paused') statusFilter = 'PAUSED';
    else if (filter === 'due-soon') {
      statusFilter = 'ACTIVE';
      dueSoon = true;
    } else if (params.status) {
      statusFilter = params.status;
    }

    const where: Prisma.BillWhereInput = {
      householdId,
      deletedAt: null,
      ...(params.includeArchived ? {} : { archivedAt: null }),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(dueSoon
        ? { nextDueAt: { lte: new Date(Date.now() + DUE_SOON_DAYS * 86_400_000) } }
        : {}),
    };

    // Paused filter orders by updatedAt DESC; others by nextDueAt ASC.
    const byPaused = filter === 'paused';
    const orderBy: Prisma.BillOrderByWithRelationInput[] = byPaused
      ? [{ updatedAt: 'desc' }, { id: 'desc' }]
      : [{ nextDueAt: 'asc' }, { id: 'asc' }];

    const rows = await this.prisma.bill.findMany({
      where,
      orderBy,
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;
    return { items: page.map(billToDTO), nextCursor };
  }

  async get(id: string): Promise<BillDTO> {
    const row = await this.findActiveOrThrow(id);
    return billToDTO(row);
  }

  async summary(): Promise<{
    byCurrency: Array<{
      currencyCode: string;
      monthlyCostMinor: string;
      dueSoonMinor: string;
      activeCount: number;
      pausedCount: number;
      dueSoonCount: number;
    }>;
    totalsAllCurrencies: { activeCount: number; pausedCount: number };
    asOf: string;
  }> {
    const householdId = getHouseholdOrThrow();
    const now = new Date();
    const dueSoonBoundary = new Date(now.getTime() + DUE_SOON_DAYS * 86_400_000);

    const rows = await this.prisma.bill.findMany({
      where: { householdId, deletedAt: null, archivedAt: null },
      select: {
        currencyCode: true,
        status: true,
        amountMinor: true,
        cycle: true,
        customDays: true,
        nextDueAt: true,
      },
    });

    type Bucket = {
      currencyCode: string;
      monthlyCost: bigint;
      dueSoon: bigint;
      activeCount: number;
      pausedCount: number;
      dueSoonCount: number;
    };
    const buckets = new Map<string, Bucket>();
    let totalActive = 0;
    let totalPaused = 0;

    for (const r of rows) {
      let b = buckets.get(r.currencyCode);
      if (!b) {
        b = {
          currencyCode: r.currencyCode,
          monthlyCost: 0n,
          dueSoon: 0n,
          activeCount: 0,
          pausedCount: 0,
          dueSoonCount: 0,
        };
        buckets.set(r.currencyCode, b);
      }
      if (r.status === 'ACTIVE') {
        b.activeCount += 1;
        totalActive += 1;
        b.monthlyCost += normalizedMonthlyCostMinor(
          r.amountMinor,
          r.cycle as Cycle,
          r.customDays,
        );
        if (r.nextDueAt.getTime() <= dueSoonBoundary.getTime()) {
          b.dueSoon += r.amountMinor;
          b.dueSoonCount += 1;
        }
      } else {
        b.pausedCount += 1;
        totalPaused += 1;
      }
    }

    const byCurrency = Array.from(buckets.values())
      .sort((a, b) => a.currencyCode.localeCompare(b.currencyCode))
      .map((b) => ({
        currencyCode: b.currencyCode,
        monthlyCostMinor: b.monthlyCost.toString(),
        dueSoonMinor: b.dueSoon.toString(),
        activeCount: b.activeCount,
        pausedCount: b.pausedCount,
        dueSoonCount: b.dueSoonCount,
      }));

    return {
      byCurrency,
      totalsAllCurrencies: { activeCount: totalActive, pausedCount: totalPaused },
      asOf: now.toISOString(),
    };
  }

  async upcoming(days: number): Promise<{
    items: Array<{ bill: BillDTO; dueAt: string; daysUntilDue: number }>;
    asOf: string;
  }> {
    const householdId = getHouseholdOrThrow();
    const now = new Date();
    const upper = new Date(now.getTime() + days * 86_400_000);

    const rows = await this.prisma.bill.findMany({
      where: {
        householdId,
        deletedAt: null,
        archivedAt: null,
        status: 'ACTIVE',
        nextDueAt: { lte: upper },
      },
      orderBy: [{ nextDueAt: 'asc' }, { id: 'asc' }],
    });

    const items = rows.map((r) => {
      const ms = r.nextDueAt.getTime() - now.getTime();
      const daysUntilDue = Math.floor(ms / 86_400_000);
      return {
        bill: billToDTO(r),
        dueAt: r.nextDueAt.toISOString(),
        daysUntilDue,
      };
    });

    return { items, asOf: now.toISOString() };
  }

  // ---- create ----

  async create(input: {
    name: string;
    amountMinor: string;
    accountId: string;
    categoryId: string;
    cycle: Cycle;
    customDays?: number | null;
    startAt?: string;
    autoLog?: boolean;
    note?: string | null;
    colorToken?: string | null;
    iconToken?: string | null;
    endAt?: string | null;
  }): Promise<BillDTO> {
    this.assertRole(MEMBER);
    const householdId = getHouseholdOrThrow();
    const { userId } = getAuthOrThrow();

    this.validateCycleAndCustomDays(input.cycle, input.customDays ?? null);
    const amount = BigInt(input.amountMinor);
    if (amount <= 0n) throw Errors.validation('amountMinor must be > 0.');

    const startAt = input.startAt ? new Date(input.startAt) : new Date();
    const endAt = input.endAt ? new Date(input.endAt) : null;
    if (endAt && endAt.getTime() < startAt.getTime()) {
      throw Errors.billEndAtBeforeNextDue();
    }

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const account = await tx.account.findFirst({
          where: { id: input.accountId, householdId, deletedAt: null },
        });
        if (!account) throw Errors.notFound();
        if (account.archivedAt) throw Errors.billAccountArchived();

        const category = await tx.category.findFirst({
          where: {
            id: input.categoryId,
            deletedAt: null,
            OR: [{ householdId: null }, { householdId }],
          },
        });
        if (!category) throw Errors.notFound();
        if (category.archivedAt) throw Errors.billCategoryArchived();
        if (category.type !== 'EXPENSE') throw Errors.billCategoryTypeInvalid();

        const maxOrder = await tx.bill.aggregate({
          where: { householdId, deletedAt: null },
          _max: { displayOrder: true },
        });
        const displayOrder = (maxOrder._max.displayOrder ?? -1) + 1;

        const id = newId();
        const now = new Date();
        const created = await tx.bill.create({
          data: {
            id,
            householdId,
            name: input.name.trim(),
            amountMinor: amount,
            currencyCode: account.currencyCode,
            accountId: input.accountId,
            categoryId: input.categoryId,
            cycle: input.cycle,
            customDays: input.customDays ?? null,
            startAt,
            nextDueAt: startAt,
            endAt,
            status: 'ACTIVE',
            autoLog: input.autoLog ?? false,
            note: normalizeNote(input.note),
            colorToken: input.colorToken ?? null,
            iconToken: input.iconToken ?? null,
            displayOrder,
            createdBy: userId,
            updatedBy: userId,
            createdAt: now,
            updatedAt: now,
          },
        });

        await recordEvent(tx, householdId, userId, EventType.BILL_CREATED, {
          billId: created.id,
          name: created.name,
          amountMinor: created.amountMinor.toString(),
          currencyCode: created.currencyCode,
          cycle: created.cycle,
          autoLog: created.autoLog,
          accountId: created.accountId,
          categoryId: created.categoryId,
        });
        return created;
      });
      return billToDTO(row);
    } catch (err) {
      throw mapBillUniqueViolation(err, input.name);
    }
  }

  // ---- update ----

  async update(
    id: string,
    patch: {
      name?: string;
      amountMinor?: string;
      accountId?: string;
      categoryId?: string;
      cycle?: Cycle;
      customDays?: number | null;
      startAt?: string;
      autoLog?: boolean;
      note?: string | null;
      colorToken?: string | null;
      iconToken?: string | null;
      endAt?: string | null;
      currencyCode?: string;
    },
  ): Promise<BillDTO> {
    this.assertRole(MEMBER);
    const { userId } = getAuthOrThrow();
    const householdId = getHouseholdOrThrow();

    if (patch.currencyCode !== undefined) throw Errors.billCurrencyImmutable();

    const existing = await this.findActiveOrThrow(id);
    if (existing.archivedAt) {
      throw Errors.conflict('Bill is archived; restore it before editing.');
    }

    const newCycle = (patch.cycle ?? existing.cycle) as Cycle;
    const newCustomDays =
      patch.customDays !== undefined ? patch.customDays : existing.customDays;
    this.validateCycleAndCustomDays(newCycle, newCustomDays ?? null);

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const changed: string[] = [];
        const before: Record<string, unknown> = {};
        const after: Record<string, unknown> = {};

        const data: Prisma.BillUpdateInput = { updatedBy: userId, updatedAt: new Date() };

        if (patch.accountId && patch.accountId !== existing.accountId) {
          const acct = await tx.account.findFirst({
            where: { id: patch.accountId, householdId, deletedAt: null },
          });
          if (!acct) throw Errors.notFound();
          if (acct.archivedAt) throw Errors.billAccountArchived();
          if (acct.currencyCode !== existing.currencyCode) {
            throw Errors.billCurrencyMismatch(existing.currencyCode, acct.currencyCode);
          }
          data.account = { connect: { id: patch.accountId } };
          changed.push('accountId');
          before.accountId = existing.accountId;
          after.accountId = patch.accountId;
        }

        if (patch.categoryId && patch.categoryId !== existing.categoryId) {
          const cat = await tx.category.findFirst({
            where: {
              id: patch.categoryId,
              deletedAt: null,
              OR: [{ householdId: null }, { householdId }],
            },
          });
          if (!cat) throw Errors.notFound();
          if (cat.archivedAt) throw Errors.billCategoryArchived();
          if (cat.type !== 'EXPENSE') throw Errors.billCategoryTypeInvalid();
          data.category = { connect: { id: patch.categoryId } };
          changed.push('categoryId');
          before.categoryId = existing.categoryId;
          after.categoryId = patch.categoryId;
        }

        if (patch.name !== undefined && patch.name.trim() !== existing.name) {
          data.name = patch.name.trim();
          changed.push('name');
          before.name = existing.name;
          after.name = patch.name.trim();
        }
        if (patch.amountMinor !== undefined) {
          const a = BigInt(patch.amountMinor);
          if (a <= 0n) throw Errors.validation('amountMinor must be > 0.');
          if (a !== existing.amountMinor) {
            data.amountMinor = a;
            changed.push('amountMinor');
            before.amountMinor = existing.amountMinor.toString();
            after.amountMinor = a.toString();
          }
        }
        if (patch.autoLog !== undefined && patch.autoLog !== existing.autoLog) {
          data.autoLog = patch.autoLog;
          changed.push('autoLog');
          before.autoLog = existing.autoLog;
          after.autoLog = patch.autoLog;
        }
        if (patch.note !== undefined) {
          const nn = normalizeNote(patch.note);
          if (nn !== existing.note) {
            data.note = nn;
            changed.push('note');
            before.note = existing.note;
            after.note = nn;
          }
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

        let newStartAt = existing.startAt;
        if (patch.startAt !== undefined) {
          const d = new Date(patch.startAt);
          if (d.getTime() !== existing.startAt.getTime()) {
            data.startAt = d;
            changed.push('startAt');
            before.startAt = existing.startAt.toISOString();
            after.startAt = d.toISOString();
            newStartAt = d;
          }
        }

        // Cycle/customDays rebase next_due_at when changed.
        const cycleChanged =
          (patch.cycle !== undefined && patch.cycle !== existing.cycle) ||
          (patch.customDays !== undefined && patch.customDays !== existing.customDays);
        if (patch.cycle !== undefined && patch.cycle !== existing.cycle) {
          data.cycle = patch.cycle;
          changed.push('cycle');
          before.cycle = existing.cycle;
          after.cycle = patch.cycle;
        }
        if (patch.customDays !== undefined && patch.customDays !== existing.customDays) {
          data.customDays = patch.customDays;
          changed.push('customDays');
          before.customDays = existing.customDays;
          after.customDays = patch.customDays;
        }
        let newNextDueAt = existing.nextDueAt;
        if (cycleChanged) {
          const base = existing.lastPaidAt ?? newStartAt;
          newNextDueAt = advance(base, newCycle, newCustomDays ?? null);
          data.nextDueAt = newNextDueAt;
          changed.push('nextDueAt');
          before.nextDueAt = existing.nextDueAt.toISOString();
          after.nextDueAt = newNextDueAt.toISOString();
          // H2: reset notification cursors so the scheduler re-evaluates on the
          // new cycle boundary (stale cursors from the old cycle would suppress
          // due-soon / overdue notifications forever).
          data.lastNotifiedDueSoonAt = null;
          data.lastNotifiedOverdueAt = null;
        }

        if (patch.endAt !== undefined) {
          const endAt = patch.endAt === null ? null : new Date(patch.endAt);
          if (endAt && endAt.getTime() < newNextDueAt.getTime()) {
            throw Errors.billEndAtBeforeNextDue();
          }
          data.endAt = endAt;
          if ((existing.endAt?.getTime() ?? null) !== (endAt?.getTime() ?? null)) {
            changed.push('endAt');
            before.endAt = existing.endAt ? existing.endAt.toISOString() : null;
            after.endAt = endAt ? endAt.toISOString() : null;
          }
        }

        const row = await tx.bill.update({ where: { id }, data });

        if (changed.length > 0) {
          await recordEvent(tx, householdId, userId, EventType.BILL_UPDATED, {
            billId: id,
            changedFields: changed,
            before,
            after,
          });
        }
        return row;
      });
      return billToDTO(updated);
    } catch (err) {
      throw mapBillUniqueViolation(err, patch.name ?? existing.name);
    }
  }

  // ---- archive / restore ----

  async archiveOrDelete(id: string): Promise<BillDTO> {
    this.assertRole(ADMIN);
    const { userId } = getAuthOrThrow();
    const existing = await this.findActiveOrThrow(id);

    const updated = await this.prisma.$transaction(async (tx) => {
      const anyPayments = await tx.billPayment.findFirst({
        where: { billId: id, householdId: existing.householdId },
        select: { id: true },
      });

      if (!anyPayments) {
        const row = await tx.bill.update({
          where: { id },
          data: { deletedAt: new Date(), updatedBy: userId },
        });
        await recordEvent(tx, existing.householdId, userId, EventType.BILL_DELETED, {
          billId: id,
          name: existing.name,
        });
        return row;
      }

      if (existing.archivedAt) return existing;
      const row = await tx.bill.update({
        where: { id },
        data: { archivedAt: new Date(), updatedBy: userId },
      });
      await recordEvent(tx, existing.householdId, userId, EventType.BILL_ARCHIVED, {
        billId: id,
        name: existing.name,
      });
      return row;
    });
    return billToDTO(updated);
  }

  async restore(id: string): Promise<BillDTO> {
    this.assertRole(ADMIN);
    const { userId } = getAuthOrThrow();
    const householdId = getHouseholdOrThrow();

    const existing = await this.prisma.bill.findFirst({
      where: { id, householdId, deletedAt: null },
    });
    if (!existing) throw Errors.notFound();
    if (!existing.archivedAt) return billToDTO(existing);

    const updated = await this.prisma
      .$transaction(async (tx) => {
        const row = await tx.bill.update({
          where: { id },
          data: { archivedAt: null, updatedBy: userId },
        });
        await recordEvent(tx, householdId, userId, EventType.BILL_RESTORED, {
          billId: id,
          name: row.name,
        });
        return row;
      })
      .catch((err: unknown) => {
        throw mapBillUniqueViolation(err, existing.name);
      });
    return billToDTO(updated);
  }

  // ---- pause / resume ----

  async pause(id: string): Promise<BillDTO> {
    this.assertRole(MEMBER);
    const { userId } = getAuthOrThrow();
    const existing = await this.findActiveOrThrow(id);
    if (existing.status === 'PAUSED') throw Errors.billAlreadyPaused();

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.bill.update({
        where: { id },
        data: {
          status: 'PAUSED',
          lastNotifiedDueSoonAt: null,
          lastNotifiedOverdueAt: null,
          updatedBy: userId,
        },
      });
      await recordEvent(tx, existing.householdId, userId, EventType.BILL_PAUSED, {
        billId: id,
      });
      return row;
    });
    return billToDTO(updated);
  }

  async resume(id: string): Promise<BillDTO> {
    this.assertRole(MEMBER);
    const { userId } = getAuthOrThrow();
    const householdId = getHouseholdOrThrow();
    const existing = await this.findActiveOrThrow(id);
    if (existing.status === 'ACTIVE') throw Errors.billAlreadyActive();

    // Reject resume onto archived account.
    const account = await this.prisma.account.findFirst({
      where: { id: existing.accountId, householdId, deletedAt: null },
    });
    if (!account) throw Errors.notFound();
    if (account.archivedAt) throw Errors.billAccountArchived();

    const updated = await this.prisma.$transaction(async (tx) => {
      let nextDueAt = existing.nextDueAt;
      let advanced = 0;
      const now = new Date();
      const safety = 1000;
      while (nextDueAt.getTime() <= now.getTime() && advanced < safety) {
        nextDueAt = advance(nextDueAt, existing.cycle as Cycle, existing.customDays);
        advanced += 1;
      }

      const row = await tx.bill.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          nextDueAt,
          lastNotifiedDueSoonAt: null,
          lastNotifiedOverdueAt: null,
          updatedBy: userId,
        },
      });
      await recordEvent(tx, householdId, userId, EventType.BILL_RESUMED, {
        billId: id,
        advancedCycles: advanced,
      });
      return row;
    });
    return billToDTO(updated);
  }

  // ---- reorder ----

  async reorder(
    entries: Array<{ id: string; displayOrder: number }>,
  ): Promise<{ items: BillDTO[] }> {
    this.assertRole(MEMBER);
    const householdId = getHouseholdOrThrow();
    const { userId } = getAuthOrThrow();

    const active = await this.prisma.bill.findMany({
      where: { householdId, deletedAt: null, archivedAt: null },
      select: { id: true },
    });
    const activeIds = new Set(active.map((a) => a.id));
    const filtered = entries.filter((e) => activeIds.has(e.id));

    const knownAll = await this.prisma.bill.findMany({
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

    filtered.sort((a, b) => a.displayOrder - b.displayOrder);
    const ordered = filtered.map((e) => e.id);
    const remaining = active.map((a) => a.id).filter((id) => !ordered.includes(id));
    const finalOrder = [...ordered, ...remaining];

    const items = await this.prisma.$transaction(async (tx) => {
      await Promise.all(
        finalOrder.map((id, idx) =>
          tx.bill.update({
            where: { id },
            data: { displayOrder: idx, updatedBy: userId },
          }),
        ),
      );
      await recordEvent(tx, householdId, userId, EventType.BILL_REORDERED, {
        order: finalOrder.map((id, idx) => ({ billId: id, displayOrder: idx })),
      });
      return tx.bill.findMany({
        where: { householdId, deletedAt: null, archivedAt: null },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      });
    });
    return { items: items.map(billToDTO) };
  }

  // ---- mark paid ----

  async markPaid(
    id: string,
    body: {
      amountMinor?: string;
      occurredAt?: string;
      note?: string | null;
      source?: 'MANUAL' | 'AUTO_LOG' | 'BACKFILL';
    },
  ): Promise<{ bill: BillDTO; payment: BillPaymentDTO; transaction: TransactionDTO }> {
    this.assertRole(MEMBER);
    const { userId } = getAuthOrThrow();
    // Public path is clamped to MANUAL.
    if (body.source !== undefined && body.source !== 'MANUAL') {
      throw Errors.validation('source must be MANUAL on the public mark-paid path.');
    }
    const result = await this.markPaidInternal(id, {
      amountMinor: body.amountMinor,
      occurredAt: body.occurredAt,
      note: body.note ?? null,
      source: 'MANUAL',
      actorUserId: userId,
    });
    return {
      bill: billToDTO(result.bill),
      payment: paymentToDTO(result.payment),
      transaction: txToDTO(result.transaction),
    };
  }

  /**
   * Internal mark-paid used by both the public endpoint AND the scheduler
   * auto-log path. Opens its own `$transaction`. Does NOT check role — the
   * caller must pre-check. Handles all three writes atomically.
   */
  async markPaidInternal(
    id: string,
    input: {
      amountMinor?: string;
      occurredAt?: string;
      note?: string | null;
      source: 'MANUAL' | 'AUTO_LOG' | 'BACKFILL';
      actorUserId: string | null; // NULL for AUTO_LOG
    },
  ): Promise<{
    bill: BillRow;
    payment: BillPaymentRow;
    transaction: import('@prisma/client').Transaction;
  }> {
    const householdId = getHouseholdOrThrow();

    const result = await this.prisma.$transaction(async (tx) => {
      // Lock the bill row for the duration of this mark-paid.
      await tx.$queryRaw`SELECT id FROM bills WHERE id = ${id} FOR UPDATE`;

      const existing = await tx.bill.findFirst({
        where: { id, householdId, deletedAt: null },
      });
      if (!existing) throw Errors.notFound();
      if (existing.status !== 'ACTIVE') throw Errors.billPausedCannotPay();

      const account = await tx.account.findFirst({
        where: { id: existing.accountId, householdId, deletedAt: null },
      });
      if (!account) throw Errors.notFound();
      if (account.archivedAt) throw Errors.billAccountArchived();

      const amount = input.amountMinor ? BigInt(input.amountMinor) : existing.amountMinor;
      if (amount <= 0n) throw Errors.validation('amountMinor must be > 0.');
      const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
      const note =
        input.note !== undefined ? normalizeNote(input.note) : existing.note;

      // Ledger write: EXPENSE on the bill's account/category/currency.
      const txId = newId();
      // Manual path uses actor; auto-log supplies a service-owner. `transactions.created_by`
      // is NOT NULL so auto-log uses the bill's `created_by` as a stable non-null actor.
      const writerUserId = input.actorUserId ?? existing.createdBy;
      const txRow = await tx.transaction.create({
        data: {
          id: txId,
          householdId,
          accountId: existing.accountId,
          categoryId: existing.categoryId,
          type: 'EXPENSE',
          amountMinor: amount,
          currencyCode: existing.currencyCode,
          occurredAt,
          note,
          createdBy: writerUserId,
          updatedBy: writerUserId,
        },
      });
      await this.balance.applyDelta(tx, existing.accountId, -amount, occurredAt);

      // Payment row snapshots the cycle boundary.
      const payment = await tx.billPayment.create({
        data: {
          id: newId(),
          householdId,
          billId: id,
          transactionId: txId,
          cycleDueAt: existing.nextDueAt,
          paidAt: occurredAt,
          amountMinor: amount,
          source: input.source,
          createdBy: input.actorUserId,
        },
      });

      // Advance cycle, clear dedupe cursors, stamp lastPaidAt.
      const nextDueAt = advance(
        existing.nextDueAt,
        existing.cycle as Cycle,
        existing.customDays,
      );
      const updatedBill = await tx.bill.update({
        where: { id },
        data: {
          nextDueAt,
          lastPaidAt: occurredAt,
          lastNotifiedDueSoonAt: null,
          lastNotifiedOverdueAt: null,
          updatedBy: writerUserId,
        },
      });

      await recordEvent(tx, householdId, input.actorUserId, EventType.BILL_PAID, {
        billId: id,
        paymentId: payment.id,
        transactionId: txId,
        amountMinor: amount.toString(),
        currencyCode: existing.currencyCode,
        cycleDueAt: existing.nextDueAt.toISOString(),
        source: input.source,
        futureDated: occurredAt.getTime() > Date.now(),
      });

      // Transaction-level event matches Phase 3 semantics.
      await recordEvent(tx, householdId, input.actorUserId, EventType.TRANSACTION_CREATED, {
        transactionId: txId,
        accountId: existing.accountId,
        categoryId: existing.categoryId,
        type: 'EXPENSE',
        amountMinor: amount.toString(),
        currencyCode: existing.currencyCode,
        occurredAt: occurredAt.toISOString(),
        transferId: null,
        source: 'bill',
        billId: id,
      });

      // Budget threshold evaluation — inside the same transaction so any
      // threshold/notification writes are atomic with the payment write.
      const pushes = await this.budgets.evaluateForTransactionMutation(
        tx,
        householdId,
        [existing.categoryId],
        [existing.currencyCode],
      );

      return { bill: updatedBill, payment, transaction: txRow, pushes };
    });

    // Dispatch push notifications BEST-EFFORT after the transaction commits.
    await this.budgets.flushPushQueue(result.pushes);

    return { bill: result.bill, payment: result.payment, transaction: result.transaction };
  }

  // ---- payments listing / undo ----

  async listPayments(
    billId: string,
    params: { cursor?: string; limit?: number; includeDeleted?: boolean },
  ): Promise<{ items: BillPaymentDTO[]; nextCursor: string | null }> {
    // Ensure the bill exists in this household (also 404s cross-tenant probe).
    const existing = await this.prisma.bill.findFirst({
      where: { id: billId, householdId: getHouseholdOrThrow() },
    });
    if (!existing || existing.deletedAt) throw Errors.notFound();

    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const rows = await this.prisma.billPayment.findMany({
      where: {
        billId,
        householdId: existing.householdId,
        ...(params.includeDeleted ? {} : { deletedAt: null }),
      },
      orderBy: [{ cycleDueAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;
    return { items: page.map(paymentToDTO), nextCursor };
  }

  async undoPayment(billId: string, paymentId: string): Promise<{
    bill: BillDTO;
    payment: BillPaymentDTO;
  }> {
    this.assertRole(ADMIN);
    const { userId } = getAuthOrThrow();
    const householdId = getHouseholdOrThrow();

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM bills WHERE id = ${billId} FOR UPDATE`;

      const bill = await tx.bill.findFirst({
        where: { id: billId, householdId, deletedAt: null },
      });
      if (!bill) throw Errors.notFound();

      const target = await tx.billPayment.findFirst({
        where: { id: paymentId, billId, householdId },
      });
      if (!target) throw Errors.notFound();
      if (target.deletedAt) throw Errors.billPaymentNotLatest();

      // Latest = most-recent non-deleted by (cycleDueAt desc, id desc)
      const latest = await tx.billPayment.findFirst({
        where: { billId, householdId, deletedAt: null },
        orderBy: [{ cycleDueAt: 'desc' }, { id: 'desc' }],
      });
      if (!latest || latest.id !== paymentId) throw Errors.billPaymentNotLatest();

      // Soft-delete payment.
      const updatedPayment = await tx.billPayment.update({
        where: { id: paymentId },
        data: { deletedAt: new Date() },
      });

      // Soft-delete linked transaction and reverse balance.
      let reversedTxId: string | null = null;
      if (target.transactionId) {
        const txRow = await tx.transaction.findFirst({
          where: { id: target.transactionId, householdId },
        });
        if (txRow && !txRow.deletedAt) {
          const signed = txRow.type === 'INCOME' ? txRow.amountMinor : -txRow.amountMinor;
          await this.balance.applyDelta(tx, txRow.accountId, -signed, txRow.occurredAt);
          await tx.transaction.update({
            where: { id: txRow.id },
            data: { deletedAt: new Date(), updatedBy: userId },
          });
          reversedTxId = txRow.id;
          await recordEvent(tx, householdId, userId, EventType.TRANSACTION_DELETED, {
            transactionId: txRow.id,
            accountId: txRow.accountId,
            amountMinor: txRow.amountMinor.toString(),
            type: txRow.type,
            reason: 'bill.payment_undone',
          });
        }
      }

      // Recompute lastPaidAt from remaining non-deleted payments.
      const prev = await tx.billPayment.findFirst({
        where: { billId, householdId, deletedAt: null },
        orderBy: [{ cycleDueAt: 'desc' }, { id: 'desc' }],
      });

      const updatedBill = await tx.bill.update({
        where: { id: billId },
        data: {
          nextDueAt: target.cycleDueAt,
          lastPaidAt: prev?.paidAt ?? null,
          updatedBy: userId,
        },
      });

      await recordEvent(tx, householdId, userId, EventType.BILL_PAYMENT_UNDONE, {
        billId,
        paymentId,
        transactionId: reversedTxId,
      });

      // Budget threshold evaluation — re-evaluate after the reversal so budgets
      // can recalculate spend for the affected category/currency.
      const pushes = await this.budgets.evaluateForTransactionMutation(
        tx,
        householdId,
        [bill.categoryId],
        [bill.currencyCode],
      );

      return { bill: updatedBill, payment: updatedPayment, pushes };
    });

    // Dispatch push notifications BEST-EFFORT after the transaction commits.
    await this.budgets.flushPushQueue(result.pushes);

    return { bill: billToDTO(result.bill), payment: paymentToDTO(result.payment) };
  }

  // ---- helpers ----

  private async findActiveOrThrow(id: string): Promise<BillRow> {
    const householdId = getHouseholdOrThrow();
    const row = await this.prisma.bill.findFirst({
      where: { id, householdId, deletedAt: null },
    });
    if (!row) throw Errors.notFound();
    return row;
  }

  private assertRole(minimum: HouseholdRole) {
    const role = getContext()?.householdRole;
    if (!role || !roleAtLeast(role, minimum)) throw Errors.forbiddenRole();
  }

  private validateCycleAndCustomDays(cycle: Cycle, customDays: number | null) {
    if (cycle === 'CUSTOM_DAYS') {
      if (customDays === null || customDays === undefined) {
        throw Errors.billCustomDaysRequired();
      }
      if (!Number.isInteger(customDays) || customDays < 1 || customDays > 366) {
        throw Errors.billCustomDaysInvalid({ got: customDays });
      }
    } else if (customDays !== null && customDays !== undefined) {
      throw Errors.validation('customDays must be null unless cycle = CUSTOM_DAYS.', {
        field: 'customDays',
      });
    }
  }
}

// ---- module-local helpers ----

export function billToDTO(row: BillRow): BillDTO {
  return {
    id: row.id,
    householdId: row.householdId,
    name: row.name,
    amountMinor: row.amountMinor.toString(),
    currencyCode: row.currencyCode,
    accountId: row.accountId,
    categoryId: row.categoryId,
    cycle: row.cycle as BillDTO['cycle'],
    customDays: row.customDays ?? null,
    startAt: row.startAt.toISOString(),
    nextDueAt: row.nextDueAt.toISOString(),
    endAt: row.endAt ? row.endAt.toISOString() : null,
    status: row.status as BillDTO['status'],
    autoLog: row.autoLog,
    lastPaidAt: row.lastPaidAt ? row.lastPaidAt.toISOString() : null,
    note: row.note,
    colorToken: row.colorToken,
    iconToken: row.iconToken,
    displayOrder: row.displayOrder,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function paymentToDTO(row: BillPaymentRow): BillPaymentDTO {
  return {
    id: row.id,
    householdId: row.householdId,
    billId: row.billId,
    transactionId: row.transactionId,
    cycleDueAt: row.cycleDueAt.toISOString(),
    paidAt: row.paidAt.toISOString(),
    amountMinor: row.amountMinor.toString(),
    source: row.source as BillPaymentDTO['source'],
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function recordEvent(
  tx: AnyTx,
  householdId: string,
  actorId: string | null,
  type: EventType,
  payload: unknown,
) {
  await tx.$executeRaw`
    INSERT INTO events (id, household_id, actor_id, type, payload)
    VALUES (${newId()}, ${householdId}, ${actorId}, ${type}, ${JSON.stringify(payload)}::jsonb)
  `;
}

function normalizeNote(n: string | null | undefined): string | null {
  if (n === undefined || n === null) return null;
  const t = n.trim();
  return t.length === 0 ? null : t;
}

function mapBillUniqueViolation(err: unknown, name: string): Error {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return Errors.billNameTaken(name);
  }
  return err as Error;
}
