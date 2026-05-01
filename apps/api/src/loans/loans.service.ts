import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type Loan as LoanRow,
  type LoanLumpSum as LoanLumpSumRow,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Errors } from '../common/errors';
import { newId } from '../common/ids';
import { isSupportedCurrency } from '../common/currencies';
import {
  getAuthOrThrow,
  getContext,
  getHouseholdOrThrow,
} from '../common/context';
import { roleAtLeast, type HouseholdRole } from '../common/household-header.guard';
import { recordEvent } from '../bills/bills.service';
import type {
  LoanDTO,
  LoanLumpSumDTO,
  LoanStatus,
} from './loans.dto';
import {
  type AmortizationInput,
  type AmortizationLumpSum,
  type AmortizationSchedule,
  computeBaseMonthlyPayment,
  computeSavings,
  computeSchedule,
} from './amortization';

type AnyTx = Prisma.TransactionClient;

const VIEWER: HouseholdRole = 'VIEWER';
const MEMBER: HouseholdRole = 'MEMBER';
const ADMIN: HouseholdRole = 'ADMIN';

type LumpSumInput = {
  amountMinor: string;
  appliedAtMonth: number;
  note?: string | null;
};

@Injectable()
export class LoansService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- reads ----

  async list(params: {
    cursor?: string;
    limit?: number;
    status?: LoanStatus;
    includeArchived?: boolean;
  }): Promise<{ items: LoanDTO[]; nextCursor: string | null }> {
    this.assertRole(VIEWER);
    const householdId = getHouseholdOrThrow();
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);

    const where: Prisma.LoanWhereInput = {
      householdId,
      deletedAt: null,
      ...(params.includeArchived ? {} : { archivedAt: null }),
      ...(params.status ? { status: params.status } : {}),
    };

    const rows = await this.prisma.loan.findMany({
      where,
      orderBy: [
        { displayOrder: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;
    // List items OMIT lumpSums[] per contract.
    return {
      items: page.map((r) => loanToDTO(r, undefined)),
      nextCursor,
    };
  }

  async get(id: string): Promise<LoanDTO> {
    this.assertRole(VIEWER);
    const householdId = getHouseholdOrThrow();
    const row = await this.prisma.loan.findFirst({
      where: { id, householdId, deletedAt: null },
      include: { lumpSums: { orderBy: { appliedAtMonth: 'asc' } } },
    });
    if (!row) throw Errors.notFound();
    return loanToDTO(row, row.lumpSums);
  }

  async summary(): Promise<{
    byCurrency: Array<{
      currencyCode: string;
      totalRemainingPrincipalMinor: string;
      totalMonthlyPaymentMinor: string;
      weightedAprBps: number;
      activeLoanCount: number;
    }>;
  }> {
    this.assertRole(VIEWER);
    const householdId = getHouseholdOrThrow();

    const loans = await this.prisma.loan.findMany({
      where: {
        householdId,
        deletedAt: null,
        archivedAt: null,
        status: 'ACTIVE',
      },
      select: {
        currencyCode: true,
        principalMinor: true,
        aprBps: true,
        termMonths: true,
        paidMonths: true,
        extraMonthlyMinor: true,
      },
    });

    type Bucket = {
      currencyCode: string;
      remaining: bigint;
      monthly: bigint;
      aprNumerator: bigint; // sum(aprBps * remaining)
      count: number;
    };
    const buckets = new Map<string, Bucket>();

    for (const l of loans) {
      // Remaining principal: simulate first paidMonths with zero extras to get
      // the balance heading into month paidMonths+1. Matches the amortization
      // helper's starting-balance derivation.
      const remaining = remainingPrincipalMinor(
        l.principalMinor,
        l.aprBps,
        l.termMonths,
        l.paidMonths,
      );
      const base = computeBaseMonthlyPayment(
        l.principalMinor,
        l.aprBps,
        l.termMonths,
      );
      const monthly = base + l.extraMonthlyMinor;

      let b = buckets.get(l.currencyCode);
      if (!b) {
        b = {
          currencyCode: l.currencyCode,
          remaining: 0n,
          monthly: 0n,
          aprNumerator: 0n,
          count: 0,
        };
        buckets.set(l.currencyCode, b);
      }
      b.remaining += remaining;
      b.monthly += monthly;
      b.aprNumerator += BigInt(l.aprBps) * remaining;
      b.count += 1;
    }

    const byCurrency = Array.from(buckets.values())
      .sort((a, b) => a.currencyCode.localeCompare(b.currencyCode))
      .map((b) => ({
        currencyCode: b.currencyCode,
        totalRemainingPrincipalMinor: b.remaining.toString(),
        totalMonthlyPaymentMinor: b.monthly.toString(),
        weightedAprBps:
          b.remaining > 0n ? Number(b.aprNumerator / b.remaining) : 0,
        activeLoanCount: b.count,
      }));
    return { byCurrency };
  }

  // ---- create ----

  async create(input: {
    name: string;
    principalMinor: string;
    currencyCode: string;
    aprBps: number;
    termMonths: number;
    startDate: string;
    paidMonths?: number;
    extraMonthlyMinor?: string;
    note?: string | null;
    colorToken?: string | null;
    iconToken?: string | null;
    displayOrder?: number;
    lumpSums?: LumpSumInput[];
  }): Promise<LoanDTO> {
    this.assertRole(MEMBER);
    const householdId = getHouseholdOrThrow();
    const { userId } = getAuthOrThrow();

    // Validate business invariants (beyond Zod bounds).
    if (input.aprBps < 0 || input.aprBps > 20_000) {
      throw Errors.loanAprOutOfRange({ got: input.aprBps });
    }
    if (input.termMonths < 1 || input.termMonths > 600) {
      throw Errors.loanTermOutOfRange({ got: input.termMonths });
    }
    const paidMonths = input.paidMonths ?? 0;
    if (paidMonths > input.termMonths) {
      throw Errors.loanPaidMonthsExceedsTerm({
        paidMonths,
        termMonths: input.termMonths,
      });
    }
    const currency = input.currencyCode.toUpperCase();
    if (!isSupportedCurrency(currency)) {
      throw Errors.currencyUnsupported(currency);
    }

    const principal = BigInt(input.principalMinor);
    if (principal <= 0n) {
      throw Errors.validation('principalMinor must be > 0.');
    }
    const extra = input.extraMonthlyMinor ? BigInt(input.extraMonthlyMinor) : 0n;
    if (extra < 0n) {
      throw Errors.validation('extraMonthlyMinor must be ≥ 0.');
    }

    const lumpSums = input.lumpSums ?? [];
    for (const ls of lumpSums) {
      this.assertLumpSumMonthInRange(
        ls.appliedAtMonth,
        paidMonths,
        input.termMonths,
      );
      if (BigInt(ls.amountMinor) <= 0n) {
        throw Errors.validation('Lump-sum amountMinor must be > 0.');
      }
    }

    const derivedStatus: LoanStatus =
      paidMonths >= input.termMonths ? 'PAID_OFF' : 'ACTIVE';

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const maxOrder = await tx.loan.aggregate({
          where: { householdId, deletedAt: null },
          _max: { displayOrder: true },
        });
        const displayOrder =
          input.displayOrder ?? (maxOrder._max.displayOrder ?? -1) + 1;

        const id = newId();
        const now = new Date();
        const created = await tx.loan.create({
          data: {
            id,
            householdId,
            name: input.name.trim(),
            principalMinor: principal,
            currencyCode: currency,
            aprBps: input.aprBps,
            termMonths: input.termMonths,
            startDate: parseIsoDate(input.startDate),
            paidMonths,
            extraMonthlyMinor: extra,
            note: normalizeNote(input.note, 500),
            colorToken: input.colorToken ?? null,
            iconToken: input.iconToken ?? null,
            status: derivedStatus,
            displayOrder,
            createdBy: userId,
            updatedBy: userId,
            createdAt: now,
            updatedAt: now,
          },
        });

        const lumpRows: LoanLumpSumRow[] = [];
        for (const ls of lumpSums) {
          const lsRow = await tx.loanLumpSum.create({
            data: {
              id: newId(),
              householdId,
              loanId: id,
              amountMinor: BigInt(ls.amountMinor),
              appliedAtMonth: ls.appliedAtMonth,
              note: normalizeNote(ls.note ?? null, 200),
            },
          });
          lumpRows.push(lsRow);
        }

        await recordEvent(tx, householdId, userId, 'loan.created', {
          loanId: created.id,
          name: created.name,
          principalMinor: created.principalMinor.toString(),
          currencyCode: created.currencyCode,
          aprBps: created.aprBps,
          termMonths: created.termMonths,
          paidMonths: created.paidMonths,
          lumpSumCount: lumpRows.length,
          status: created.status,
        });

        return { loan: created, lumpSums: lumpRows };
      });
      return loanToDTO(row.loan, row.lumpSums);
    } catch (err) {
      throw mapLoanUniqueViolation(err, input.name);
    }
  }

  // ---- update ----

  async update(
    id: string,
    patch: {
      name?: string;
      principalMinor?: string;
      currencyCode?: string;
      aprBps?: number;
      termMonths?: number;
      startDate?: string;
      paidMonths?: number;
      extraMonthlyMinor?: string;
      note?: string | null;
      colorToken?: string | null;
      iconToken?: string | null;
      displayOrder?: number;
      lumpSums?: LumpSumInput[];
    },
  ): Promise<LoanDTO> {
    this.assertRole(MEMBER);
    const { userId } = getAuthOrThrow();
    const householdId = getHouseholdOrThrow();

    if (patch.currencyCode !== undefined) throw Errors.loanCurrencyImmutable();

    const existing = await this.prisma.loan.findFirst({
      where: { id, householdId, deletedAt: null },
    });
    if (!existing) throw Errors.notFound();
    if (existing.archivedAt) throw Errors.loanArchived();
    if (existing.status === 'PAID_OFF') {
      // Spec §6: editing a PAID_OFF loan requires restore first. (The loan is
      // not archived yet but it's not re-editable — restore normalizes.)
      throw Errors.loanAlreadyPaidOff();
    }

    // Derive post-patch values for validation.
    const newAprBps = patch.aprBps ?? existing.aprBps;
    const newTermMonths = patch.termMonths ?? existing.termMonths;
    const newPaidMonths = patch.paidMonths ?? existing.paidMonths;
    if (newAprBps < 0 || newAprBps > 20_000) {
      throw Errors.loanAprOutOfRange({ got: newAprBps });
    }
    if (newTermMonths < 1 || newTermMonths > 600) {
      throw Errors.loanTermOutOfRange({ got: newTermMonths });
    }
    if (newPaidMonths > newTermMonths) {
      throw Errors.loanPaidMonthsExceedsTerm({
        paidMonths: newPaidMonths,
        termMonths: newTermMonths,
      });
    }

    if (patch.principalMinor !== undefined) {
      if (BigInt(patch.principalMinor) <= 0n) {
        throw Errors.validation('principalMinor must be > 0.');
      }
    }
    if (patch.extraMonthlyMinor !== undefined) {
      if (BigInt(patch.extraMonthlyMinor) < 0n) {
        throw Errors.validation('extraMonthlyMinor must be ≥ 0.');
      }
    }

    if (patch.lumpSums !== undefined) {
      for (const ls of patch.lumpSums) {
        this.assertLumpSumMonthInRange(
          ls.appliedAtMonth,
          newPaidMonths,
          newTermMonths,
        );
        if (BigInt(ls.amountMinor) <= 0n) {
          throw Errors.validation('Lump-sum amountMinor must be > 0.');
        }
      }
    }

    const derivedStatus: LoanStatus =
      newPaidMonths >= newTermMonths ? 'PAID_OFF' : 'ACTIVE';

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const data: Prisma.LoanUpdateInput = {
          updatedBy: userId,
          updatedAt: new Date(),
          status: derivedStatus,
        };
        const changed: string[] = [];

        if (patch.name !== undefined && patch.name.trim() !== existing.name) {
          data.name = patch.name.trim();
          changed.push('name');
        }
        if (
          patch.principalMinor !== undefined &&
          BigInt(patch.principalMinor) !== existing.principalMinor
        ) {
          data.principalMinor = BigInt(patch.principalMinor);
          changed.push('principalMinor');
        }
        if (patch.aprBps !== undefined && patch.aprBps !== existing.aprBps) {
          data.aprBps = patch.aprBps;
          changed.push('aprBps');
        }
        if (
          patch.termMonths !== undefined &&
          patch.termMonths !== existing.termMonths
        ) {
          data.termMonths = patch.termMonths;
          changed.push('termMonths');
        }
        if (patch.startDate !== undefined) {
          const d = parseIsoDate(patch.startDate);
          if (d.getTime() !== existing.startDate.getTime()) {
            data.startDate = d;
            changed.push('startDate');
          }
        }
        if (
          patch.paidMonths !== undefined &&
          patch.paidMonths !== existing.paidMonths
        ) {
          data.paidMonths = patch.paidMonths;
          changed.push('paidMonths');
        }
        if (patch.extraMonthlyMinor !== undefined) {
          const v = BigInt(patch.extraMonthlyMinor);
          if (v !== existing.extraMonthlyMinor) {
            data.extraMonthlyMinor = v;
            changed.push('extraMonthlyMinor');
          }
        }
        if (patch.note !== undefined) {
          const nn = normalizeNote(patch.note, 500);
          if (nn !== existing.note) {
            data.note = nn;
            changed.push('note');
          }
        }
        if (
          patch.colorToken !== undefined &&
          patch.colorToken !== existing.colorToken
        ) {
          data.colorToken = patch.colorToken;
          changed.push('colorToken');
        }
        if (
          patch.iconToken !== undefined &&
          patch.iconToken !== existing.iconToken
        ) {
          data.iconToken = patch.iconToken;
          changed.push('iconToken');
        }
        if (
          patch.displayOrder !== undefined &&
          patch.displayOrder !== existing.displayOrder
        ) {
          data.displayOrder = patch.displayOrder;
          changed.push('displayOrder');
        }

        const updated = await tx.loan.update({ where: { id }, data });

        if (patch.lumpSums !== undefined) {
          await tx.loanLumpSum.deleteMany({ where: { loanId: id, householdId } });
          for (const ls of patch.lumpSums) {
            await tx.loanLumpSum.create({
              data: {
                id: newId(),
                householdId,
                loanId: id,
                amountMinor: BigInt(ls.amountMinor),
                appliedAtMonth: ls.appliedAtMonth,
                note: normalizeNote(ls.note ?? null, 200),
              },
            });
          }
          changed.push('lumpSums');
        }

        if (changed.length > 0) {
          await recordEvent(tx, householdId, userId, 'loan.updated', {
            loanId: id,
            changedFields: changed,
          });
        }

        const freshLumpSums = await tx.loanLumpSum.findMany({
          where: { loanId: id, householdId },
          orderBy: { appliedAtMonth: 'asc' },
        });
        return { loan: updated, lumpSums: freshLumpSums };
      });
      return loanToDTO(result.loan, result.lumpSums);
    } catch (err) {
      throw mapLoanUniqueViolation(err, patch.name ?? existing.name);
    }
  }

  // ---- archive / restore ----

  async archiveOrDelete(id: string): Promise<LoanDTO> {
    this.assertRole(ADMIN);
    const { userId } = getAuthOrThrow();
    const householdId = getHouseholdOrThrow();

    const existing = await this.prisma.loan.findFirst({
      where: { id, householdId, deletedAt: null },
    });
    if (!existing) throw Errors.notFound();

    const result = await this.prisma.$transaction(async (tx) => {
      const lumpCount = await tx.loanLumpSum.count({
        where: { loanId: id, householdId },
      });

      // Hard-delete heuristic per spec §6: no lump sums AND not yet archived
      // (= never engaged).
      if (lumpCount === 0 && !existing.archivedAt) {
        const row = await tx.loan.update({
          where: { id },
          data: {
            deletedAt: new Date(),
            displayOrder: null,
            updatedBy: userId,
          },
        });
        await recordEvent(tx, householdId, userId, 'loan.deleted', {
          loanId: id,
          name: existing.name,
        });
        return { loan: row, lumpSums: [] as LoanLumpSumRow[] };
      }

      if (existing.archivedAt) {
        const lumpSums = await tx.loanLumpSum.findMany({
          where: { loanId: id, householdId },
          orderBy: { appliedAtMonth: 'asc' },
        });
        return { loan: existing, lumpSums };
      }

      const row = await tx.loan.update({
        where: { id },
        data: {
          archivedAt: new Date(),
          status: 'ARCHIVED',
          displayOrder: null,
          updatedBy: userId,
        },
      });
      await recordEvent(tx, householdId, userId, 'loan.archived', {
        loanId: id,
        name: existing.name,
      });
      const lumpSums = await tx.loanLumpSum.findMany({
        where: { loanId: id, householdId },
        orderBy: { appliedAtMonth: 'asc' },
      });
      return { loan: row, lumpSums };
    });
    return loanToDTO(result.loan, result.lumpSums);
  }

  async restore(id: string): Promise<LoanDTO> {
    this.assertRole(ADMIN);
    const { userId } = getAuthOrThrow();
    const householdId = getHouseholdOrThrow();

    const existing = await this.prisma.loan.findFirst({
      where: { id, householdId, deletedAt: null },
    });
    if (!existing) throw Errors.notFound();

    if (!existing.archivedAt && existing.status !== 'ARCHIVED') {
      const lumpSums = await this.prisma.loanLumpSum.findMany({
        where: { loanId: id, householdId },
        orderBy: { appliedAtMonth: 'asc' },
      });
      return loanToDTO(existing, lumpSums);
    }

    const newStatus: LoanStatus =
      existing.paidMonths >= existing.termMonths ? 'PAID_OFF' : 'ACTIVE';

    const result = await this.prisma
      .$transaction(async (tx) => {
        const maxOrder = await tx.loan.aggregate({
          where: { householdId, deletedAt: null, archivedAt: null },
          _max: { displayOrder: true },
        });
        const tailOrder = (maxOrder._max.displayOrder ?? -1) + 1;

        const row = await tx.loan.update({
          where: { id },
          data: {
            archivedAt: null,
            status: newStatus,
            displayOrder: tailOrder,
            updatedBy: userId,
          },
        });
        await recordEvent(tx, householdId, userId, 'loan.restored', {
          loanId: id,
          name: row.name,
          status: row.status,
        });
        const lumpSums = await tx.loanLumpSum.findMany({
          where: { loanId: id, householdId },
          orderBy: { appliedAtMonth: 'asc' },
        });
        return { loan: row, lumpSums };
      })
      .catch((err: unknown) => {
        throw mapLoanUniqueViolation(err, existing.name);
      });
    return loanToDTO(result.loan, result.lumpSums);
  }

  // ---- reorder ----

  async reorder(
    entries: Array<{ id: string; displayOrder: number }>,
  ): Promise<{ items: LoanDTO[] }> {
    this.assertRole(MEMBER);
    const householdId = getHouseholdOrThrow();
    const { userId } = getAuthOrThrow();

    const active = await this.prisma.loan.findMany({
      where: {
        householdId,
        deletedAt: null,
        archivedAt: null,
      },
      select: { id: true },
    });
    const activeIds = new Set(active.map((a) => a.id));

    const knownAll = await this.prisma.loan.findMany({
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

    const filtered = entries.filter((e) => activeIds.has(e.id));
    filtered.sort((a, b) => a.displayOrder - b.displayOrder);
    const ordered = filtered.map((e) => e.id);
    const remaining = active.map((a) => a.id).filter((id) => !ordered.includes(id));
    const finalOrder = [...ordered, ...remaining];

    const items = await this.prisma.$transaction(async (tx) => {
      await Promise.all(
        finalOrder.map((id, idx) =>
          tx.loan.update({
            where: { id },
            data: { displayOrder: idx, updatedBy: userId },
          }),
        ),
      );
      await recordEvent(tx, householdId, userId, 'loan.reordered', {
        order: finalOrder.map((id, idx) => ({ loanId: id, displayOrder: idx })),
      });
      return tx.loan.findMany({
        where: { householdId, deletedAt: null, archivedAt: null },
        orderBy: [
          { displayOrder: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'asc' },
        ],
      });
    });
    return { items: items.map((r) => loanToDTO(r, undefined)) };
  }

  // ---- compute (read-only) ----

  async compute(
    id: string,
    body: {
      extraMonthlyMinor?: string;
      lumpSums?: LumpSumInput[];
      comparisonBaseline?: 'saved' | 'contractual';
    },
  ): Promise<{
    loan: LoanDTO;
    scenario: SerializedSchedule;
    baseline: SerializedSchedule;
    savings: {
      interestSavedMinor: string;
      monthsSaved: number;
      payoffDateShiftMonths: number;
      effectiveRoiBps: number | null;
    };
  }> {
    this.assertRole(VIEWER);
    const householdId = getHouseholdOrThrow();

    const loan = await this.prisma.loan.findFirst({
      where: { id, householdId, deletedAt: null },
      include: { lumpSums: { orderBy: { appliedAtMonth: 'asc' } } },
    });
    if (!loan) throw Errors.notFound();

    const comparisonBaseline = body.comparisonBaseline ?? 'saved';

    // Resolve scenario inputs: request overrides saved values; omitted falls
    // back to stored.
    const scenarioExtra =
      body.extraMonthlyMinor !== undefined
        ? BigInt(body.extraMonthlyMinor)
        : loan.extraMonthlyMinor;
    if (scenarioExtra < 0n) {
      throw Errors.validation('extraMonthlyMinor must be ≥ 0.');
    }
    const scenarioLumps: AmortizationLumpSum[] =
      body.lumpSums !== undefined
        ? body.lumpSums.map((ls) => ({
            amountMinor: BigInt(ls.amountMinor),
            appliedAtMonth: ls.appliedAtMonth,
          }))
        : loan.lumpSums.map((ls) => ({
            amountMinor: ls.amountMinor,
            appliedAtMonth: ls.appliedAtMonth,
          }));
    for (const ls of scenarioLumps) {
      this.assertLumpSumMonthInRange(
        ls.appliedAtMonth,
        loan.paidMonths,
        loan.termMonths,
      );
      if (ls.amountMinor <= 0n) {
        throw Errors.validation('Lump-sum amountMinor must be > 0.');
      }
    }

    const common: Pick<
      AmortizationInput,
      'principalMinor' | 'aprBps' | 'termMonths' | 'paidMonths' | 'startDate'
    > = {
      principalMinor: loan.principalMinor,
      aprBps: loan.aprBps,
      termMonths: loan.termMonths,
      paidMonths: loan.paidMonths,
      startDate: toIsoDateString(loan.startDate),
    };

    const scenario = computeSchedule({
      ...common,
      extraMonthlyMinor: scenarioExtra,
      lumpSums: scenarioLumps,
    });

    let baseline: AmortizationSchedule;
    if (comparisonBaseline === 'contractual') {
      baseline = computeSchedule({
        ...common,
        extraMonthlyMinor: 0n,
        lumpSums: [],
      });
    } else {
      baseline = computeSchedule({
        ...common,
        extraMonthlyMinor: loan.extraMonthlyMinor,
        lumpSums: loan.lumpSums.map((ls) => ({
          amountMinor: ls.amountMinor,
          appliedAtMonth: ls.appliedAtMonth,
        })),
      });
    }

    const savings = computeSavings(baseline, scenario);

    return {
      loan: loanToDTO(loan, loan.lumpSums),
      scenario: serializeSchedule(scenario),
      baseline: serializeSchedule(baseline),
      savings: {
        interestSavedMinor: savings.interestSavedMinor.toString(),
        monthsSaved: savings.monthsSaved,
        payoffDateShiftMonths: savings.payoffDateShiftMonths,
        effectiveRoiBps: savings.effectiveRoiBps,
      },
    };
  }

  // ---- helpers ----

  private assertRole(minimum: HouseholdRole) {
    const role = getContext()?.householdRole;
    if (!role || !roleAtLeast(role, minimum)) throw Errors.forbiddenRole();
  }

  private assertLumpSumMonthInRange(
    appliedAtMonth: number,
    paidMonths: number,
    termMonths: number,
  ) {
    if (appliedAtMonth <= paidMonths || appliedAtMonth > termMonths) {
      throw Errors.loanLumpSumMonthOutOfRange({
        appliedAtMonth,
        paidMonths,
        termMonths,
      });
    }
  }
}

// ---- schedule serialization (wire shape) ----

type SerializedRow = {
  month: number;
  paymentMinor: string;
  principalMinor: string;
  interestMinor: string;
  lumpSumMinor: string;
  balanceMinor: string;
};

type SerializedSchedule = {
  baseMonthlyPaymentMinor: string;
  effectiveMonthlyPaymentMinor: string;
  rows: SerializedRow[];
  totals: {
    totalPaidMinor: string;
    totalInterestMinor: string;
    totalPrincipalMinor: string;
    monthsToPayoff: number;
    payoffDate: string;
  };
};

function serializeSchedule(s: AmortizationSchedule): SerializedSchedule {
  return {
    baseMonthlyPaymentMinor: s.baseMonthlyPaymentMinor.toString(),
    effectiveMonthlyPaymentMinor: s.effectiveMonthlyPaymentMinor.toString(),
    rows: s.rows.map((r) => ({
      month: r.month,
      paymentMinor: r.paymentMinor.toString(),
      principalMinor: r.principalMinor.toString(),
      interestMinor: r.interestMinor.toString(),
      lumpSumMinor: r.lumpSumMinor.toString(),
      balanceMinor: r.balanceMinor.toString(),
    })),
    totals: {
      totalPaidMinor: s.totals.totalPaidMinor.toString(),
      totalInterestMinor: s.totals.totalInterestMinor.toString(),
      totalPrincipalMinor: s.totals.totalPrincipalMinor.toString(),
      monthsToPayoff: s.totals.monthsToPayoff,
      payoffDate: s.totals.payoffDate,
    },
  };
}

// ---- remaining-principal helper (summary) ----

/**
 * Derive the current balance after `paidMonths` contractual payments under
 * the stored APR/term. Mirrors the starting-balance simulation inside
 * `computeSchedule` so `/summary` matches `/compute` exactly.
 */
function remainingPrincipalMinor(
  principalMinor: bigint,
  aprBps: number,
  termMonths: number,
  paidMonths: number,
): bigint {
  if (paidMonths <= 0) return principalMinor;
  const base = computeBaseMonthlyPayment(principalMinor, aprBps, termMonths);
  let balance = principalMinor;
  for (let m = 1; m <= paidMonths && balance > 0n; m++) {
    const interest =
      aprBps === 0 || balance <= 0n
        ? 0n
        : (balance * BigInt(aprBps) + 60_000n) / 120_000n;
    let principal = base - interest;
    if (principal < 0n) principal = 0n;
    if (principal > balance) principal = balance;
    balance -= principal;
  }
  return balance;
}

// ---- DTO mapping ----

export function loanToDTO(
  row: LoanRow,
  lumpSums?: LoanLumpSumRow[],
): LoanDTO {
  return {
    id: row.id,
    householdId: row.householdId,
    name: row.name,
    principalMinor: row.principalMinor.toString(),
    currencyCode: row.currencyCode,
    aprBps: row.aprBps,
    termMonths: row.termMonths,
    startDate: toIsoDateString(row.startDate),
    paidMonths: row.paidMonths,
    extraMonthlyMinor: row.extraMonthlyMinor.toString(),
    note: row.note,
    colorToken: row.colorToken,
    iconToken: row.iconToken,
    status: row.status as LoanStatus,
    displayOrder: row.displayOrder,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(lumpSums !== undefined
      ? { lumpSums: lumpSums.map(lumpSumToDTO) }
      : {}),
  };
}

export function lumpSumToDTO(row: LoanLumpSumRow): LoanLumpSumDTO {
  return {
    id: row.id,
    householdId: row.householdId,
    loanId: row.loanId,
    amountMinor: row.amountMinor.toString(),
    appliedAtMonth: row.appliedAtMonth,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---- local helpers ----

function normalizeNote(n: string | null | undefined, max: number): string | null {
  if (n === undefined || n === null) return null;
  const t = n.trim();
  if (t.length === 0) return null;
  if (t.length > max) return t.slice(0, max);
  return t;
}

function parseIsoDate(iso: string): Date {
  // `start_date` is a DATE column — UTC midnight keeps the civil day stable
  // across timezones.
  const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10));
  if (!y || !m || !d) {
    throw Errors.validation('startDate must be ISO YYYY-MM-DD.');
  }
  return new Date(Date.UTC(y, m - 1, d));
}

function toIsoDateString(d: Date): string {
  const yy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function mapLoanUniqueViolation(err: unknown, name: string): Error {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return Errors.loanNameTaken(name);
  }
  return err as Error;
}

void (null as unknown as AnyTx); // keep AnyTx imported for future helpers
