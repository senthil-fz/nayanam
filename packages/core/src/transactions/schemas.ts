// Zod schemas for the Transaction + Transfer domains. Shared by web + mobile.
// Match `packages/contracts/openapi.yaml` exactly — amounts are positive
// integer minor-units encoded as decimal strings on the wire.

import { z } from 'zod';

export const TransactionTypeEnum = z.enum(['INCOME', 'EXPENSE', 'TRANSFER']);
export type TransactionType = z.infer<typeof TransactionTypeEnum>;

// User-driven create is restricted to INCOME | EXPENSE. TRANSFER rows are
// produced server-side by the /transfers endpoint.
export const CreateTransactionTypeEnum = z.enum(['INCOME', 'EXPENSE']);
export type CreateTransactionType = z.infer<typeof CreateTransactionTypeEnum>;

const PositiveMinorString = z
  .string()
  .regex(/^[1-9]\d*$/, 'must be a positive integer as a string');

const CurrencyCode = z.string().regex(/^[A-Z]{3}$/);

export const TransactionSchema = z.object({
  id: z.string().min(1),
  householdId: z.string().min(1),
  accountId: z.string().min(1),
  categoryId: z.string().min(1),
  type: TransactionTypeEnum,
  amountMinor: PositiveMinorString,
  currencyCode: CurrencyCode,
  occurredAt: z.string().datetime(),
  note: z.string().max(500).nullable(),
  transferId: z.string().nullable(),
  deletedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Transaction = z.infer<typeof TransactionSchema>;

export const CreateTransactionInput = z.object({
  accountId: z.string().min(1),
  categoryId: z.string().min(1),
  type: CreateTransactionTypeEnum,
  amountMinor: PositiveMinorString,
  currencyCode: CurrencyCode,
  occurredAt: z.string().datetime().optional(),
  note: z.string().max(500).nullable().optional(),
});
export type CreateTransactionInputType = z.infer<typeof CreateTransactionInput>;

export const UpdateTransactionInput = z
  .object({
    accountId: z.string().min(1),
    categoryId: z.string().min(1),
    amountMinor: PositiveMinorString,
    occurredAt: z.string().datetime(),
    note: z.string().max(500).nullable(),
  })
  .partial();
export type UpdateTransactionInputType = z.infer<typeof UpdateTransactionInput>;

export const ListTransactionsQuery = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  accountId: z.array(z.string()).optional(),
  categoryId: z.array(z.string()).optional(),
  type: TransactionTypeEnum.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  q: z.string().min(1).max(100).optional(),
  includeDeleted: z.boolean().optional(),
  transferId: z.string().optional(),
});
export type ListTransactionsQueryType = z.infer<typeof ListTransactionsQuery>;

export const BulkCreateTransactionsInput = z.object({
  items: z.array(CreateTransactionInput).min(1).max(500),
});
export type BulkCreateTransactionsInputType = z.infer<typeof BulkCreateTransactionsInput>;

// ─────────────────────────── Phase 4 period summary ───────────────────────────

export const HomePeriodEnum = z.enum(['day', 'week', 'month', 'year']);
export type HomePeriodType = z.infer<typeof HomePeriodEnum>;

const SignedMinorString = z
  .string()
  .regex(/^-?\d+$/, 'must be a signed integer as a string');

export const PeriodSummaryBucket = z.object({
  currencyCode: CurrencyCode,
  incomeMinor: SignedMinorString,
  expenseMinor: SignedMinorString,
  netMinor: SignedMinorString,
  transactionCount: z.number().int().nonnegative(),
});
export type PeriodSummaryBucketType = z.infer<typeof PeriodSummaryBucket>;

export const PeriodSummaryRange = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});
export type PeriodSummaryRangeType = z.infer<typeof PeriodSummaryRange>;

export const PeriodSummaryResponse = z.object({
  byCurrency: z.array(PeriodSummaryBucket),
  period: PeriodSummaryRange,
});
export type PeriodSummaryResponseType = z.infer<typeof PeriodSummaryResponse>;

export const PeriodSummaryQuery = z.object({
  period: HomePeriodEnum.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type PeriodSummaryQueryType = z.infer<typeof PeriodSummaryQuery>;

// ─────────────────────────── Transfer ───────────────────────────

export const TransferSchema = z.object({
  id: z.string().min(1),
  householdId: z.string().min(1),
  sourceAccountId: z.string().min(1),
  destinationAccountId: z.string().min(1),
  amountMinor: PositiveMinorString,
  currencyCode: CurrencyCode,
  occurredAt: z.string().datetime(),
  note: z.string().max(500).nullable(),
  deletedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Transfer = z.infer<typeof TransferSchema>;

export const CreateTransferInput = z
  .object({
    sourceAccountId: z.string().min(1),
    destinationAccountId: z.string().min(1),
    amountMinor: PositiveMinorString,
    currencyCode: CurrencyCode,
    occurredAt: z.string().datetime().optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .refine((v) => v.sourceAccountId !== v.destinationAccountId, {
    message: 'source and destination accounts must differ',
    path: ['destinationAccountId'],
  });
export type CreateTransferInputType = z.infer<typeof CreateTransferInput>;

export const TransferWithPairedTransactionsSchema = z.object({
  transfer: TransferSchema,
  sourceTransaction: TransactionSchema,
  destinationTransaction: TransactionSchema,
});
export type TransferWithPairedTransactions = z.infer<
  typeof TransferWithPairedTransactionsSchema
>;
