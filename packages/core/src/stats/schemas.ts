// Zod schemas for the Stats domain. Shared by web + mobile.
// Wire shapes mirror `packages/contracts/openapi.yaml` exactly —
// bigints are decimal strings, dates are ISO-8601 strings.
//
// Phase 7 — read-only analytics. No mutations.

import { z } from 'zod';
import { CurrencyCode } from '../accounts/schemas';

const MinorAmountString = z
  .string()
  .regex(/^-?\d+$/, 'must be an integer as a string');

// --- Period --------------------------------------------------------------

export const StatsPeriodKindEnum = z.enum(['week', 'month', 'year', 'custom']);
export type StatsPeriodKind = z.infer<typeof StatsPeriodKindEnum>;

export const StatsPeriodRange = z.object({
  kind: StatsPeriodKindEnum,
  from: z.string().datetime(),
  to: z.string().datetime(),
});
export type StatsPeriodRangeType = z.infer<typeof StatsPeriodRange>;

// --- Overview ------------------------------------------------------------

export const PeriodDeltaStateEnum = z.enum([
  'has_previous',
  'no_previous_data',
  'zero_to_positive',
  'zero_to_negative',
]);
export type PeriodDeltaState = z.infer<typeof PeriodDeltaStateEnum>;

export const StatsOverviewCurrencyBucket = z.object({
  currencyCode: CurrencyCode,
  incomeMinor: MinorAmountString,
  expenseMinor: MinorAmountString,
  netMinor: MinorAmountString,
  transactionCount: z.number().int().nonnegative(),
  previousIncomeMinor: MinorAmountString,
  previousExpenseMinor: MinorAmountString,
  previousNetMinor: MinorAmountString,
  incomeDeltaPercent: z.number().int().nullable(),
  expenseDeltaPercent: z.number().int().nullable(),
  netDeltaPercent: z.number().int().nullable(),
  deltaState: PeriodDeltaStateEnum,
});
export type StatsOverviewCurrencyBucketType = z.infer<
  typeof StatsOverviewCurrencyBucket
>;

export const StatsOverviewTopCategoryItem = z.object({
  categoryId: z.string().min(1),
  categoryKey: z.string(),
  label: z.string(),
  iconToken: z.string(),
  colorToken: z.string().nullable().optional(),
  currencyCode: CurrencyCode,
  amountMinor: MinorAmountString,
  transactionCount: z.number().int().nonnegative(),
  percentOfTotal: z.number().int().nonnegative(),
});
export type StatsOverviewTopCategoryItemType = z.infer<
  typeof StatsOverviewTopCategoryItem
>;

export const StatsOverviewResponse = z.object({
  period: StatsPeriodRange,
  previousPeriod: StatsPeriodRange,
  byCurrency: z.array(StatsOverviewCurrencyBucket),
  topCategories: z.array(StatsOverviewTopCategoryItem),
});
export type StatsOverviewResponseType = z.infer<typeof StatsOverviewResponse>;

// --- Monthly trend -------------------------------------------------------

export const MonthlyTrendPoint = z.object({
  month: z.string(), // YYYY-MM
  incomeMinor: MinorAmountString,
  expenseMinor: MinorAmountString,
});
export type MonthlyTrendPointType = z.infer<typeof MonthlyTrendPoint>;

export const MonthlyTrendSeries = z.object({
  currencyCode: CurrencyCode,
  points: z.array(MonthlyTrendPoint),
});
export type MonthlyTrendSeriesType = z.infer<typeof MonthlyTrendSeries>;

export const MonthlyTrendResponse = z.object({
  series: z.array(MonthlyTrendSeries),
});
export type MonthlyTrendResponseType = z.infer<typeof MonthlyTrendResponse>;

// --- Category breakdown --------------------------------------------------

export const CategoryBreakdownItem = z.object({
  categoryId: z.string().min(1),
  label: z.string(),
  iconToken: z.string().nullable().optional(),
  colorToken: z.string().nullable().optional(),
  amountMinor: MinorAmountString,
  transactionCount: z.number().int().nonnegative(),
  percentOfTotal: z.number().int().nonnegative(),
});
export type CategoryBreakdownItemType = z.infer<typeof CategoryBreakdownItem>;

export const CategoryBreakdownCurrencyBucket = z.object({
  currencyCode: CurrencyCode,
  totalMinor: MinorAmountString,
  items: z.array(CategoryBreakdownItem),
});
export type CategoryBreakdownCurrencyBucketType = z.infer<
  typeof CategoryBreakdownCurrencyBucket
>;

export const CategoryBreakdownResponse = z.object({
  period: StatsPeriodRange,
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
  byCurrency: z.array(CategoryBreakdownCurrencyBucket),
});
export type CategoryBreakdownResponseType = z.infer<
  typeof CategoryBreakdownResponse
>;

// --- Daily spend ---------------------------------------------------------

export const DailySpendPoint = z.object({
  date: z.string(), // YYYY-MM-DD
  amountMinor: MinorAmountString,
  transactionCount: z.number().int().nonnegative(),
});
export type DailySpendPointType = z.infer<typeof DailySpendPoint>;

export const DailySpendSeries = z.object({
  currencyCode: CurrencyCode,
  intensityCapMinor: MinorAmountString,
  points: z.array(DailySpendPoint),
});
export type DailySpendSeriesType = z.infer<typeof DailySpendSeries>;

export const DailySpendResponse = z.object({
  series: z.array(DailySpendSeries),
});
export type DailySpendResponseType = z.infer<typeof DailySpendResponse>;

// --- Category sparkline --------------------------------------------------

export const CategorySparklinePoint = z.object({
  date: z.string(),
  amountMinor: MinorAmountString,
});
export type CategorySparklinePointType = z.infer<typeof CategorySparklinePoint>;

export const CategorySparklineItem = z.object({
  categoryId: z.string().min(1),
  currencyCode: CurrencyCode,
  points: z.array(CategorySparklinePoint),
});
export type CategorySparklineItemType = z.infer<typeof CategorySparklineItem>;

export const CategorySparklineResponse = z.object({
  items: z.array(CategorySparklineItem),
});
export type CategorySparklineResponseType = z.infer<
  typeof CategorySparklineResponse
>;

// --- Sankey --------------------------------------------------------------

export const SankeyNodeKindEnum = z.enum([
  'income',
  'expense',
  'savings',
  'transfer_out',
]);
export type SankeyNodeKind = z.infer<typeof SankeyNodeKindEnum>;

export const SankeyNode = z.object({
  id: z.string().min(1),
  kind: SankeyNodeKindEnum,
  label: z.string(),
  colorToken: z.string().nullable().optional(),
});
export type SankeyNodeType = z.infer<typeof SankeyNode>;

export const SankeyLink = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  amountMinor: MinorAmountString,
});
export type SankeyLinkType = z.infer<typeof SankeyLink>;

export const SankeyResponse = z.object({
  period: StatsPeriodRange,
  currencyCode: CurrencyCode,
  nodes: z.array(SankeyNode),
  links: z.array(SankeyLink),
});
export type SankeyResponseType = z.infer<typeof SankeyResponse>;
