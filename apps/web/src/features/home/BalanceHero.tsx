// Balance hero — gradient surface, total per currency, hide-show eye,
// 14-day sparkline + period tiles + segmented control.

import { Eye, EyeOff } from 'lucide-react';
import type { ApiHouseholdSummary } from '@nayanam/contracts';
import { formatMoney, type AccountsSummaryType } from '@nayanam/core';
import { useHomeStore } from '../../lib/api';
import { useAccountsSummary, useBalanceHistoryAll } from '../../lib/hooks';
import { HomeSparkline } from './HomeSparkline';
import { PeriodTiles } from './PeriodTiles';

type Props = {
  activeHousehold: ApiHouseholdSummary | undefined;
};

function resolvePrimaryCurrency(
  summary: AccountsSummaryType | undefined,
  household: ApiHouseholdSummary | undefined,
): string | undefined {
  const hhCur = household?.defaultCurrencyCode;
  if (summary && summary.byCurrency.length > 0) {
    if (hhCur && summary.byCurrency.some((b) => b.currencyCode === hhCur)) {
      return hhCur;
    }
    // Fall back to the highest-balance bucket.
    return [...summary.byCurrency].sort(
      (a, b) => Number(b.totalMinor) - Number(a.totalMinor),
    )[0]?.currencyCode;
  }
  return hhCur;
}

export function BalanceHero({ activeHousehold }: Props) {
  const balancesHidden = useHomeStore((s) => s.balancesHidden);
  const toggleHidden = useHomeStore((s) => s.toggleBalancesHidden);
  const summary = useAccountsSummary();
  const history = useBalanceHistoryAll(14);

  const primaryCurrency = resolvePrimaryCurrency(summary.data, activeHousehold);
  const buckets = summary.data?.byCurrency ?? [];
  const primaryBucket = primaryCurrency
    ? buckets.find((b) => b.currencyCode === primaryCurrency)
    : undefined;
  const otherBuckets = buckets.filter((b) => b.currencyCode !== primaryBucket?.currencyCode);

  const sparklinePoints = primaryCurrency
    ? history.data?.byCurrency.find((c) => c.currencyCode === primaryCurrency)?.points
    : history.data?.byCurrency[0]?.points;

  const hasAccounts = summary.data && summary.data.totalAccounts > 0;
  const isLoading = summary.isLoading;

  return (
    <section
      aria-label="Total balance"
      className="relative overflow-hidden rounded-[24px] bg-[linear-gradient(135deg,var(--color-accent),color-mix(in_oklab,var(--color-accent)_60%,black))] p-6 text-white shadow-lg"
    >
      {/* Decorative offset circles */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full bg-white/15"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -right-6 h-36 w-36 rounded-full bg-white/10"
      />

      <div className="relative flex items-start justify-between">
        <div className="font-mono text-[10px] uppercase tracking-wider text-white/75">
          Total balance
        </div>
        <button
          type="button"
          aria-pressed={balancesHidden}
          aria-label={balancesHidden ? 'Show balances' : 'Hide balances'}
          onClick={toggleHidden}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur transition-colors hover:bg-white/30"
        >
          {balancesHidden ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
        </button>
      </div>

      <div className="relative mt-2">
        {isLoading ? (
          <div className="h-10 w-52 animate-pulse rounded-md bg-white/25" />
        ) : !hasAccounts ? (
          <div className="mt-1 text-[22px] font-semibold tracking-tight text-white">
            Add your first account
          </div>
        ) : (
          <>
            <div className="text-[34px] font-bold leading-none tracking-tight tabular-nums">
              {balancesHidden
                ? '••••••'
                : primaryBucket
                  ? formatMoney(primaryBucket.totalMinor, primaryBucket.currencyCode)
                  : '—'}
            </div>
            {otherBuckets.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-baseline gap-x-2 text-sm text-white/85">
                {otherBuckets.slice(0, 3).map((b, i) => (
                  <span key={b.currencyCode} className="tabular-nums">
                    {i > 0 ? <span className="mr-2 text-white/60">·</span> : null}
                    {balancesHidden ? '••••••' : formatMoney(b.totalMinor, b.currencyCode)}
                  </span>
                ))}
                {otherBuckets.length > 3 ? (
                  <span className="text-white/70">+{otherBuckets.length - 3} more currencies</span>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      {hasAccounts ? (
        <div className="relative mt-4 flex items-center justify-between gap-4">
          <div className="text-[11px] text-white/75">
            {primaryCurrency ? `${primaryCurrency} · 14 days` : null}
          </div>
          <HomeSparkline
            points={sparklinePoints}
            isLoading={history.isLoading}
          />
        </div>
      ) : null}

      {hasAccounts ? (
        <div className="relative mt-5">
          <PeriodTiles currencyCode={primaryCurrency} />
        </div>
      ) : null}
    </section>
  );
}
