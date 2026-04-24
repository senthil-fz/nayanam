// Stats orchestrator.
//
// Owns:
//   - `period`  : 'week' | 'month' | 'year'  (default 'month')
//   - `currency`: string | null               (null = auto from server)
//   - `breakdownType`: 'EXPENSE' | 'INCOME'  (default 'EXPENSE')
//
// Fetches /stats/overview + /monthly-trend + /category-breakdown +
// /daily-spend + /sankey in parallel (TanStack Query). Category-sparkline
// is a dependent fetch keyed on the ids returned by /overview.topCategories.
//
// Currency-switcher resolution (§9):
//   1. user-chosen currency  (state)
//   2. `/overview.byCurrency`'s primary bucket (first — server resolves)
//   3. household default currency code
//   4. USD (last-resort; never hit in practice since households ship with a
//      default currency).
//
// The server already scopes topCategories + sparklines to its own primary
// currency; for /monthly-trend, /category-breakdown, /daily-spend, /sankey
// we filter/pass the user-facing currency so the UI stays consistent across
// tiles.

import { useMemo, useState } from 'react';
import type {
  CategoryBreakdownCurrencyBucketType,
  DailySpendSeriesType,
  MonthlyTrendSeriesType,
  StatsPeriodKind,
} from '@nayanam/core';
import {
  useAccounts,
  useAccountsSummary,
  useCategories,
  useCategoryBreakdown,
  useCategorySparkline,
  useDailySpend,
  useHouseholds,
  useMe,
  useMonthlyTrend,
  useSankey,
  useStatsOverview,
} from '../../lib/hooks';
import { useAuthStore } from '../../lib/api';
import { AddTransactionDialog } from '../transactions/AddTransactionDialog';
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
import { periodLabel } from './util';

type UIPeriod = Exclude<StatsPeriodKind, 'custom'>;

export function StatsScreen() {
  const [period, setPeriod] = useState<UIPeriod>('month');
  const [userCurrency, setUserCurrency] = useState<string | null>(null);
  const [breakdownType, setBreakdownType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [addOpen, setAddOpen] = useState(false);

  const me = useMe();
  const { data: householdsData } = useHouseholds();
  const activeId = useAuthStore((s) => s.activeHouseholdId);
  const households = householdsData ?? me.data?.households ?? [];
  const activeHousehold = households.find((h) => h.id === activeId) ?? households[0];
  const role = activeHousehold?.role;
  const canMutate = role !== 'VIEWER';

  // Accounts + categories: needed for (a) the AddTransactionDialog we open
  // from the empty state and (b) deriving the list of currencies the
  // household actually transacts in for the switcher.
  const accountsQuery = useAccounts({ includeArchived: true });
  const categoriesQuery = useCategories({ includeArchived: true });
  const accounts = useMemo(
    () => accountsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [accountsQuery.data],
  );
  const categories = useMemo(
    () => categoriesQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [categoriesQuery.data],
  );
  const hasAccounts = accounts.some((a) => !a.archivedAt);

  // Currencies-in-use: accounts summary is a good proxy for what the
  // household holds money in. It doesn't tell us what they *transact* in,
  // but the /monthly-trend response does — we union the two.
  const accountsSummary = useAccountsSummary();

  // Queries — all prefixed with ['stats'].
  const overview = useStatsOverview({ period });
  const monthlyTrend = useMonthlyTrend({ months: 12 });
  const dailySpend = useDailySpend({ days: 90 });

  // Resolve active currency.
  const primaryBucket = overview.data?.byCurrency[0] ?? null;
  const fallbackCurrency =
    primaryBucket?.currencyCode ??
    activeHousehold?.defaultCurrencyCode ??
    me.data?.user.primaryCurrencyCode ??
    'USD';
  const currency = userCurrency ?? fallbackCurrency;

  // Dependent queries (currency-aware).
  const categoryBreakdown = useCategoryBreakdown({
    period,
    type: breakdownType,
    currencyCode: currency,
  });
  const sankey = useSankey({ period, currencyCode: currency });

  // Sparkline: ids come from overview.topCategories. Hook is disabled until
  // we have at least one id.
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

  // Currencies the user can switch between.
  const currencies = useMemo(() => {
    const set = new Set<string>();
    for (const b of overview.data?.byCurrency ?? []) set.add(b.currencyCode);
    for (const s of monthlyTrend.data?.series ?? []) set.add(s.currencyCode);
    for (const b of accountsSummary.data?.byCurrency ?? []) set.add(b.currencyCode);
    if (activeHousehold?.defaultCurrencyCode) {
      set.add(activeHousehold.defaultCurrencyCode);
    }
    // Ensure the current selection is present even if the server response
    // raced it (prevents the <select> from jumping to an unintended value).
    if (currency) set.add(currency);
    return [...set].sort();
  }, [
    overview.data,
    monthlyTrend.data,
    accountsSummary.data,
    activeHousehold,
    currency,
  ]);

  // Per-currency filters on multi-currency responses (client-side).
  const monthlySeries: MonthlyTrendSeriesType | null = useMemo(() => {
    const series = monthlyTrend.data?.series ?? [];
    return series.find((s) => s.currencyCode === currency) ?? series[0] ?? null;
  }, [monthlyTrend.data, currency]);

  const breakdownBucket: CategoryBreakdownCurrencyBucketType | null = useMemo(() => {
    const byC = categoryBreakdown.data?.byCurrency ?? [];
    return byC.find((b) => b.currencyCode === currency) ?? byC[0] ?? null;
  }, [categoryBreakdown.data, currency]);

  const dailySeries: DailySpendSeriesType | null = useMemo(() => {
    const series = dailySpend.data?.series ?? [];
    return series.find((s) => s.currencyCode === currency) ?? series[0] ?? null;
  }, [dailySpend.data, currency]);

  const overviewBucket =
    (overview.data?.byCurrency ?? []).find((b) => b.currencyCode === currency) ??
    primaryBucket;

  const isWholeScreenEmpty =
    overview.isSuccess && (overview.data?.byCurrency.length ?? 0) === 0;

  return (
    <div className="flex flex-col gap-4">
      <StatsHeader
        right={
          currencies.length > 1 ? (
            <CurrencySwitcher
              value={currency}
              currencies={currencies}
              onChange={(c) => setUserCurrency(c)}
            />
          ) : undefined
        }
      />

      <div className="flex justify-center">
        <PeriodSelector value={period} onChange={(v) => setPeriod(v)} />
      </div>

      {isWholeScreenEmpty ? (
        <StatsEmptyState
          period={period}
          canMutate={canMutate && hasAccounts}
          onAdd={() => setAddOpen(true)}
        />
      ) : (
        <>
          <PeriodHeroCard
            period={period}
            bucket={overviewBucket ?? null}
            loading={overview.isLoading}
            errored={overview.isError}
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
          </div>

          <SankeyChart
            data={sankey.data ?? null}
            loading={sankey.isLoading}
            errored={sankey.isError}
            period={periodLabel(period)}
          />

          {currencies.length > 1 ? (
            <p className="text-center font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
              Showing: {currency}
            </p>
          ) : null}
        </>
      )}

      <AddTransactionDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        accounts={accounts}
        categories={categories}
        prefill={{ type: 'EXPENSE' }}
      />
    </div>
  );
}
