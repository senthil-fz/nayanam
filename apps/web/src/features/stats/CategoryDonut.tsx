// Donut chart + per-category legend. Hover/focus dims non-selected slices.
// Toggle pill at the top switches between EXPENSE (default) and INCOME —
// the orchestrator owns the current `type` and passes it in + a setter.

import { useState } from 'react';
import type {
  CategoryBreakdownCurrencyBucketType,
  CategoryBreakdownItemType,
} from '@nayanam/core';
import { formatMoney } from '@nayanam/core';
import { colorForToken, minorToNumber } from './util';

type Props = {
  bucket: CategoryBreakdownCurrencyBucketType | null;
  loading: boolean;
  errored: boolean;
  type: 'EXPENSE' | 'INCOME';
  onTypeChange: (t: 'EXPENSE' | 'INCOME') => void;
};

const SIZE = 200;
const THICKNESS = 26;
const RADIUS = SIZE / 2 - THICKNESS / 2;

export function CategoryDonut({
  bucket,
  loading,
  errored,
  type,
  onTypeChange,
}: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null);

  return (
    <section
      role="img"
      aria-label={
        bucket
          ? `Category breakdown, ${type.toLowerCase()}, total ${formatMoney(bucket.totalMinor, bucket.currencyCode)}`
          : 'Category breakdown'
      }
      className="rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">By category</h2>
        <TypeToggle value={type} onChange={onTypeChange} />
      </div>

      {loading ? (
        <div className="h-[220px] animate-pulse rounded-lg bg-[var(--color-border)]" />
      ) : errored ? (
        <div className="flex h-[200px] items-center justify-center text-xs text-[var(--color-text-dim)]">
          Could not load breakdown.
        </div>
      ) : !bucket || bucket.items.length === 0 ? (
        <div className="flex h-[200px] items-center justify-center text-xs text-[var(--color-text-dim)]">
          No activity in this period.
        </div>
      ) : (
        <>
          <DonutSvg
            bucket={bucket}
            hoverId={hoverId}
            onHover={setHoverId}
          />
          <Legend
            bucket={bucket}
            hoverId={hoverId}
            onHover={setHoverId}
          />
        </>
      )}
    </section>
  );
}

function TypeToggle({
  value,
  onChange,
}: {
  value: 'EXPENSE' | 'INCOME';
  onChange: (v: 'EXPENSE' | 'INCOME') => void;
}) {
  const opts: Array<{ v: 'EXPENSE' | 'INCOME'; label: string }> = [
    { v: 'EXPENSE', label: 'Expenses' },
    { v: 'INCOME', label: 'Income' },
  ];
  return (
    <div
      role="tablist"
      aria-label="Category type"
      className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] p-[2px]"
    >
      {opts.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(o.v)}
            className={
              'rounded-full px-2 py-[2px] text-[10px] font-semibold transition-colors ' +
              (active
                ? 'bg-[var(--color-text)] text-[var(--color-bg)]'
                : 'text-[var(--color-text-dim)]')
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function DonutSvg({
  bucket,
  hoverId,
  onHover,
}: {
  bucket: CategoryBreakdownCurrencyBucketType;
  hoverId: string | null;
  onHover: (id: string | null) => void;
}) {
  const total = minorToNumber(bucket.totalMinor);
  if (total <= 0) return null;

  // Convert to cumulative angles (radians from -π/2 = top). We pre-scan
  // the share-sums functionally so the map body stays pure — React
  // Compiler's immutability lint forbids `let` reassignment in a render
  // body.
  const START = -Math.PI / 2;
  const shares = bucket.items.map(
    (item) => minorToNumber(item.amountMinor) / total,
  );
  // Prefix sums — pure, no mutation of outer state.
  const prefix = shares.map((_, i) =>
    shares.slice(0, i + 1).reduce((a, b) => a + b, 0),
  );
  const arcs = bucket.items.map((item, i) => {
    const share = shares[i] ?? 0;
    const prev = i === 0 ? 0 : (prefix[i - 1] ?? 0);
    const curr = prefix[i] ?? prev;
    const start = START + prev * Math.PI * 2;
    const end = START + curr * Math.PI * 2;
    return { item, start, end, share };
  });

  const cx = SIZE / 2;
  const cy = SIZE / 2;

  return (
    <div className="flex justify-center">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE}>
        {/* base ring */}
        <circle
          cx={cx}
          cy={cy}
          r={RADIUS}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={THICKNESS}
          opacity={0.35}
        />
        {arcs.map((a) => {
          const active = hoverId === null || hoverId === a.item.categoryId;
          const x1 = cx + Math.cos(a.start) * RADIUS;
          const y1 = cy + Math.sin(a.start) * RADIUS;
          const x2 = cx + Math.cos(a.end) * RADIUS;
          const y2 = cy + Math.sin(a.end) * RADIUS;
          const largeArc = a.end - a.start > Math.PI ? 1 : 0;
          const d = `M ${x1} ${y1} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${x2} ${y2}`;
          return (
            <path
              key={a.item.categoryId}
              d={d}
              fill="none"
              stroke={colorForToken(a.item.colorToken ?? undefined)}
              strokeWidth={THICKNESS}
              strokeLinecap="butt"
              opacity={active ? 1 : 0.35}
              onMouseEnter={() => onHover(a.item.categoryId)}
              onMouseLeave={() => onHover(null)}
              style={{ transition: 'opacity .2s' }}
            >
              <title>
                {a.item.label} · {formatMoney(a.item.amountMinor, bucket.currencyCode)}
              </title>
            </path>
          );
        })}
        {/* center total */}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          fontSize={10}
          fill="var(--color-text-faint)"
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
        >
          TOTAL
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          fontSize={16}
          fontWeight={700}
          fill="var(--color-text)"
        >
          {formatMoney(bucket.totalMinor, bucket.currencyCode)}
        </text>
      </svg>
    </div>
  );
}

function Legend({
  bucket,
  hoverId,
  onHover,
}: {
  bucket: CategoryBreakdownCurrencyBucketType;
  hoverId: string | null;
  onHover: (id: string | null) => void;
}) {
  return (
    <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
      {bucket.items.map((it: CategoryBreakdownItemType) => {
        const active = hoverId === null || hoverId === it.categoryId;
        return (
          <li
            key={it.categoryId}
            onMouseEnter={() => onHover(it.categoryId)}
            onMouseLeave={() => onHover(null)}
            className="flex items-center gap-2"
            style={{ opacity: active ? 1 : 0.4, transition: 'opacity .2s' }}
          >
            <span
              className="h-3 w-3 shrink-0 rounded-sm"
              aria-hidden
              style={{ backgroundColor: colorForToken(it.colorToken ?? undefined) }}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-[var(--color-text)]">
                {it.label}
              </div>
              <div className="font-mono text-[10px] text-[var(--color-text-dim)]">
                {formatMoney(it.amountMinor, bucket.currencyCode)} · {it.percentOfTotal}%
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
