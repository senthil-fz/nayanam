// Add-budget modal. Supports optional prefill from suggestions.

import type { Category } from '@nayanam/core';
import { ApiRequestError } from '@nayanam/core';
import { Dialog } from '../../components/Dialog';
import { useCreateBudget } from '../../lib/hooks';
import { BudgetForm, type BudgetFormValues } from './BudgetForm';

type Props = {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  occupiedCategoryIds: ReadonlySet<string>;
  defaultCurrencyCode: string;
  prefill?: Partial<BudgetFormValues>;
};

export function AddBudgetDialog({
  open,
  onClose,
  categories,
  occupiedCategoryIds,
  defaultCurrencyCode,
  prefill,
}: Props) {
  const create = useCreateBudget();

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New budget"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-budget-form"
            disabled={create.isPending}
            className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {create.isPending ? 'Saving…' : 'Save budget'}
          </button>
        </div>
      }
    >
      <BudgetForm
        id="add-budget-form"
        mode="create"
        categories={categories}
        occupiedCategoryIds={occupiedCategoryIds}
        defaultCurrencyCode={defaultCurrencyCode}
        defaultValues={prefill}
        onSubmit={(v) => {
          create.mutate(
            {
              name: v.name,
              scope: v.scope,
              categoryId: v.categoryId,
              amountMinor: v.amountMinor,
              currencyCode: v.currencyCode,
              period: v.period,
              rollover: v.rollover,
              startAt: v.startAt,
              endAt: v.endAt,
            },
            {
              onSuccess: () => onClose(),
            },
          );
        }}
      />
      {create.isError ? (
        <p className="mt-2 text-sm text-[var(--color-negative)]">
          {(create.error as ApiRequestError).message}
        </p>
      ) : null}
    </Dialog>
  );
}
