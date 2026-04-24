// All / Due soon / Active / Paused filter chips. `role=tablist` for a11y.

import type { BillsListFilter } from '@nayanam/core';

type Props = {
  value: BillsListFilter;
  onChange: (next: BillsListFilter) => void;
};

const CHIPS: Array<{ key: BillsListFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'due-soon', label: 'Due soon' },
  { key: 'active', label: 'Active' },
  { key: 'paused', label: 'Paused' },
];

export function BillsFilterChips({ value, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Filter bills"
      className="flex gap-1.5 overflow-x-auto pb-1"
    >
      {CHIPS.map((c) => {
        const active = c.key === value;
        return (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(c.key)}
            className={
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ' +
              (active
                ? 'bg-[var(--color-text)] text-[var(--color-bg)]'
                : 'bg-[var(--color-surface-alt)] text-[var(--color-text)] hover:bg-[var(--color-border)]')
            }
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
