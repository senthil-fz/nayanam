// Mobile Stats orchestrator. Mirrors the web `StatsScreen`:
//
//   - Owns `period` ('week' | 'month' | 'year', default 'month').
//   - Owns `userCurrency` (null = auto-resolve from overview's primary bucket).
//   - Owns `breakdownType` ('EXPENSE' | 'INCOME', default 'EXPENSE').
//
// Fires five independent queries in parallel (overview, monthly trend,
// daily spend, category breakdown, sankey). Category sparkline is a
// dependent query keyed on the ids returned by overview.topCategories —
// batched into a SINGLE request (up to 8 ids) per spec.
//
// Single `ScrollView` w/ `RefreshControl`: pull-to-refresh invalidates
// the entire `['stats']` prefix so every tile refetches. Safe-area
// top inset honored via the enclosing SafeAreaView in the route file.

import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type {
  CategoryBreakdownCurrencyBucketType,
  DailySpendSeriesType,
  MonthlyTrendSeriesType,
} from '@nayanam/core';
import { statsRoot } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { useAuthStore } from '../../lib/api';
import {
  useAccounts,
  useAccountsSummary,
  useCategoryBreakdown,
  useCategorySparkline,
  useDailySpend,
  useHouseholds,
  useMe,
  useMonthlyTrend,
  useSankey,
  useStatsOverview,
} from '../../lib/hooks';
import { StatsHeader } from './StatsHeader';
import { PeriodSelector } from './PeriodSelector';
import { CurrencySwitcher } from './CurrencySwitcher';
import { PeriodHeroCard } from './PeriodHeroCard';
import { MonthlyTrendChart } from './MonthlyTrendChart';
import { CategoryDonut } from './CategoryDonut';
import { TopCategoriesGrid } from './TopCategoriesGrid';
import { DailySpendHeatmap } from './DailySpendHeatmap';
import { SankeyChart } from './SankeyChart';
import { StatsEmptyState } from './StatsEmptyState';
import { periodLabel, type UIPeriod } from './util';

