import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  LoanStatusEnum as CoreLoanStatusEnum,
  LoanLumpSumInput,
  CreateLoanInputBase,
  UpdateLoanInput,
  ComputeLoanInputBase,
  ReorderLoansInput,
  type Loan,
  type LoanLumpSum,
} from '@nayanam/core/loans/schemas';

/**
 * Loans DTOs. Body schemas derive from the shared `@nayanam/core` schemas
 * (B4). The create / compute bodies use the *Base (un-refined) variants — the
 * loans service re-validates `paidMonths`/`termMonths`/lump-sum bounds itself
 * so it can throw the stable LOAN_* error codes rather than a generic
 * VALIDATION_ERROR. Query schemas stay local — Express string-coercion
 * variants.
 */

export const LoanStatusEnum = CoreLoanStatusEnum;
export const LumpSumInputSchema = LoanLumpSumInput;

export const CreateLoanSchema = CreateLoanInputBase.strict();
export class CreateLoanDto extends createZodDto(CreateLoanSchema) {}

/**
 * PATCH body. `currencyCode` is accepted-but-rejected with
 * LOAN_CURRENCY_IMMUTABLE at the service layer. Server-only stub — local
 * `.extend`.
 */
export const UpdateLoanSchema = UpdateLoanInput.extend({
  currencyCode: z.string().optional(),
}).strict();
export class UpdateLoanDto extends createZodDto(UpdateLoanSchema) {}

export const ReorderLoansEntrySchema = z.object({
  id: z.string().min(1),
  displayOrder: z.number().int().min(0),
});
export const ReorderLoansSchema = ReorderLoansInput.strict();
export class ReorderLoansDto extends createZodDto(ReorderLoansSchema) {}

export const ComputeLoanSchema = ComputeLoanInputBase.strict();
export class ComputeLoanDto extends createZodDto(ComputeLoanSchema) {}

export const ListLoansQuerySchema = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    status: CoreLoanStatusEnum.optional(),
    includeArchived: z
      .union([z.boolean(), z.string()])
      .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
      .optional(),
  })
  .passthrough();

// --- DTO types (wire shape) — shared `Loan` / `LoanLumpSum` types from core ---

export type LoanStatus = 'ACTIVE' | 'PAID_OFF' | 'ARCHIVED';
export type LoanLumpSumDTO = LoanLumpSum;
export type LoanDTO = Loan;
