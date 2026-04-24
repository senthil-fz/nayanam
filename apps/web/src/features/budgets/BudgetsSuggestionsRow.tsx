// Horizontal row of suggestion chips. Clicking a chip prefills AddBudgetDialog
// with scope=CATEGORY and the suggested amount.

import { Plus } from 'lucide-react';
import { formatMoney } from '@nayanam/core';
import { useBudgetsSuggest } from '../../lib/hooks';
import type { BudgetFormValues } from './BudgetForm';
import { minorStringToMajor } from '../cards/AccountForm';

type Props = {
  canMutate: boolean;
  onPick: (prefill: Partial<BudgetFormValues>) => void;
};

export function BudgetsSuggestionsRow({ canMutate, onPick }: Props) {
  const suggestQuery = useBudgetsSuggest();

  if (!canMutate) return null;
  if (suggestQuery.isLoading || suggestQuery.isError) return null;
  const items = suggestQuery.data?.items ?? [];
  if (items.length === 0) return null;

  return (
    <section aria-label="Quick add suggestions" className="space-y-2">
      <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
        Quick add
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {items.map((s) => (
          <button
            key={s.categoryId}
            type="button"
            onClick={() =>
              onPick({
                scope: 'CATEGORY',
                categoryId: s.categoryId,
                name: s.categoryName,
                amount: minorStringToMajor(
                  s.suggestedAmountMinor,
                  s.currencyCode,
                ),
                currencyCode: s.currencyCode,
                period: 'MONTHLY',
                rollover: false,
              })
            }
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
          >
            <Plus size={12} aria-hidden />
            <span className="truncate">
              {s.categoryName} ·{' '}
              {formatMoney(s.suggestedAmountMinor, s.currencyCode)}/mo
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
