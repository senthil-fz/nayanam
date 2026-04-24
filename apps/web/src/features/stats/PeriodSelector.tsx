// Segmented Week / Month / Year selector. A disabled "Custom" chip
// communicates v2 intent per spec §9.2.
//
// ARIA: `role="tablist"` with `aria-selected` on the active chip so
// keyboard/screen-reader users know the group semantics.

import type { StatsPeriodKind } from '@nayanam/core';

type UIPeriod = 'week' | 'month' | 'year';

const OPTIONS: Array<{ value: UIPeriod; label: string }> = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

export function PeriodSelector({
  value,
  onChange,
}: {
  value: StatsPeriodKind;
  onChange: (v: UIPeriod) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Period"
      className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1"
    >
      {OPTIONS.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={
              'rounded-full px-3 py-1 text-xs font-semibold transition-colors ' +
              (active
                ? 'bg-[var(--color-text)] text-[var(--color-bg)]'
                : 'text-[var(--color-text-dim)] hover:text-[var(--color-text)]')
            }
          >
            {o.label}
          </button>
        );
      })}
      <span
        aria-disabled="true"
        title="Custom range coming soon"
        className="ml-1 rounded-full px-3 py-1 text-xs font-semibold text-[var(--color-text-faint)] opacity-60"
      >
        Custom
      </span>
    </div>
  );
}
