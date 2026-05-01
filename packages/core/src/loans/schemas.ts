// Zod schemas for the Loan domain. Shared by web + mobile.
// Wire shapes mirror `packages/contracts/openapi.yaml` verbatim:
//   - minor-unit amounts are carried as decimal strings for bigint-safety
//   - `startDate` / `payoffDate` are civil calendar dates (YYYY-MM-DD), NOT
//     date-time timestamps — `z.string().regex(...)` rather than `.datetime()`
//   - `createdAt` / `updatedAt` / `archivedAt` remain ISO-8601 timestamps

import { z } from 'zod';
import { CurrencyCode } from '../accounts/schemas';

const MinorAmountString = z
  .string()
  .regex(/^\d+$/, 'must be a non-negative integer as a string');

const DateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a YYYY-MM-DD calendar date');

export const LoanStatusEnum = z.enum(['ACTIVE', 'PAID_OFF', 'ARCHIVED']);
export type LoanStatus = z.infer<typeof LoanStatusEnum>;

export const LoanLumpSumSchema = z.object({
  id: z.string().min(1),
  householdId: z.string().min(1),
  loanId: z.string().min(1),
  amountMinor: MinorAmountString,
  appliedAtMonth: z.number().int().min(1),
  note: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type LoanLumpSum = z.infer<typeof LoanLumpSumSchema>;

export const LoanLumpSumInput = z.object({
  amountMinor: MinorAmountString.refine((s) => Number(s) > 0, {
    message: 'amountMinor must be > 0',
  }),
  appliedAtMonth: z.number().int().min(1),
  note: z.string().max(200).nullable().optional(),
});
export type LoanLumpSumInputType = z.infer<typeof LoanLumpSumInput>;

export const LoanSchema = z.object({
  id: z.string().min(1),
  householdId: z.string().min(1),
  name: z.string().min(1).max(80),
  principalMinor: MinorAmountString,
  currencyCode: CurrencyCode,
  aprBps: z.number().int().min(0).max(20000),
  termMonths: z.number().int().min(1).max(600),
  startDate: DateOnly,
  paidMonths: z.number().int().min(0),
  extraMonthlyMinor: MinorAmountString,
  note: z.string().nullable(),
  colorToken: z.string().nullable(),
  iconToken: z.string().nullable(),
  status: LoanStatusEnum,
  displayOrder: z.number().int().nonnegative().nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  // Populated on single-loan responses; omitted from list items.
  lumpSums: z.array(LoanLumpSumSchema).optional(),
});
export type Loan = z.infer<typeof LoanSchema>;

export const CreateLoanInput = z
  .object({
    name: z.string().min(1).max(80),
    principalMinor: MinorAmountString.refine((s) => Number(s) > 0, {
      message: 'principalMinor must be > 0',
    }),
    currencyCode: CurrencyCode,
    aprBps: z.number().int().min(0).max(20000),
    termMonths: z.number().int().min(1).max(600),
    startDate: DateOnly,
    paidMonths: z.number().int().min(0).optional().default(0),
    extraMonthlyMinor: MinorAmountString.optional(),
    note: z.string().max(500).nullable().optional(),
    colorToken: z.string().nullable().optional(),
    iconToken: z.string().nullable().optional(),
    displayOrder: z.number().int().nonnegative().optional(),
    lumpSums: z.array(LoanLumpSumInput).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.paidMonths !== undefined && v.paidMonths > v.termMonths) {
      ctx.addIssue({
        code: 'custom',
        message: 'paidMonths must be ≤ termMonths',
        path: ['paidMonths'],
      });
    }
    for (const [i, ls] of (v.lumpSums ?? []).entries()) {
      if (ls.appliedAtMonth > v.termMonths) {
        ctx.addIssue({
          code: 'custom',
          message: 'appliedAtMonth must be ≤ termMonths',
          path: ['lumpSums', i, 'appliedAtMonth'],
        });
      }
      if (v.paidMonths !== undefined && ls.appliedAtMonth <= v.paidMonths) {
        ctx.addIssue({
          code: 'custom',
          message: 'appliedAtMonth must be > paidMonths',
          path: ['lumpSums', i, 'appliedAtMonth'],
        });
      }
    }
  });
export type CreateLoanInputType = z.infer<typeof CreateLoanInput>;

// `currencyCode` deliberately OMITTED — the server rejects PATCH carrying it
// with LOAN_CURRENCY_IMMUTABLE 422. `status` is derived server-side.
export const UpdateLoanInput = z.object({
  name: z.string().min(1).max(80).optional(),
  principalMinor: MinorAmountString.optional(),
  aprBps: z.number().int().min(0).max(20000).optional(),
  termMonths: z.number().int().min(1).max(600).optional(),
  startDate: DateOnly.optional(),
  paidMonths: z.number().int().min(0).optional(),
  extraMonthlyMinor: MinorAmountString.optional(),
  note: z.string().max(500).nullable().optional(),
  colorToken: z.string().nullable().optional(),
  iconToken: z.string().nullable().optional(),
  displayOrder: z.number().int().nonnegative().optional(),
  // When present, REPLACES the full lump-sum set atomically.
  lumpSums: z.array(LoanLumpSumInput).optional(),
});
export type UpdateLoanInputType = z.infer<typeof UpdateLoanInput>;

export const ReorderLoansEntry = z.object({
  id: z.string().min(1),
  displayOrder: z.number().int().nonnegative(),
});

export const ReorderLoansInput = z.object({
  order: z.array(ReorderLoansEntry),
});
export type ReorderLoansInputType = z.infer<typeof ReorderLoansInput>;

export const ReorderLoansResponse = z.object({
  items: z.array(LoanSchema),
});
export type ReorderLoansResponseType = z.infer<typeof ReorderLoansResponse>;

export const LoansPage = z.object({
  items: z.array(LoanSchema),
  nextCursor: z.string().nullable(),
});
export type LoansPageType = z.infer<typeof LoansPage>;

export const LoansSummaryCurrencyBucket = z.object({
  currencyCode: CurrencyCode,
  totalRemainingPrincipalMinor: MinorAmountString,
  totalMonthlyPaymentMinor: MinorAmountString,
  weightedAprBps: z.number().int().min(0),
  activeLoanCount: z.number().int().nonnegative(),
});
export type LoansSummaryCurrencyBucketType = z.infer<
  typeof LoansSummaryCurrencyBucket
>;

export const LoansSummaryResponse = z.object({
  byCurrency: z.array(LoansSummaryCurrencyBucket),
});
export type LoansSummaryResponseType = z.infer<typeof LoansSummaryResponse>;

export const AmortizationRowSchema = z.object({
  month: z.number().int().min(1),
  paymentMinor: MinorAmountString,
  principalMinor: MinorAmountString,
  interestMinor: MinorAmountString,
  lumpSumMinor: MinorAmountString,
  balanceMinor: MinorAmountString,
});
export type AmortizationRowWire = z.infer<typeof AmortizationRowSchema>;

export const AmortizationScheduleTotalsSchema = z.object({
  totalPaidMinor: MinorAmountString,
  totalInterestMinor: MinorAmountString,
  totalPrincipalMinor: MinorAmountString,
  monthsToPayoff: z.number().int().min(0),
  payoffDate: DateOnly,
});
export type AmortizationScheduleTotalsWire = z.infer<
  typeof AmortizationScheduleTotalsSchema
>;

export const AmortizationScheduleSchema = z.object({
  baseMonthlyPaymentMinor: MinorAmountString,
  effectiveMonthlyPaymentMinor: MinorAmountString,
  rows: z.array(AmortizationRowSchema),
  totals: AmortizationScheduleTotalsSchema,
});
export type AmortizationScheduleWire = z.infer<
  typeof AmortizationScheduleSchema
>;

export const LoanSavingsSchema = z.object({
  interestSavedMinor: MinorAmountString,
  monthsSaved: z.number().int().min(0),
  payoffDateShiftMonths: z.number().int(),
  effectiveRoiBps: z.number().int().nullable(),
});
export type LoanSavingsWire = z.infer<typeof LoanSavingsSchema>;

export const ComparisonBaselineEnum = z.enum(['saved', 'contractual']);
export type ComparisonBaseline = z.infer<typeof ComparisonBaselineEnum>;

export const ComputeLoanInput = z
  .object({
    extraMonthlyMinor: MinorAmountString.optional(),
    lumpSums: z.array(LoanLumpSumInput).optional(),
    comparisonBaseline: ComparisonBaselineEnum.optional().default('saved'),
  })
  .superRefine((v, ctx) => {
    // `appliedAtMonth` range vs the loan's termMonths / paidMonths is
    // validated server-side because we don't carry the loan here.
    for (const [i, ls] of (v.lumpSums ?? []).entries()) {
      if (ls.appliedAtMonth < 1) {
        ctx.addIssue({
          code: 'custom',
          message: 'appliedAtMonth must be ≥ 1',
          path: ['lumpSums', i, 'appliedAtMonth'],
        });
      }
    }
  });
export type ComputeLoanInputType = z.infer<typeof ComputeLoanInput>;

export const ComputeLoanResponse = z.object({
  loan: LoanSchema,
  scenario: AmortizationScheduleSchema,
  baseline: AmortizationScheduleSchema,
  savings: LoanSavingsSchema,
});
export type ComputeLoanResponseType = z.infer<typeof ComputeLoanResponse>;
