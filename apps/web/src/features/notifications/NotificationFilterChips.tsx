// Filter chips for the notification center: All / Bills / Budgets / Transactions.
// The "All" option maps to `undefined` category (the API filter is absent).

import type { NotificationCategory } from '@nayanam/core';

export type CategoryFilter = NotificationCategory | undefined;

const OPTIONS: Array<{ label: string; value: CategoryFilter }> = [
  { label: 'All', value: undefined },
  { label: 'Bills', value: 'bill' },
  { label: 'Budgets', value: 'budget' },
  { label: 'Transactions', value: 'transaction' },
];

type Props = {
  value: CategoryFilter;
  onChange: (v: CategoryFilter) => void;
};

export function NotificationFilterChips({ value, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Filter notifications"
      className="flex flex-wrap gap-1.5 px-3 pb-2"
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.label}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors ' +
              (active
                ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                : 'border-[var(--color-border)] text-[var(--color-text-dim)] hover:bg-[var(--color-surface-alt)]')
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
