// Calendar-style heatmap of the last N days. Intensity = amount /
// intensityCapMinor (clamped to [0,1]) mapped to an alpha ramp of the
// theme accent. Empty days render at 5% alpha so the grid is still
// visually scanable.
//
// Totals / peak / no-spend / avg-per-day strip below the grid is
// computed client-side (the reduced-contract response doesn't include
// them).

import { useMemo } from 'react';
import type { DailySpendSeriesType } from '@nayanam/core';
import { formatMoney } from '@nayanam/core';
import { minorToNumber, shortDateLabel } from './util';

type Props = {
  series: DailySpendSeriesType | null;
  loading: boolean;
  errored: boolean;
};

export function DailySpendHeatmap({ series, loading, errored }: Props) {
  const stats = useMemo(() => {
    if (!series || series.points.length === 0) return null;
    let total = 0;
    let nonZeroDays = 0;
    let peakAmount = 0;
    let peakDate = '';
    for (const p of series.points) {
      const v = minorToNumber(p.amountMinor);
      total += v;
      if (v > 0) nonZeroDays += 1;
      if (v > peakAmount) {
        peakAmount = v;
        peakDate = p.date;
      }
    }
    const noSpendDays = series.points.length - nonZeroDays;
    const avg = Math.round(total / series.points.length);
    return { total, noSpendDays, peakAmount, peakDate, avg };
  }, [series]);

  return (
    <section
      role="img"
      aria-label={
        stats && series
          ? `Daily spend heatmap, ${series.points.length} days, total ${formatMoney(stats.total, series.currencyCode)}`
          : 'Daily spend heatmap'
      }
      className="rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Daily spend</h2>
        {series ? (
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
            {series.points.length}d · {series.currencyCode}
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="h-[140px] animate-pulse rounded-lg bg-[var(--color-border)]" />
      ) : errored ? (
        <div className="flex h-[120px] items-center justify-center text-xs text-[var(--color-text-dim)]">
          Could not load heatmap.
        </div>
      ) : !series || series.points.length === 0 || !stats ? (
        <div className="flex h-[120px] items-center justify-center text-xs text-[var(--color-text-dim)]">
          No activity in this window.
        </div>
      ) : (
        <>
          <HeatmapGrid series={series} />
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-[var(--color-bg)] p-3">
            <StatCell
              label="Peak day"
              value={
                stats.peakAmount > 0
                  ? `${shortDateLabel(stats.peakDate)} · ${formatMoney(stats.peakAmount, series.currencyCode)}`
                  : '—'
              }
            />
            <StatCell label="No-spend" value={`${stats.noSpendDays} days`} />
            <StatCell label="Avg / day" value={formatMoney(stats.avg, series.currencyCode)} />
          </div>
        </>
      )}
    </section>
  );
}

function HeatmapGrid({ series }: { series: DailySpendSeriesType }) {
  const cap = Math.max(1, minorToNumber(series.intensityCapMinor));
  // Render as a grid of small squares, 15 per row (sensible for 90 days).
  return (
    <div className="grid grid-cols-[repeat(15,_minmax(0,1fr))] gap-[3px]">
      {series.points.map((p) => {
        const v = minorToNumber(p.amountMinor);
        const intensity = Math.min(1, v / cap);
        // Ramp: empty = 0.05, otherwise 0.15..1.
        const alpha = v === 0 ? 0.05 : 0.15 + intensity * 0.85;
        return (
          <span
            key={p.date}
            title={`${p.date}: ${formatMoney(p.amountMinor, series.currencyCode)} (${p.transactionCount} tx)`}
            className="aspect-square rounded-[3px]"
            style={{
              backgroundColor: `color-mix(in oklab, var(--color-accent) ${(alpha * 100).toFixed(0)}%, transparent)`,
            }}
          />
        );
      })}
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-text-faint)]">
        {label}
      </div>
      <div className="mt-[2px] text-xs font-semibold text-[var(--color-text)]">{value}</div>
    </div>
  );
}
