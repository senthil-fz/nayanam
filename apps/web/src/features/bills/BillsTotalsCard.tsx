// Per-currency bills totals card. Primary row is the hero; additional
// currencies stack below at 60% scale (spec §9, parallel to Home hero).

import { formatMoney, type BillsSummaryResponseType } from '@nayanam/core';

type Props = {
  summary: BillsSummaryResponseType | undefined;
  isLoading: boolean;
  isError: boolean;
  primaryCurrencyCode?: string;
};

export function BillsTotalsCard({
  summary,
  isLoading,
  isError,
  primaryCurrencyCode,
}: Props) {
  if (isError) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-sm text-[var(--color-negative)]">
        Couldn&apos;t load totals.
      </section>
    );
  }

  if (isLoading || !summary) {
    return (
      <section
        aria-busy="true"
        className="h-[118px] animate-pulse rounded-[var(--radius-lg)] bg-[var(--color-surface-alt)]"
      />
    );
  }

  const buckets = summary.byCurrency;
  if (buckets.length === 0) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-sm text-[var(--color-text-dim)]">
        No active bills yet.
      </section>
    );
  }

  // Primary: prefer `primaryCurrencyCode`; else the bucket with the largest
  // monthlyCostMinor. `buckets` is non-empty at this point so the tail is
  // always defined; assert for the compiler.
  const sorted = [...buckets].sort((a, b) => {
    const av = BigInt(a.monthlyCostMinor);
    const bv = BigInt(b.monthlyCostMinor);
    if (av === bv) return 0;
    return av > bv ? -1 : 1;
  });
  const primary =
    (primaryCurrencyCode
      ? buckets.find((b) => b.currencyCode === primaryCurrencyCode)
      : undefined) ?? sorted[0]!;

  const rest = buckets.filter((b) => b.currencyCode !== primary.currencyCode);

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <HeroRow
        currencyCode={primary.currencyCode}
        monthlyCostMinor={primary.monthlyCostMinor}
        dueSoonMinor={primary.dueSoonMinor}
        activeCount={primary.activeCount}
        pausedCount={primary.pausedCount}
      />
      {rest.length > 0 ? (
        <div className="mt-3 space-y-2 border-t border-[var(--color-border)] pt-3">
          {rest.map((b) => (
            <HeroRow
              key={b.currencyCode}
              currencyCode={b.currencyCode}
              monthlyCostMinor={b.monthlyCostMinor}
              dueSoonMinor={b.dueSoonMinor}
              activeCount={b.activeCount}
              pausedCount={b.pausedCount}
              compact
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

type RowProps = {
  currencyCode: string;
  monthlyCostMinor: string;
  dueSoonMinor: string;
  activeCount: number;
  pausedCount: number;
  compact?: boolean;
};

function HeroRow({
  currencyCode,
  monthlyCostMinor,
  dueSoonMinor,
  activeCount,
  pausedCount,
  compact = false,
}: RowProps) {
  const amountCls = compact
    ? 'text-base font-semibold tracking-tight'
    : 'text-2xl font-bold tracking-tight';
  return (
    <div className="flex items-stretch gap-4">
      <div className="flex-1">
        <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
          Monthly cost
        </div>
        <div className={amountCls + ' mt-0.5 text-[var(--color-text)]'}>
          {formatMoney(monthlyCostMinor, currencyCode)}
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-[var(--color-text-dim)]">
          {activeCount} active · {pausedCount} paused
        </div>
      </div>
      <div className="w-px bg-[var(--color-border)]" aria-hidden />
      <div className="flex-1">
        <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
          Due soon
        </div>
        <div className={amountCls + ' mt-0.5 text-[var(--color-negative)]'}>
          {formatMoney(dueSoonMinor, currencyCode)}
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-[var(--color-text-dim)]">
          in next 7 days
        </div>
      </div>
    </div>
  );
}
