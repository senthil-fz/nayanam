// Big net number + income / expense breakdown + vs-previous delta pill.
// Sourced from `/stats/overview`. Handles loading / error / empty-period
// states locally so the orchestrator stays simple.

import type { StatsOverviewCurrencyBucketType, StatsPeriodKind } from '@nayanam/core';
import { formatMoney } from '@nayanam/core';
import { formatDelta, periodEyebrow, periodLabel } from './util';

type Props = {
  period: StatsPeriodKind;
  bucket: StatsOverviewCurrencyBucketType | null;
  loading: boolean;
  errored: boolean;
};

export function PeriodHeroCard({ period, bucket, loading, errored }: Props) {
  if (loading) {
    return (
      <div className="rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="h-3 w-32 animate-pulse rounded-full bg-[var(--color-border)]" />
        <div className="mt-3 h-9 w-48 animate-pulse rounded-md bg-[var(--color-border)]" />
        <div className="mt-4 h-3 w-40 animate-pulse rounded-full bg-[var(--color-border)]" />
      </div>
    );
  }

  if (errored) {
    return (
      <div className="rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-sm text-[var(--color-text-dim)]">
        Could not load overview.
      </div>
    );
  }

  if (!bucket) {
    return (
      <div className="rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
          {periodEyebrow(period)}
        </div>
        <div className="mt-1 text-3xl font-semibold tracking-tight">—</div>
        <div className="mt-3 text-xs text-[var(--color-text-dim)]">
          No activity this {periodLabel(period)}.
        </div>
      </div>
    );
  }

  const { netMinor, incomeMinor, expenseMinor, currencyCode, netDeltaPercent, deltaState } =
    bucket;
  const delta = formatDelta(netDeltaPercent, deltaState);

  return (
    <div className="rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
            {periodEyebrow(period)}
          </div>
          <div
            className="mt-1 text-[32px] font-semibold tracking-tight"
            aria-label={`Net this ${periodLabel(period)}`}
          >
            {formatMoney(netMinor, currencyCode)}
          </div>
          <DeltaPill delta={delta} period={period} />
        </div>
        <div className="text-right">
          <SideStat
            label="Income"
            dotClass="bg-[var(--color-accent)]"
            value={formatMoney(incomeMinor, currencyCode)}
          />
          <div className="mt-2">
            <SideStat
              label="Expense"
              dotClass="bg-[var(--color-text-faint)]"
              value={formatMoney(expenseMinor, currencyCode)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DeltaPill({
  delta,
  period,
}: {
  delta: ReturnType<typeof formatDelta>;
  period: StatsPeriodKind;
}) {
  const base =
    'mt-2 inline-flex items-center gap-1 rounded-full px-2 py-[3px] font-mono text-[10px] font-semibold';
  const tone =
    delta.sign === 'pos'
      ? 'bg-[color-mix(in_oklab,var(--color-accent-success,var(--color-accent))_15%,transparent)] text-[var(--color-accent-success,var(--color-accent))]'
      : delta.sign === 'neg'
        ? 'bg-[color-mix(in_oklab,var(--color-accent-danger,#dc2626)_15%,transparent)] text-[var(--color-accent-danger,#dc2626)]'
        : 'bg-[var(--color-accent-soft)] text-[var(--color-text-dim)]';
  return (
    <div className={`${base} ${tone}`}>
      <span>{delta.text}</span>
      <span className="opacity-70">vs last {periodLabel(period)}</span>
    </div>
  );
}

function SideStat({
  label,
  dotClass,
  value,
}: {
  label: string;
  dotClass: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <span className={`h-2 w-2 rounded-sm ${dotClass}`} aria-hidden />
      <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
        {label}
      </span>
      <span className="font-mono text-xs font-semibold text-[var(--color-text)]">
        {value}
      </span>
    </div>
  );
}
