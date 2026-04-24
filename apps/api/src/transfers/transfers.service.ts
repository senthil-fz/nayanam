import { Injectable } from '@nestjs/common';
import { Prisma, type Transfer as TransferRow } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BalanceService } from '../accounts/balance.service';
import { CategoriesService } from '../categories/categories.service';
import { BudgetsService } from '../budgets/budgets.service';
import { toDTO as txToDTO } from '../transactions/transactions.service';
import type { TransactionDTO } from '../transactions/transactions.dto';
import { Errors } from '../common/errors';
import { newId } from '../common/ids';
import { getAuthOrThrow, getContext, getHouseholdOrThrow } from '../common/context';
import { roleAtLeast, type HouseholdRole } from '../common/household-header.guard';
import type { TransferDTO } from './transfers.dto';

const WRITE_ROLE = 'MEMBER' as const;
const TERMINAL_ROLE = 'ADMIN' as const;

type AnyTx = Prisma.TransactionClient | PrismaService;

type TransferBundle = {
  transfer: TransferDTO;
  sourceTransaction: TransactionDTO;
  destinationTransaction: TransactionDTO;
};

@Injectable()
export class TransfersService {
  private cachedTransferCategoryId: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly balance: BalanceService,
    private readonly categories: CategoriesService,
    private readonly budgets: BudgetsService,
  ) {}

  async get(id: string): Promise<TransferBundle> {
    const householdId = getHouseholdOrThrow();
    const transfer = await this.prisma.transfer.findFirst({
      where: { id, householdId, deletedAt: null },
    });
    if (!transfer) throw Errors.notFound();

    const pair = await this.prisma.transaction.findMany({
      where: { householdId, transferId: id },
    });
    return this.bundle(transfer, pair);
  }

  async create(input: {
    sourceAccountId: string;
    destinationAccountId: string;
    amountMinor: string;
    currencyCode: string;
    occurredAt?: string;
    note?: string | null;
  }): Promise<TransferBundle> {
    this.assertRole(WRITE_ROLE);
    const householdId = getHouseholdOrThrow();
    const { userId } = getAuthOrThrow();

    if (input.sourceAccountId === input.destinationAccountId) {
      throw Errors.transferSameAccount();
    }

    const currencyCode = input.currencyCode.toUpperCase();
    const amount = BigInt(input.amountMinor);
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

    const transferCategoryId = await this.resolveTransferCategoryId();

    const result = await this.prisma.$transaction(async (tx) => {
      const [src, dst] = await Promise.all([
        tx.account.findFirst({
          where: { id: input.sourceAccountId, householdId, deletedAt: null },
        }),
        tx.account.findFirst({
          where: { id: input.destinationAccountId, householdId, deletedAt: null },
        }),
      ]);
      if (!src || !dst) throw Errors.notFound();
      if (src.archivedAt || dst.archivedAt) throw Errors.transferAccountArchived();
      if (src.currencyCode !== currencyCode || dst.currencyCode !== currencyCode) {
        throw Errors.transferCurrencyMismatch({
          expected: currencyCode,
          sourceCurrency: src.currencyCode,
          destinationCurrency: dst.currencyCode,
        });
      }

      const transferId = newId();
      const note = normalizeNote(input.note);

      const transfer = await tx.transfer.create({
        data: {
          id: transferId,
          householdId,
          sourceAccountId: input.sourceAccountId,
          destinationAccountId: input.destinationAccountId,
          amountMinor: amount,
          currencyCode,
          occurredAt,
          note,
          createdBy: userId,
          updatedBy: userId,
        },
      });

      const sourceId = newId();
      const destId = newId();

      // Deadlock-safe: lock accounts in ascending id order via applyDelta's
      // SELECT FOR UPDATE; we call the lower id first.
      const firstAcct =
        input.sourceAccountId < input.destinationAccountId
          ? input.sourceAccountId
          : input.destinationAccountId;
      const secondAcct = firstAcct === input.sourceAccountId
        ? input.destinationAccountId
        : input.sourceAccountId;
      const firstDelta = firstAcct === input.sourceAccountId ? -amount : amount;
      const secondDelta = -firstDelta;

      const sourceTx = await tx.transaction.create({
        data: {
          id: sourceId,
          householdId,
          accountId: input.sourceAccountId,
          categoryId: transferCategoryId,
          type: 'TRANSFER',
          amountMinor: amount,
          currencyCode,
          occurredAt,
          note,
          transferId,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      const destTx = await tx.transaction.create({
        data: {
          id: destId,
          householdId,
          accountId: input.destinationAccountId,
          categoryId: transferCategoryId,
          type: 'TRANSFER',
          amountMinor: amount,
          currencyCode,
          occurredAt,
          note,
          transferId,
          createdBy: userId,
          updatedBy: userId,
        },
      });

      await this.balance.applyDelta(tx, firstAcct, firstDelta, occurredAt);
      await this.balance.applyDelta(tx, secondAcct, secondDelta, occurredAt);

      await recordEvent(tx, householdId, userId, 'transfer.created', {
        transferId,
        sourceAccountId: input.sourceAccountId,
        destinationAccountId: input.destinationAccountId,
        amountMinor: amount.toString(),
        currencyCode,
        occurredAt: occurredAt.toISOString(),
        sourceTransactionId: sourceId,
        destinationTransactionId: destId,
      });

      // Transfer pair rows are excluded from budget spend sums (transfer_id
      // IS NULL in the SUM predicate), so no thresholds can fire here. Still
      // invoke the evaluator for consistency with TransactionsService — it
      // re-confirms current period progress cheaply.
      await this.budgets.evaluateForTransactionMutation(
        tx,
        householdId,
        [transferCategoryId],
        [currencyCode],
      );

      return this.bundle(transfer, [sourceTx, destTx]);
    });

    return result;
  }

  async softDelete(id: string): Promise<TransferBundle> {
    this.assertRole(TERMINAL_ROLE);
    const householdId = getHouseholdOrThrow();
    const { userId } = getAuthOrThrow();

    const existing = await this.prisma.transfer.findFirst({
      where: { id, householdId },
    });
    if (!existing) throw Errors.notFound();
    if (existing.deletedAt) {
      const pair = await this.prisma.transaction.findMany({
        where: { householdId, transferId: id },
      });
      return this.bundle(existing, pair);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const pair = await tx.transaction.findMany({
        where: { householdId, transferId: id },
      });

      const amount = existing.amountMinor;
      // Reverse both deltas. Source had -amount applied; reverse is +amount.
      await this.balance.applyDelta(
        tx,
        existing.sourceAccountId,
        amount,
        existing.occurredAt,
      );
      await this.balance.applyDelta(
        tx,
        existing.destinationAccountId,
        -amount,
        existing.occurredAt,
      );

      await tx.transaction.updateMany({
        where: { householdId, transferId: id, deletedAt: null },
        data: { deletedAt: new Date(), updatedBy: userId },
      });
      const updatedTransfer = await tx.transfer.update({
        where: { id },
        data: { deletedAt: new Date(), updatedBy: userId },
      });

      const refreshed = await tx.transaction.findMany({
        where: { householdId, transferId: id },
      });

      await recordEvent(tx, householdId, userId, 'transfer.deleted', {
        transferId: id,
        sourceAccountId: existing.sourceAccountId,
        destinationAccountId: existing.destinationAccountId,
        amountMinor: amount.toString(),
      });

      await this.budgets.evaluateForTransactionMutation(
        tx,
        householdId,
        [],
        [existing.currencyCode],
      );

      return this.bundle(updatedTransfer, refreshed);
      void pair;
    });
    return result;
  }

  async restore(id: string): Promise<TransferBundle> {
    this.assertRole(TERMINAL_ROLE);
    const householdId = getHouseholdOrThrow();
    const { userId } = getAuthOrThrow();

    const existing = await this.prisma.transfer.findFirst({
      where: { id, householdId },
    });
    if (!existing) throw Errors.notFound();
    if (!existing.deletedAt) {
      const pair = await this.prisma.transaction.findMany({
        where: { householdId, transferId: id },
      });
      return this.bundle(existing, pair);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const [src, dst] = await Promise.all([
        tx.account.findFirst({ where: { id: existing.sourceAccountId, householdId, deletedAt: null } }),
        tx.account.findFirst({ where: { id: existing.destinationAccountId, householdId, deletedAt: null } }),
      ]);
      if (!src || !dst) throw Errors.notFound();
      if (src.archivedAt || dst.archivedAt) throw Errors.accountArchived();

      const amount = existing.amountMinor;
      await this.balance.applyDelta(tx, existing.sourceAccountId, -amount, existing.occurredAt);
      await this.balance.applyDelta(tx, existing.destinationAccountId, amount, existing.occurredAt);

      await tx.transaction.updateMany({
        where: { householdId, transferId: id, deletedAt: { not: null } },
        data: { deletedAt: null, updatedBy: userId },
      });
      const restored = await tx.transfer.update({
        where: { id },
        data: { deletedAt: null, updatedBy: userId },
      });
      const refreshed = await tx.transaction.findMany({
        where: { householdId, transferId: id },
      });

      await recordEvent(tx, householdId, userId, 'transfer.restored', {
        transferId: id,
        sourceAccountId: existing.sourceAccountId,
        destinationAccountId: existing.destinationAccountId,
        amountMinor: amount.toString(),
      });

      await this.budgets.evaluateForTransactionMutation(
        tx,
        householdId,
        [],
        [existing.currencyCode],
      );

      return this.bundle(restored, refreshed);
    });
    return result;
  }

  // ---- helpers ----

  private bundle(
    transfer: TransferRow,
    transactions: Array<Parameters<typeof txToDTO>[0]>,
  ): TransferBundle {
    const source = transactions.find((t) => t.accountId === transfer.sourceAccountId);
    const dest = transactions.find((t) => t.accountId === transfer.destinationAccountId);
    if (!source || !dest) {
      throw Errors.notFound();
    }
    return {
      transfer: transferToDTO(transfer),
      sourceTransaction: txToDTO(source),
      destinationTransaction: txToDTO(dest),
    };
  }

  private async resolveTransferCategoryId(): Promise<string> {
    if (this.cachedTransferCategoryId) return this.cachedTransferCategoryId;
    const row = await this.categories.findSystemByKey('transfer_system');
    if (!row) {
      throw new Error(
        'System TRANSFER category is missing — ensure the phase-3 seed changelog has run.',
      );
    }
    this.cachedTransferCategoryId = row.id;
    return row.id;
  }

  private assertRole(minimum: HouseholdRole) {
    const role = getContext()?.householdRole;
    if (!role || !roleAtLeast(role, minimum)) throw Errors.forbiddenRole();
  }
}

function normalizeNote(n: string | null | undefined): string | null {
  if (n === undefined || n === null) return null;
  const trimmed = n.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function transferToDTO(row: TransferRow): TransferDTO {
  return {
    id: row.id,
    householdId: row.householdId,
    sourceAccountId: row.sourceAccountId,
    destinationAccountId: row.destinationAccountId,
    amountMinor: row.amountMinor.toString(),
    currencyCode: row.currencyCode,
    occurredAt: row.occurredAt.toISOString(),
    note: row.note,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
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
