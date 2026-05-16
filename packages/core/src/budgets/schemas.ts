// Zod schemas for the Budget domain. Shared by web + mobile.
// Wire shapes match `packages/contracts/openapi.yaml` exactly — bigints are
// decimal strings, dates are ISO-8601 strings.

import { z } from 'zod';
import { CurrencyCode } from '../accounts/schemas';

const MinorAmountString = z
  .string()
  .regex(/^\d+$/, 'must be a non-negative integer as a string');

export const BudgetScopeEnum = z.enum(['HOUSEHOLD', 'CATEGORY']);
export type BudgetScope = z.infer<typeof BudgetScopeEnum>;

export const BudgetStatusEnum = z.enum(['ACTIVE', 'PAUSED']);
export type BudgetStatus = z.infer<typeof BudgetStatusEnum>;

export const BudgetPeriodEnum = z.enum(['WEEKLY', 'MONTHLY']);
export type BudgetPeriod = z.infer<typeof BudgetPeriodEnum>;

export const BudgetSchema = z.object({
  id: z.string().min(1),
  householdId: z.string().min(1),
  name: z.string().min(1).max(60),
  scope: BudgetScopeEnum,
  categoryId: z.string().nullable(),
  amountMinor: MinorAmountString,
  currencyCode: CurrencyCode,
  period: BudgetPeriodEnum,
  rollover: z.boolean(),
  status: BudgetStatusEnum,
  startAt: z.string().datetime(),
  endAt: z.string().datetime().nullable(),
  displayOrder: z.number().int().nonnegative(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Budget = z.infer<typeof BudgetSchema>;

// Un-refined field shape. The API DTO consumes this directly: the budgets
// service deliberately re-checks the scope/category coupling so it can throw
// the stable BUDGET_CATEGORY_REQUIRED / BUDGET_CATEGORY_FORBIDDEN codes rather
// than a generic VALIDATION_ERROR. `name` is trimmed (was API-DTO-only).
export const CreateBudgetInputBase = z.object({
  name: z.string().trim().min(1).max(60),
  scope: BudgetScopeEnum,
  categoryId: z.string().min(1).nullable().optional(),
  amountMinor: MinorAmountString.refine((s) => Number(s) > 0, {
    message: 'amountMinor must be > 0',
  }),
  currencyCode: CurrencyCode,
  period: BudgetPeriodEnum,
  rollover: z.boolean().optional().default(false),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().nullable().optional(),
  displayOrder: z.number().int().nonnegative().optional(),
});

// Create: scope/category coupling enforced via `.superRefine` so web/mobile
// forms get an early validation error before the server returns
// BUDGET_CATEGORY_REQUIRED / BUDGET_CATEGORY_FORBIDDEN.
export const CreateBudgetInput = CreateBudgetInputBase.superRefine((v, ctx) => {
    if (v.scope === 'CATEGORY' && !v.categoryId) {
      ctx.addIssue({
        code: 'custom',
        message: 'categoryId is required when scope is CATEGORY',
        path: ['categoryId'],
      });
    }
    if (v.scope === 'HOUSEHOLD' && v.categoryId) {
      ctx.addIssue({
        code: 'custom',
        message: 'categoryId must be null when scope is HOUSEHOLD',
        path: ['categoryId'],
      });
    }
    if (v.startAt && v.endAt) {
      if (new Date(v.endAt).getTime() <= new Date(v.startAt).getTime()) {
        ctx.addIssue({
          code: 'custom',
          message: 'endAt must be after startAt',
          path: ['endAt'],
        });
      }
    }
  });
export type CreateBudgetInputType = z.infer<typeof CreateBudgetInput>;

// Partial update — only mutable fields. `scope`, `categoryId`, `currencyCode`,
// `period`, and `startAt` are immutable per the contract.
export const UpdateBudgetInput = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  amountMinor: MinorAmountString.optional(),
  rollover: z.boolean().optional(),
  endAt: z.string().datetime().nullable().optional(),
  displayOrder: z.number().int().nonnegative().optional(),
});
export type UpdateBudgetInputType = z.infer<typeof UpdateBudgetInput>;

export const ReorderBudgetsEntry = z.object({
  id: z.string().min(1),
  displayOrder: z.number().int().nonnegative(),
});

export const ReorderBudgetsInput = z.object({
  // 1..500 bound — was API-DTO-only; folded into core for parity.
  order: z.array(ReorderBudgetsEntry).min(1).max(500),
});
export type ReorderBudgetsInputType = z.infer<typeof ReorderBudgetsInput>;

export const ReorderBudgetsResponse = z.object({
  items: z.array(BudgetSchema),
});
export type ReorderBudgetsResponseType = z.infer<typeof ReorderBudgetsResponse>;

export const BudgetsPage = z.object({
  items: z.array(BudgetSchema),
  nextCursor: z.string().nullable(),
});
export type BudgetsPageType = z.infer<typeof BudgetsPage>;

export const BudgetsStatusItem = z.object({
  budget: BudgetSchema,
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  effectiveAmountMinor: MinorAmountString,
  spentMinor: MinorAmountString,
  // `remainingMinor` is signed — may start with '-' when overspent.
  remainingMinor: z.string().regex(/^-?\d+$/),
  progressPercent: z.number().int().nonnegative(),
  thresholdsFired: z.array(z.number().int()),
  rolloverCarryInMinor: MinorAmountString,
  isOverspent: z.boolean(),
  isOverThreshold: z.boolean(),
});
export type BudgetsStatusItemType = z.infer<typeof BudgetsStatusItem>;

export const BudgetsStatusResponse = z.object({
  asOf: z.string().datetime(),
  items: z.array(BudgetsStatusItem),
});
export type BudgetsStatusResponseType = z.infer<typeof BudgetsStatusResponse>;

// Contract note: the BudgetSuggestion schema in openapi.yaml does NOT include
// `trailing30dSpendMinor` — only `categoryId`, `categoryName`,
// `suggestedAmountMinor`, `currencyCode`. We mirror the contract.
export const BudgetSuggestion = z.object({
  categoryId: z.string().min(1),
  categoryName: z.string().min(1),
  suggestedAmountMinor: MinorAmountString,
  currencyCode: CurrencyCode,
});
export type BudgetSuggestionType = z.infer<typeof BudgetSuggestion>;

export const BudgetSuggestionsResponse = z.object({
  items: z.array(BudgetSuggestion),
});
export type BudgetSuggestionsResponseType = z.infer<
  typeof BudgetSuggestionsResponse
>;

// Contract note: the history period adds `remainingMinor` and `isOverspent`
// (beyond the spec sketch) and the response envelope uses `periods` — not
// `items` — and includes `budgetId`. Mirror the contract.
export const BudgetHistoryPeriod = z.object({
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  effectiveAmountMinor: MinorAmountString,
  spentMinor: MinorAmountString,
  remainingMinor: z.string().regex(/^-?\d+$/),
  isOverspent: z.boolean(),
  thresholdsFired: z.array(z.number().int()),
});
export type BudgetHistoryPeriodType = z.infer<typeof BudgetHistoryPeriod>;

export const BudgetHistoryResponse = z.object({
  budgetId: z.string().min(1),
  periods: z.array(BudgetHistoryPeriod),
});
export type BudgetHistoryResponseType = z.infer<typeof BudgetHistoryResponse>;
