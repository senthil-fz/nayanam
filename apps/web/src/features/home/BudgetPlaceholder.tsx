// Static placeholder. Real budgets land in Phase 6.

import { Target } from 'lucide-react';

export function BudgetPlaceholder() {
  return (
    <section
      aria-label="Monthly budget"
      className="flex items-center gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-alt)] text-[var(--color-text-dim)]"
      >
        <Target size={20} strokeWidth={1.5} />
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium text-[var(--color-text)]">
          Monthly budget
        </div>
        <div className="text-xs text-[var(--color-text-dim)]">
          Budgets arrive in a later release.
        </div>
      </div>
    </section>
  );
}
