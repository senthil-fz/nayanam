// Three tiles (Income / Expense / Net) and a Day/Week/Month/Year segmented control.

import { formatMoney, type HomePeriod } from '@nayanam/core';
import { useHomeStore } from '../../lib/api';
import { usePeriodSummary } from '../../lib/hooks';

const PERIODS: { value: HomePeriod; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

type Props = {
  /** Primary currency for this household; tiles show that bucket only. */
  currencyCode: string | undefined;
};

export function PeriodTiles({ currencyCode }: Props) {
  const period = useHomeStore((s) => s.period);
  const setPeriod = useHomeStore((s) => s.setPeriod);
  const balancesHidden = useHomeStore((s) => s.balancesHidden);
  const summary = usePeriodSummary({ period });

  const bucket = currencyCode
    ? summary.data?.byCurrency.find((b) => b.currencyCode === currencyCode)
    : summary.data?.byCurrency[0];
  const resolvedCurrency = bucket?.currencyCode ?? currencyCode ?? 'USD';

  const show = (minor: string | undefined): string => {
    if (balancesHidden) return '••••••';
    if (!minor) return formatMoney('0', resolvedCurrency);
    return formatMoney(minor, resolvedCurrency);
  };

  const netTone =
    !bucket || balancesHidden
      ? 'text-[var(--color-text)]'
      : Number(bucket.netMinor) >= 0
        ? 'text-[var(--color-positive)]'
        : 'text-[var(--color-negative)]';

  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label="Summary period"
        className="flex rounded-full border border-white/25 bg-white/10 p-0.5 text-[11px] backdrop-blur"
      >
        {PERIODS.map((p) => {
          const selected = p.value === period;
          return (
            <button
              key={p.value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setPeriod(p.value)}
              className={
                'flex-1 rounded-full px-3 py-1 font-medium uppercase tracking-wider transition-colors ' +
                (selected ? 'bg-white text-[var(--color-accent)]' : 'text-white/80 hover:text-white')
              }
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Tile label="Income" value={show(bucket?.incomeMinor)} tone="text-[var(--color-positive)]" loading={summary.isLoading} />
        <Tile label="Expense" value={show(bucket?.expenseMinor)} tone="text-[var(--color-negative)]" loading={summary.isLoading} />
        <Tile label="Net" value={show(bucket?.netMinor)} tone={netTone} loading={summary.isLoading} />
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
  loading,
}: {
  label: string;
  value: string;
  tone: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-md)] bg-white/15 px-3 py-2 backdrop-blur">
      <div className="font-mono text-[9px] uppercase tracking-wider text-white/75">
        {label}
      </div>
      {loading ? (
        <div className="mt-1 h-4 w-full animate-pulse rounded bg-white/30" />
      ) : (
        <div className={`mt-0.5 text-sm font-semibold tabular-nums ${tone}`}>
          {value}
        </div>
      )}
    </div>
  );
}
