// Stats TanStack Query hooks, shared by web + mobile.
//
// Phase 7 is read-only: no mutations, no idempotency keys, no optimistic
// updates. Every query is prefixed with `['stats', ...]` so transaction
// mutations can sweep the whole tree via a single
// `queryClient.invalidateQueries({ queryKey: ['stats'] })` — the extended
// `invalidateAfterMutation` helper in transactions/hooks.ts does exactly
// that.
//
// `staleTime: 30_000` matches the spec (§12 Performance): charts re-fetch
// on focus / period-change, but rapid re-renders don't hammer the API.

import { useQuery } from '@tanstack/react-query';
import type { ApiClient } from '../api/client';
import type {
  CategoryBreakdownResponseType,
  CategorySparklineResponseType,
  DailySpendResponseType,
  MonthlyTrendResponseType,
  SankeyResponseType,
  StatsOverviewResponseType,
  StatsPeriodKind,
} from './schemas';

export const statsRoot = ['stats'] as const;

const STALE = 30_000;

// Query param shapes — mirror the contract's `getStats*` operation queries.

export type UseStatsOverviewArgs = {
  period: StatsPeriodKind;
  from?: string;
  to?: string;
  topCategoriesLimit?: number;
  enabled?: boolean;
};

export type UseMonthlyTrendArgs = {
  months?: number;
  currencyCode?: string;
  enabled?: boolean;
};

export type UseCategoryBreakdownArgs = {
  period: StatsPeriodKind;
  from?: string;
  to?: string;
  type?: 'INCOME' | 'EXPENSE';
  currencyCode?: string;
  enabled?: boolean;
};

export type UseDailySpendArgs = {
  days?: number;
  currencyCode?: string;
  enabled?: boolean;
};

export type UseCategorySparklineArgs = {
  categoryIds: readonly string[];
  days?: number;
  enabled?: boolean;
};

export type UseSankeyArgs = {
  period: StatsPeriodKind;
  from?: string;
  to?: string;
  currencyCode?: string;
  enabled?: boolean;
};

export function makeStatsHooks(client: ApiClient) {
  function useStatsOverview(args: UseStatsOverviewArgs) {
    const { enabled = true, ...q } = args;
    return useQuery<StatsOverviewResponseType>({
      queryKey: [...statsRoot, 'overview', q] as const,
      queryFn: () => client.getStatsOverview(q),
      staleTime: STALE,
      enabled,
    });
  }

  function useMonthlyTrend(args: UseMonthlyTrendArgs = {}) {
    const { enabled = true, ...q } = args;
    return useQuery<MonthlyTrendResponseType>({
      queryKey: [...statsRoot, 'monthly-trend', q] as const,
      queryFn: () => client.getStatsMonthlyTrend(q),
      staleTime: STALE,
      enabled,
    });
  }

  function useCategoryBreakdown(args: UseCategoryBreakdownArgs) {
    const { enabled = true, ...q } = args;
    return useQuery<CategoryBreakdownResponseType>({
      queryKey: [...statsRoot, 'category-breakdown', q] as const,
      queryFn: () => client.getStatsCategoryBreakdown(q),
      staleTime: STALE,
      enabled,
    });
  }

  function useDailySpend(args: UseDailySpendArgs = {}) {
    const { enabled = true, ...q } = args;
    return useQuery<DailySpendResponseType>({
      queryKey: [...statsRoot, 'daily-spend', q] as const,
      queryFn: () => client.getStatsDailySpend(q),
      staleTime: STALE,
      enabled,
    });
  }

  // Category sparkline: key with a **sorted, joined** id list so that callers
  // who ask for [B, A] and [A, B] hit the same cache entry. The server also
  // echoes items in input order, but the hook sorts its query key — see
  // acceptance criterion 26 in the spec. We keep the request in input order
  // (the server promises to echo it) by passing `categoryIds` through.
  function useCategorySparkline(args: UseCategorySparklineArgs) {
    const { categoryIds, days, enabled = true } = args;
    const sortedKey = [...categoryIds].sort().join(',');
    return useQuery<CategorySparklineResponseType>({
      queryKey: [
        ...statsRoot,
        'category-sparkline',
        { ids: sortedKey, days: days ?? null },
      ] as const,
      queryFn: () =>
        client.getStatsCategorySparkline({
          categoryIds,
          ...(days !== undefined ? { days } : {}),
        }),
      staleTime: STALE,
      enabled: enabled && categoryIds.length > 0,
    });
  }

  function useSankey(args: UseSankeyArgs) {
    const { enabled = true, ...q } = args;
    return useQuery<SankeyResponseType>({
      queryKey: [...statsRoot, 'sankey', q] as const,
      queryFn: () => client.getStatsSankey(q),
      staleTime: STALE,
      enabled,
    });
  }

  return {
    useStatsOverview,
    useMonthlyTrend,
    useCategoryBreakdown,
    useDailySpend,
    useCategorySparkline,
    useSankey,
  };
}

export type StatsHooks = ReturnType<typeof makeStatsHooks>;
