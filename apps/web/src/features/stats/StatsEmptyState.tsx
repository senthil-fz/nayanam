// Whole-screen empty state — rendered when the household has zero
// non-transfer transactions in the selected period (overview.byCurrency
// is empty). Copy + period pass-through follow spec §9.6.

import type { StatsPeriodKind } from '@nayanam/core';
import { periodLabel } from './util';

export function StatsEmptyState({
  period,
  onAdd,
  canMutate,
}: {
  period: StatsPeriodKind;
  onAdd?: () => void;
  canMutate: boolean;
}) {
  return (
    <div className="rounded-[22px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-10 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M4 19V9m6 10V5m6 14v-7m4 7H2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <h2 className="text-base font-semibold">No activity this {periodLabel(period)}</h2>
      <p className="mt-1 text-xs text-[var(--color-text-dim)]">
        Add a transaction to start seeing your stats.
      </p>
      {canMutate && onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          className="mt-4 rounded-full bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-white"
        >
          Add a transaction
        </button>
      ) : null}
    </div>
  );
}
