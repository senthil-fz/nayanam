// Zod schemas for the Bill domain. Shared by web + mobile.
// Wire shapes match `packages/contracts/openapi.yaml` exactly — bigints are
// strings (decimal), dates are ISO-8601 strings.

import { z } from 'zod';
import { CurrencyCode } from '../accounts/schemas';

const MinorAmountString = z
  .string()
  .regex(/^\d+$/, 'must be a non-negative integer as a string');

export const BillCycleEnum = z.enum([
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'YEARLY',
  'CUSTOM_DAYS',
]);
export type BillCycle = z.infer<typeof BillCycleEnum>;

export const BillStatusEnum = z.enum(['ACTIVE', 'PAUSED']);
export type BillStatus = z.infer<typeof BillStatusEnum>;

export const BillPaymentSourceEnum = z.enum(['MANUAL', 'AUTO_LOG', 'BACKFILL']);
export type BillPaymentSource = z.infer<typeof BillPaymentSourceEnum>;

export const BillSchema = z.object({
  id: z.string().min(1),
  householdId: z.string().min(1),
  name: z.string().min(1).max(80),
  amountMinor: MinorAmountString,
  currencyCode: CurrencyCode,
  accountId: z.string().min(1),
  categoryId: z.string().min(1),
  cycle: BillCycleEnum,
  customDays: z.number().int().min(1).max(366).nullable(),
  startAt: z.string().datetime(),
  nextDueAt: z.string().datetime(),
  endAt: z.string().datetime().nullable(),
  status: BillStatusEnum,
  autoLog: z.boolean(),
  lastPaidAt: z.string().datetime().nullable(),
  note: z.string().max(500).nullable(),
  colorToken: z.string().nullable(),
  iconToken: z.string().nullable(),
  displayOrder: z.number().int().nonnegative(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Bill = z.infer<typeof BillSchema>;

export const BillPaymentSchema = z.object({
  id: z.string().min(1),
  householdId: z.string().min(1),
  billId: z.string().min(1),
  transactionId: z.string().nullable(),
  cycleDueAt: z.string().datetime(),
  paidAt: z.string().datetime(),
  amountMinor: MinorAmountString,
  source: BillPaymentSourceEnum,
  deletedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type BillPayment = z.infer<typeof BillPaymentSchema>;

// `currencyCode` is NOT accepted on create — the server derives it from the
// target account. See contract CreateBillInput description.
export const CreateBillInput = z.object({
  name: z.string().min(1).max(80),
  amountMinor: MinorAmountString,
  accountId: z.string().min(1),
  categoryId: z.string().min(1),
  cycle: BillCycleEnum,
  customDays: z.number().int().min(1).max(366).nullable().optional(),
  startAt: z.string().datetime().optional(),
  autoLog: z.boolean(),
  note: z.string().max(500).nullable().optional(),
  colorToken: z.string().nullable().optional(),
  iconToken: z.string().nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
});
export type CreateBillInputType = z.infer<typeof CreateBillInput>;

// PATCH — all fields optional; `currencyCode` is immutable and not accepted.
export const UpdateBillInput = z.object({
  name: z.string().min(1).max(80).optional(),
  amountMinor: MinorAmountString.optional(),
  accountId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  cycle: BillCycleEnum.optional(),
  customDays: z.number().int().min(1).max(366).nullable().optional(),
  startAt: z.string().datetime().optional(),
  autoLog: z.boolean().optional(),
  note: z.string().max(500).nullable().optional(),
  colorToken: z.string().nullable().optional(),
  iconToken: z.string().nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
});
export type UpdateBillInputType = z.infer<typeof UpdateBillInput>;

export const MarkBillPaidInput = z.object({
  amountMinor: MinorAmountString.optional(),
  occurredAt: z.string().datetime().optional(),
  note: z.string().max(500).nullable().optional(),
  source: BillPaymentSourceEnum.optional(),
});
export type MarkBillPaidInputType = z.infer<typeof MarkBillPaidInput>;

export const ReorderBillsEntry = z.object({
  id: z.string().min(1),
  displayOrder: z.number().int().nonnegative(),
});

export const ReorderBillsInput = z.object({
  order: z.array(ReorderBillsEntry),
});
export type ReorderBillsInputType = z.infer<typeof ReorderBillsInput>;

export const ReorderBillsResponse = z.object({
  items: z.array(BillSchema),
});
export type ReorderBillsResponseType = z.infer<typeof ReorderBillsResponse>;

export const BillsPage = z.object({
  items: z.array(BillSchema),
  nextCursor: z.string().nullable(),
});
export type BillsPageType = z.infer<typeof BillsPage>;

export const BillPaymentsPage = z.object({
  items: z.array(BillPaymentSchema),
  nextCursor: z.string().nullable(),
});
export type BillPaymentsPageType = z.infer<typeof BillPaymentsPage>;

export const BillsSummaryCurrencyBucket = z.object({
  currencyCode: CurrencyCode,
  monthlyCostMinor: MinorAmountString,
  dueSoonMinor: MinorAmountString,
  activeCount: z.number().int().nonnegative(),
  pausedCount: z.number().int().nonnegative(),
  dueSoonCount: z.number().int().nonnegative(),
});
export type BillsSummaryCurrencyBucketType = z.infer<typeof BillsSummaryCurrencyBucket>;

export const BillsSummaryTotalsAllCurrencies = z.object({
  activeCount: z.number().int().nonnegative(),
  pausedCount: z.number().int().nonnegative(),
});
export type BillsSummaryTotalsAllCurrenciesType = z.infer<
  typeof BillsSummaryTotalsAllCurrencies
>;

export const BillsSummaryResponse = z.object({
  byCurrency: z.array(BillsSummaryCurrencyBucket),
  totalsAllCurrencies: BillsSummaryTotalsAllCurrencies,
});
export type BillsSummaryResponseType = z.infer<typeof BillsSummaryResponse>;

export const UpcomingBillItem = z.object({
  bill: BillSchema,
  dueAt: z.string().datetime(),
  daysUntilDue: z.number().int(),
});
export type UpcomingBillItemType = z.infer<typeof UpcomingBillItem>;

export const BillsUpcomingResponse = z.object({
  items: z.array(UpcomingBillItem),
});
export type BillsUpcomingResponseType = z.infer<typeof BillsUpcomingResponse>;

export const MarkBillPaidResponse = z.object({
  bill: BillSchema,
  payment: BillPaymentSchema,
  // `transaction` is typed as unknown here — the core's Transaction Zod schema
  // lives in `../transactions/schemas` but we avoid a hard runtime parse for
  // it here to keep this module dependency-light. Consumers who want a parsed
  // transaction should pass the response through `TransactionSchema` explicitly.
  transaction: z.unknown(),
});
export type MarkBillPaidResponseType = z.infer<typeof MarkBillPaidResponse>;

export type BillsListFilter = 'all' | 'due-soon' | 'active' | 'paused';