export function StatsScreen() {
  const [period, setPeriod] = useState<UIPeriod>('month');
  const [userCurrency, setUserCurrency] = useState<string | null>(null);
  const [breakdownType, setBreakdownType] = useState<'EXPENSE' | 'INCOME'>(
    'EXPENSE',
  );

  const me = useMe();
  const { data: householdsData } = useHouseholds();
  const activeId = useAuthStore((s) => s.activeHouseholdId);
  const households = householdsData ?? me.data?.households ?? [];
  const activeHousehold =
    households.find((h) => h.id === activeId) ?? households[0];
  const role = activeHousehold?.role;
  const canMutate = role !== 'VIEWER';

  // Accounts summary: proxy for what the household holds money in.
  // Used (a) to decide whether the currency switcher is visible, (b) to
  // resolve a primary currency when overview hasn't responded yet, and
  // (c) to populate the switcher's list of selectable codes.
  const accountsQuery = useAccounts({ includeArchived: true });
  const accounts = useMemo(
    () => accountsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [accountsQuery.data],
  );
  const hasAccounts = accounts.some((a) => !a.archivedAt);
  const accountsSummary = useAccountsSummary();

  // Five parallel queries. TanStack Query dedupes + caches automatically.
  const overview = useStatsOverview({ period });
  const monthlyTrend = useMonthlyTrend({ months: 12 });
  const dailySpend = useDailySpend({ days: 90 });

  // Resolve active currency. Priority:
  //   1. user selection (switcher)
  //   2. overview's first bucket (server returns primary first)
  //   3. household default
  //   4. accounts-summary most-held currency
  //   5. USD (last resort; should never be hit)
  const primaryBucket = overview.data?.byCurrency[0] ?? null;
  const accountsPrimary = useMemo(() => {
    const buckets = accountsSummary.data?.byCurrency ?? [];
    if (buckets.length === 0) return null;
    const hhCur = activeHousehold?.defaultCurrencyCode;
    if (hhCur && buckets.some((b) => b.currencyCode === hhCur)) return hhCur;
    return [...buckets].sort(
      (a, b) => Number(b.totalMinor) - Number(a.totalMinor),
    )[0]?.currencyCode;
  }, [accountsSummary.data, activeHousehold]);
  const fallbackCurrency =
    primaryBucket?.currencyCode ??
    activeHousehold?.defaultCurrencyCode ??
    accountsPrimary ??
    'USD';
  const currency = userCurrency ?? fallbackCurrency;

  // Dependent (currency-aware) queries.
  const categoryBreakdown = useCategoryBreakdown({
    period,
    type: breakdownType,
    currencyCode: currency,
  });
  const sankey = useSankey({ period, currencyCode: currency });

  // Sparkline: batch up to 8 top-category ids into a single request.
  const sparklineIds = useMemo(
    () =>
      (overview.data?.topCategories ?? [])
        .slice(0, 8)
        .map((t) => t.categoryId),
    [overview.data],
  );
  const sparkline = useCategorySparkline({
    categoryIds: sparklineIds,
    days: 30,
    enabled: sparklineIds.length > 0,
  });

  // Switchable currencies = union of (overview buckets, monthly-trend
  // series currencies, accounts-summary currencies, household default,
  // current selection). The switcher is only mounted when >1.
  const currencies = useMemo(() => {
    const set = new Set<string>();
    for (const b of overview.data?.byCurrency ?? []) set.add(b.currencyCode);
    for (const s of monthlyTrend.data?.series ?? []) set.add(s.currencyCode);
    for (const b of accountsSummary.data?.byCurrency ?? []) {
      set.add(b.currencyCode);
    }
    if (activeHousehold?.defaultCurrencyCode) {
      set.add(activeHousehold.defaultCurrencyCode);
    }
    if (currency) set.add(currency);
    return [...set].sort();
  }, [
    overview.data,
    monthlyTrend.data,
    accountsSummary.data,
    activeHousehold,
    currency,
  ]);

  // Per-currency client-side filters on multi-currency responses.
  const monthlySeries: MonthlyTrendSeriesType | null = useMemo(() => {
    const series = monthlyTrend.data?.series ?? [];
    return series.find((s) => s.currencyCode === currency) ?? series[0] ?? null;
  }, [monthlyTrend.data, currency]);

  const breakdownBucket: CategoryBreakdownCurrencyBucketType | null =
    useMemo(() => {
      const byC = categoryBreakdown.data?.byCurrency ?? [];
      return byC.find((b) => b.currencyCode === currency) ?? byC[0] ?? null;
    }, [categoryBreakdown.data, currency]);

  const dailySeries: DailySpendSeriesType | null = useMemo(() => {
    const series = dailySpend.data?.series ?? [];
    return series.find((s) => s.currencyCode === currency) ?? series[0] ?? null;
  }, [dailySpend.data, currency]);

  const overviewBucket =
    (overview.data?.byCurrency ?? []).find(
      (b) => b.currencyCode === currency,
    ) ?? primaryBucket;

  const isWholeScreenEmpty =
    overview.isSuccess && (overview.data?.byCurrency.length ?? 0) === 0;

  // Pull-to-refresh — broad prefix invalidation of ['stats'] sweeps
  // every stats query at once (acceptance criterion 23). Stats is
  // read-only, so there are no pending mutations to coordinate.
  const qc = useQueryClient();
  const refreshing =
    overview.isFetching ||
    monthlyTrend.isFetching ||
    dailySpend.isFetching ||
    categoryBreakdown.isFetching ||
    sankey.isFetching ||
    sparkline.isFetching;

  const onRefresh = () => {
    void qc.invalidateQueries({ queryKey: [...statsRoot] });
  };

  const showSwitcher = currencies.length > 1;

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <StatsHeader
        right={
          showSwitcher ? (
            <CurrencySwitcher
              value={currency}
              currencies={currencies}
              onChange={(c) => setUserCurrency(c)}
            />
          ) : undefined
        }
      />

      <View style={{ paddingHorizontal: 20, marginTop: 12, marginBottom: 12 }}>
        <PeriodSelector value={period} onChange={setPeriod} />
      </View>

      {isWholeScreenEmpty ? (
        <StatsEmptyState
          period={period}
          canMutate={canMutate && hasAccounts}
        />
      ) : (
        <View style={{ gap: 12 }}>
          <PeriodHeroCard
            period={period}
            bucket={overviewBucket ?? null}
            loading={overview.isLoading}
            errored={overview.isError}
          />

          <MonthlyTrendChart
            series={monthlySeries}
            loading={monthlyTrend.isLoading}
            errored={monthlyTrend.isError}
          />

          <CategoryDonut
            bucket={breakdownBucket}
            loading={categoryBreakdown.isLoading}
            errored={categoryBreakdown.isError}
            type={breakdownType}
            onTypeChange={setBreakdownType}
          />

          <TopCategoriesGrid
            items={overview.data?.topCategories ?? []}
            sparkline={sparkline.data}
            loading={overview.isLoading || sparkline.isLoading}
            errored={overview.isError || sparkline.isError}
          />

          <DailySpendHeatmap
            series={dailySeries}
            loading={dailySpend.isLoading}
            errored={dailySpend.isError}
          />

          <SankeyChart
            data={sankey.data ?? null}
            loading={sankey.isLoading}
            errored={sankey.isError}
            period={periodLabel(period)}
          />

          {showSwitcher ? (
            <Text
              style={{
                textAlign: 'center',
                fontFamily: 'Geist Mono',
                fontSize: 10,
                color: LIGHT.textFaint,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                marginTop: 4,
              }}
            >
              Showing: {currency}
            </Text>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}
