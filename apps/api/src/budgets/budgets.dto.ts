import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

/** Mirrors `packages/core/src/budgets/schemas.ts`. Kept here for class-based DI. */

export const BudgetScopeEnum = z.enum(['HOUSEHOLD', 'CATEGORY']);
export const BudgetPeriodEnum = z.enum(['WEEKLY', 'MONTHLY']);
export const BudgetStatusEnum = z.enum(['ACTIVE', 'PAUSED']);

const PositiveMinorSchema = z
  .string()
  .regex(/^[1-9]\d*$/, 'Amount must be a positive integer string in minor units.');
const NameSchema = z.string().trim().min(1).max(60);
const CurrencyCodeSchema = z
  .string()
  .trim()
  .length(3)
  .regex(/^[A-Z]{3}$/, 'currencyCode must be an uppercase ISO 4217 code.');

export const CreateBudgetSchema = z
  .object({
    name: NameSchema,
    scope: BudgetScopeEnum,
    categoryId: z.string().min(1).nullable().optional(),
    amountMinor: PositiveMinorSchema,
    currencyCode: CurrencyCodeSchema,
    period: BudgetPeriodEnum,
    rollover: z.boolean().optional(),
    startAt: z.string().datetime().optional(),
    endAt: z.string().datetime().nullable().optional(),
    displayOrder: z.number().int().min(0).optional(),
  })
  .strict();
export class CreateBudgetDto extends createZodDto(CreateBudgetSchema) {}

/**
 * `UpdateBudgetInput` per contract only lists mutable fields. We accept the
 * immutable fields too so the service layer can reject them with the correct
 * error code (BUDGET_SCOPE_IMMUTABLE / BUDGET_CURRENCY_IMMUTABLE /
 * BUDGET_PERIOD_IMMUTABLE). A strict Zod rejection would collapse them under a
 * generic VALIDATION_ERROR and lose the stable machine code.
 */
export const UpdateBudgetSchema = z
  .object({
    name: NameSchema.optional(),
    amountMinor: PositiveMinorSchema.optional(),
    rollover: z.boolean().optional(),
    endAt: z.string().datetime().nullable().optional(),
    displayOrder: z.number().int().min(0).optional(),
    // Reject in service with the specific *_IMMUTABLE code.
    scope: z.string().optional(),
    categoryId: z.string().nullable().optional(),
    currencyCode: z.string().optional(),
    period: z.string().optional(),
    startAt: z.string().optional(),
    status: z.string().optional(),
  })
  .strict();
export class UpdateBudgetDto extends createZodDto(UpdateBudgetSchema) {}

export const ReorderBudgetsEntrySchema = z.object({
  id: z.string().min(1),
  displayOrder: z.number().int().min(0),
});
export const ReorderBudgetsSchema = z
  .object({ order: z.array(ReorderBudgetsEntrySchema).min(1).max(500) })
  .strict();
export class ReorderBudgetsDto extends createZodDto(ReorderBudgetsSchema) {}

export const ListBudgetsQuerySchema = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    scope: BudgetScopeEnum.optional(),
    status: BudgetStatusEnum.optional(),
    includeArchived: z
      .union([z.boolean(), z.string()])
      .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
      .optional(),
  })
  .passthrough();

export const BudgetsStatusQuerySchema = z
  .object({
    scope: BudgetScopeEnum.optional(),
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

export type BudgetDTO = {
  id: string;
  householdId: string;
  name: string;
  scope: 'HOUSEHOLD' | 'CATEGORY';
  categoryId: string | null;
  amountMinor: string;
  currencyCode: string;
  period: 'WEEKLY' | 'MONTHLY';
  rollover: boolean;
  status: 'ACTIVE' | 'PAUSED';
  startAt: string;
  endAt: string | null;
  displayOrder: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

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
