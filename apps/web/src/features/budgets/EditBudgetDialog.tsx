// Edit-budget modal. Only mutable fields (name, amountMinor, rollover, endAt)
// are forwarded to the PATCH — scope/category/currency/period/startAt are
// locked in the form and would return a *_IMMUTABLE error server-side anyway.

import type { Budget, Category } from '@nayanam/core';
import { ApiRequestError } from '@nayanam/core';
import { Dialog } from '../../components/Dialog';
import { useUpdateBudget } from '../../lib/hooks';
import { BudgetForm, budgetToFormValues } from './BudgetForm';

type Props = {
  open: boolean;
  onClose: () => void;
  budget: Budget;
  categories: Category[];
};

export function EditBudgetDialog({ open, onClose, budget, categories }: Props) {
  const update = useUpdateBudget();

  if (!open) return null;

  const initialValues = budgetToFormValues(budget);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit budget"
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
            form="edit-budget-form"
            disabled={update.isPending}
            className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {update.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      }
    >
      <BudgetForm
        id="edit-budget-form"
        mode="edit"
        categories={categories}
        defaultCurrencyCode={budget.currencyCode}
        defaultValues={initialValues}
        onSubmit={(v) => {
          update.mutate(
            {
              budgetId: budget.id,
              name: v.name,
              amountMinor: v.amountMinor,
              rollover: v.rollover,
              endAt: v.endAt,
            },
            {
              onSuccess: () => onClose(),
            },
          );
        }}
      />
      {update.isError ? (
        <p className="mt-2 text-sm text-[var(--color-negative)]">
          {(update.error as ApiRequestError).message}
        </p>
      ) : null}
    </Dialog>
  );
}
