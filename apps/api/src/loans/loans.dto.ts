import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

/** Mirrors `packages/core/src/loans/schemas.ts`. */

export const LoanStatusEnum = z.enum(['ACTIVE', 'PAID_OFF', 'ARCHIVED']);

const PositiveMinorSchema = z
  .string()
  .regex(/^[1-9]\d*$/, 'Amount must be a positive integer string in minor units.');
const NonNegativeMinorSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/, 'Amount must be a non-negative integer string in minor units.');
const NameSchema = z.string().trim().min(1).max(80);
const NoteSchema = z.string().max(500).nullable();
const LumpSumNoteSchema = z.string().max(200).nullable();
const ColorTokenSchema = z.string().max(40).nullable();
const IconTokenSchema = z.string().max(40).nullable();
const CurrencySchema = z.string().length(3).regex(/^[A-Z]{3}$/);
const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be ISO YYYY-MM-DD.');

export const LumpSumInputSchema = z
  .object({
    amountMinor: PositiveMinorSchema,
    appliedAtMonth: z.number().int().min(1).max(600),
    note: LumpSumNoteSchema.optional(),
  })
  .strict();

export const CreateLoanSchema = z
  .object({
    name: NameSchema,
    principalMinor: PositiveMinorSchema,
    currencyCode: CurrencySchema,
    aprBps: z.number().int().min(0).max(20_000),
    termMonths: z.number().int().min(1).max(600),
    startDate: IsoDateSchema,
    paidMonths: z.number().int().min(0).max(600).optional(),
    extraMonthlyMinor: NonNegativeMinorSchema.optional(),
    note: NoteSchema.optional(),
    colorToken: ColorTokenSchema.optional(),
    iconToken: IconTokenSchema.optional(),
    displayOrder: z.number().int().min(0).optional(),
    lumpSums: z.array(LumpSumInputSchema).max(500).optional(),
  })
  .strict();
export class CreateLoanDto extends createZodDto(CreateLoanSchema) {}

export const UpdateLoanSchema = z
  .object({
    name: NameSchema.optional(),
    principalMinor: PositiveMinorSchema.optional(),
    // currencyCode intentionally accepted-but-rejected with LOAN_CURRENCY_IMMUTABLE.
    currencyCode: z.string().optional(),
    aprBps: z.number().int().min(0).max(20_000).optional(),
    termMonths: z.number().int().min(1).max(600).optional(),
    startDate: IsoDateSchema.optional(),
    paidMonths: z.number().int().min(0).max(600).optional(),
    extraMonthlyMinor: NonNegativeMinorSchema.optional(),
    note: NoteSchema.optional(),
    colorToken: ColorTokenSchema.optional(),
    iconToken: IconTokenSchema.optional(),
    displayOrder: z.number().int().min(0).optional(),
    lumpSums: z.array(LumpSumInputSchema).max(500).optional(),
  })
  .strict();
export class UpdateLoanDto extends createZodDto(UpdateLoanSchema) {}

export const ReorderLoansEntrySchema = z.object({
  id: z.string().min(1),
  displayOrder: z.number().int().min(0),
});
export const ReorderLoansSchema = z
  .object({ order: z.array(ReorderLoansEntrySchema).min(1).max(500) })
  .strict();
export class ReorderLoansDto extends createZodDto(ReorderLoansSchema) {}

export const ComputeLoanSchema = z
  .object({
    extraMonthlyMinor: NonNegativeMinorSchema.optional(),
    lumpSums: z.array(LumpSumInputSchema).max(500).optional(),
    comparisonBaseline: z.enum(['saved', 'contractual']).optional(),
  })
  .strict();
export class ComputeLoanDto extends createZodDto(ComputeLoanSchema) {}

export const ListLoansQuerySchema = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    status: LoanStatusEnum.optional(),
    includeArchived: z
      .union([z.boolean(), z.string()])
      .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
      .optional(),
  })
  .passthrough();

// --- DTO types (wire shape) ---

export type LoanStatus = 'ACTIVE' | 'PAID_OFF' | 'ARCHIVED';

export type LoanLumpSumDTO = {
  id: string;
  householdId: string;
  loanId: string;
  amountMinor: string;
  appliedAtMonth: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LoanDTO = {
  id: string;
  householdId: string;
  name: string;
  principalMinor: string;
  currencyCode: string;
  aprBps: number;
  termMonths: number;
  startDate: string; // YYYY-MM-DD
  paidMonths: number;
  extraMonthlyMinor: string;
  note: string | null;
  colorToken: string | null;
  iconToken: string | null;
  status: LoanStatus;
  displayOrder: number | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lumpSums?: LoanLumpSumDTO[];
};
