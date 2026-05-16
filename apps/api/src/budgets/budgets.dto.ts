import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  BudgetScopeEnum as CoreBudgetScopeEnum,
  BudgetPeriodEnum as CoreBudgetPeriodEnum,
  BudgetStatusEnum as CoreBudgetStatusEnum,
  CreateBudgetInputBase,
  UpdateBudgetInput,
  ReorderBudgetsInput,
  type Budget,
} from '@nayanam/core/budgets/schemas';

/**
 * Budgets DTOs. Body schemas derive from the shared `@nayanam/core` schemas
 * (B4). Query schemas stay local — Express string-coercion variants.
 */

export const BudgetScopeEnum = CoreBudgetScopeEnum;
export const BudgetPeriodEnum = CoreBudgetPeriodEnum;
export const BudgetStatusEnum = CoreBudgetStatusEnum;

/**
 * Create body. The shared `CreateBudgetInputBase` is the un-refined field
 * shape: the budgets service re-checks the scope/category coupling itself so
 * it can throw the stable BUDGET_CATEGORY_REQUIRED / BUDGET_CATEGORY_FORBIDDEN
 * codes — adopting the `.superRefine`d `CreateBudgetInput` would collapse those
 * to a generic VALIDATION_ERROR. Web/mobile forms use the refined variant.
 */
export const CreateBudgetSchema = CreateBudgetInputBase.strict();
export class CreateBudgetDto extends createZodDto(CreateBudgetSchema) {}

/**
 * `UpdateBudgetInput` per contract only lists mutable fields. We accept the
 * immutable fields too so the service layer can reject them with the correct
 * error code (BUDGET_SCOPE_IMMUTABLE / BUDGET_CURRENCY_IMMUTABLE /
 * BUDGET_PERIOD_IMMUTABLE). A strict Zod rejection would collapse them under a
 * generic VALIDATION_ERROR and lose the stable machine code. Those server-only
 * accept-and-reject stubs are added via a local `.extend`, not pushed to core.
 */
export const UpdateBudgetSchema = UpdateBudgetInput.extend({
  scope: z.string().optional(),
  categoryId: z.string().nullable().optional(),
  currencyCode: z.string().optional(),
  period: z.string().optional(),
  startAt: z.string().optional(),
  status: z.string().optional(),
}).strict();
export class UpdateBudgetDto extends createZodDto(UpdateBudgetSchema) {}

export const ReorderBudgetsEntrySchema = z.object({
  id: z.string().min(1),
  displayOrder: z.number().int().min(0),
});
export const ReorderBudgetsSchema = ReorderBudgetsInput.strict();
export class ReorderBudgetsDto extends createZodDto(ReorderBudgetsSchema) {}

export const ListBudgetsQuerySchema = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    scope: CoreBudgetScopeEnum.optional(),
    status: CoreBudgetStatusEnum.optional(),
    includeArchived: z
      .union([z.boolean(), z.string()])
      .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
      .optional(),
  })
  .passthrough();

export const BudgetsStatusQuerySchema = z
  .object({
    scope: CoreBudgetScopeEnum.optional(),
    includeArchived: z
      .union([z.boolean(), z.string()])
      .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
      .optional(),
    asOf: z.string().datetime().optional(),
  })
  .passthrough();

export const BudgetHistoryQuerySchema = z
  .object({
    periods: z.coerce.number().int().min(1).max(24).optional(),
  })
  .passthrough();

/** Wire shape for a budget row — the shared `Budget` type from core. */
export type BudgetDTO = Budget;

export type BudgetStatusItemDTO = {
  budget: BudgetDTO;
  periodStart: string;
  periodEnd: string;
  effectiveAmountMinor: string;
  spentMinor: string;
  remainingMinor: string;
  progressPercent: number;
  rolloverCarryInMinor: string;
  thresholdsFired: number[];
  isOverspent: boolean;
  isOverThreshold: boolean;
};

export type BudgetsStatusResponseDTO = {
  asOf: string;
  items: BudgetStatusItemDTO[];
};

export type BudgetSuggestionDTO = {
  categoryId: string;
  categoryName: string;
  suggestedAmountMinor: string;
  currencyCode: string;
};

export type BudgetSuggestionsResponseDTO = {
  items: BudgetSuggestionDTO[];
};

export type BudgetHistoryPeriodDTO = {
  periodStart: string;
  periodEnd: string;
  effectiveAmountMinor: string;
  spentMinor: string;
  remainingMinor: string;
  isOverspent: boolean;
  thresholdsFired: number[];
};

export type BudgetHistoryResponseDTO = {
  budgetId: string;
  periods: BudgetHistoryPeriodDTO[];
};
