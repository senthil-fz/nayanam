// 12-month stacked-pair bars (income up, expense down — matches the
// prototype's grouped-pairs design). Pure SVG, no chart lib.

import { useMemo } from 'react';
import type { MonthlyTrendSeriesType } from '@nayanam/core';
import { formatMoney } from '@nayanam/core';
import { minorToNumber, shortMonthLabel } from './util';

type Props = {
  series: MonthlyTrendSeriesType | null;
  loading: boolean;
  errored: boolean;
};

const WIDTH = 300;
const HEIGHT = 160;
const PAD_X = 8;
const PAD_Y = 12;

export function MonthlyTrendChart({ series, loading, errored }: Props) {
  const metrics = useMemo(() => {
    if (!series) return null;
    let max = 0;
    for (const p of series.points) {
      const inc = minorToNumber(p.incomeMinor);
      const exp = minorToNumber(p.expenseMinor);
      if (inc > max) max = inc;
      if (exp > max) max = exp;
    }
    return { max };
  }, [series]);

  return (
    <Tile
      title="12 months"
      caption={series?.currencyCode}
      ariaLabel={
        series
          ? `Monthly income and expense, last ${series.points.length} months, currency ${series.currencyCode}`
          : 'Monthly trend chart'
      }
    >
      {loading ? (
        <div className="h-[160px] animate-pulse rounded-lg bg-[var(--color-border)]" />
      ) : errored ? (
        <EmptyHint>Could not load monthly trend.</EmptyHint>
      ) : !series || series.points.length === 0 || metrics === null ? (
        <EmptyHint>No data for this window.</EmptyHint>
      ) : (
        <TrendSvg series={series} maxValue={metrics.max} />
      )}
    </Tile>
  );
}

function TrendSvg({
  series,
  maxValue,
}: {
  series: MonthlyTrendSeriesType;
  maxValue: number;
}) {
  const n = series.points.length;
  const innerW = WIDTH - PAD_X * 2;
  const innerH = HEIGHT - PAD_Y * 2;
  const slotW = innerW / Math.max(1, n);
  const barW = Math.max(2, slotW * 0.28);
  const midX = (i: number) => PAD_X + slotW * (i + 0.5);
  const safeMax = maxValue > 0 ? maxValue : 1;
  const hFor = (v: number) => (v / safeMax) * innerH;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      height={HEIGHT}
      role="img"
      aria-hidden="true"
    >
      {series.points.map((p, i) => {
        const inc = minorToNumber(p.incomeMinor);
        const exp = minorToNumber(p.expenseMinor);
        const x = midX(i);
        const incH = hFor(inc);
        const expH = hFor(exp);
        return (
          <g key={p.month}>
            {/* income bar (above axis) */}
            <rect
              x={x - barW - 1}
              y={PAD_Y + innerH - incH}
              width={barW}
              height={incH}
              rx={2}
              fill="var(--color-accent)"
              opacity={0.95}
            >
              <title>
                {shortMonthLabel(p.month)} ·{' '}
                {formatMoney(p.incomeMinor, series.currencyCode)} income
              </title>
            </rect>
            {/* expense bar */}
            <rect
              x={x + 1}
              y={PAD_Y + innerH - expH}
              width={barW}
              height={expH}
              rx={2}
              fill="var(--color-text-faint)"
              opacity={0.9}
            >
              <title>
                {shortMonthLabel(p.month)} ·{' '}
                {formatMoney(p.expenseMinor, series.currencyCode)} expense
              </title>
            </rect>
            {/* month label */}
            <text
              x={x}
              y={HEIGHT - 1}
              textAnchor="middle"
              fontSize={8}
              fill="var(--color-text-faint)"
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
            >
              {shortMonthLabel(p.month).slice(0, 1)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Tile({
  title,
  caption,
  children,
  ariaLabel,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
  ariaLabel: string;
}) {
  return (
    <section
      role="img"
      aria-label={ariaLabel}
      className="rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {caption ? (
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
            {caption}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[120px] items-center justify-center text-xs text-[var(--color-text-dim)]">
      {children}
    </div>
  );
}
