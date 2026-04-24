import { z } from 'zod';

/**
 * Query schemas for the six Stats endpoints. Mirror the contract at
 * `packages/contracts/openapi.yaml`. Service-layer invariants (span ≤ 2y,
 * currency allowlist, categoryIds cross-tenant check) run in `stats.service`
 * so they can throw stable domain error codes instead of generic
 * VALIDATION_ERROR from Zod.
 */

export const StatsPeriodKindEnum = z.enum(['week', 'month', 'year', 'custom']);
export type StatsPeriodKind = z.infer<typeof StatsPeriodKindEnum>;

const CurrencyCodeSchema = z
  .string()
  .trim()
  .length(3)
  .regex(/^[A-Za-z]{3}$/)
  .transform((v) => v.toUpperCase());

const PeriodQueryBase = z.object({
  period: StatsPeriodKindEnum,
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const OverviewQuerySchema = PeriodQueryBase.extend({
  topCategoriesLimit: z.coerce.number().int().min(1).max(20).optional(),
}).passthrough();

export const MonthlyTrendQuerySchema = z
  .object({
    months: z.coerce.number().int().min(1).max(24).optional(),
    currencyCode: CurrencyCodeSchema.optional(),
  })
  .passthrough();

export const CategoryBreakdownQuerySchema = PeriodQueryBase.extend({
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).optional(),
  currencyCode: CurrencyCodeSchema.optional(),
}).passthrough();

export const DailySpendQuerySchema = z
  .object({
    days: z.coerce.number().int().min(7).max(365).optional(),
    currencyCode: CurrencyCodeSchema.optional(),
  })
  .passthrough();

/**
 * `categoryIds` is a repeated query param. Express parses it as either a
 * string (single value) or string[] (multiple). Normalize to string[].
 */
export const CategorySparklineQuerySchema = z
  .object({
    categoryIds: z
      .union([z.string().min(1), z.array(z.string().min(1))])
      .transform((v) => (Array.isArray(v) ? v : [v])),
    days: z.coerce.number().int().min(7).max(90).optional(),
  })
  .passthrough();

export const SankeyQuerySchema = PeriodQueryBase.extend({
  currencyCode: CurrencyCodeSchema.optional(),
}).passthrough();

export type OverviewQuery = z.infer<typeof OverviewQuerySchema>;
export type MonthlyTrendQuery = z.infer<typeof MonthlyTrendQuerySchema>;
export type CategoryBreakdownQuery = z.infer<typeof CategoryBreakdownQuerySchema>;
export type DailySpendQuery = z.infer<typeof DailySpendQuerySchema>;
export type CategorySparklineQuery = z.infer<typeof CategorySparklineQuerySchema>;
export type SankeyQuery = z.infer<typeof SankeyQuerySchema>;

// ─── Response DTOs (typed shapes for the service). Wire-bigints are strings. ──

export type PeriodDeltaState =
  | 'has_previous'
  | 'no_previous_data'
  | 'zero_to_positive'
  | 'zero_to_negative';

export type StatsPeriodRangeDTO = {
  kind: StatsPeriodKind;
  from: string;
  to: string;
};

export type StatsOverviewCurrencyBucketDTO = {
  currencyCode: string;
  incomeMinor: string;
  expenseMinor: string;
  netMinor: string;
  transactionCount: number;
  previousIncomeMinor: string;
  previousExpenseMinor: string;
  previousNetMinor: string;
  incomeDeltaPercent: number | null;
  expenseDeltaPercent: number | null;
  netDeltaPercent: number | null;
  deltaState: PeriodDeltaState;
};

export type StatsOverviewTopCategoryItemDTO = {
  categoryId: string;
  categoryKey: string;
  label: string;
  iconToken: string;
  colorToken: string | null;
  currencyCode: string;
  amountMinor: string;
  transactionCount: number;
  percentOfTotal: number;
};

export type StatsOverviewResponseDTO = {
  period: StatsPeriodRangeDTO;
  previousPeriod: StatsPeriodRangeDTO;
  byCurrency: StatsOverviewCurrencyBucketDTO[];
  topCategories: StatsOverviewTopCategoryItemDTO[];
};

export type MonthlyTrendPointDTO = {
  month: string; // YYYY-MM
  incomeMinor: string;
  expenseMinor: string;
};
export type MonthlyTrendCurrencySeriesDTO = {
  currencyCode: string;
  points: MonthlyTrendPointDTO[];
};
export type MonthlyTrendResponseDTO = {
  series: MonthlyTrendCurrencySeriesDTO[];
};

export type CategoryBreakdownItemDTO = {
  categoryId: string;
  label: string;
  iconToken: string | null;
  colorToken: string | null;
  amountMinor: string;
  transactionCount: number;
  percentOfTotal: number;
};
export type CategoryBreakdownCurrencyBucketDTO = {
  currencyCode: string;
  totalMinor: string;
  items: CategoryBreakdownItemDTO[];
};
export type CategoryBreakdownResponseDTO = {
  period: StatsPeriodRangeDTO;
  type: 'INCOME' | 'EXPENSE';
  byCurrency: CategoryBreakdownCurrencyBucketDTO[];
};

export type DailySpendPointDTO = {
  date: string; // YYYY-MM-DD
  amountMinor: string;
  transactionCount: number;
};
export type DailySpendCurrencySeriesDTO = {
  currencyCode: string;
  intensityCapMinor: string;
  points: DailySpendPointDTO[];
};
export type DailySpendResponseDTO = {
  series: DailySpendCurrencySeriesDTO[];
};

export type CategorySparklinePointDTO = {
  date: string;
  amountMinor: string;
};
export type CategorySparklineItemDTO = {
  categoryId: string;
  currencyCode: string;
  points: CategorySparklinePointDTO[];
};
export type CategorySparklineResponseDTO = {
  items: CategorySparklineItemDTO[];
};

export type SankeyNodeKind = 'income' | 'expense' | 'savings' | 'transfer_out';
export type SankeyNodeDTO = {
  id: string;
  kind: SankeyNodeKind;
  label: string;
  colorToken: string | null;
};
export type SankeyLinkDTO = {
  source: string;
  target: string;
  amountMinor: string;
};
export type SankeyResponseDTO = {
  period: StatsPeriodRangeDTO;
  currencyCode: string;
  nodes: SankeyNodeDTO[];
  links: SankeyLinkDTO[];
};
