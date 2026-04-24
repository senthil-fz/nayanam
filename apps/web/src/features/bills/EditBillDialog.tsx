// Edit-bill modal.

import type { Account, Bill, Category } from '@nayanam/core';
import { ApiRequestError } from '@nayanam/core';
import { Dialog } from '../../components/Dialog';
import { useUpdateBill } from '../../lib/hooks';
import { BillForm, billToFormValues } from './BillForm';

type Props = {
  open: boolean;
  onClose: () => void;
  bill: Bill;
  accounts: Account[];
  categories: Category[];
};

export function EditBillDialog({ open, onClose, bill, accounts, categories }: Props) {
  const update = useUpdateBill();

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Edit ${bill.name}`}
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
            form="edit-bill-form"
            disabled={update.isPending}
            className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {update.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      }
    >
      <BillForm
        id="edit-bill-form"
        accounts={accounts}
        categories={categories}
        defaultValues={billToFormValues(bill, accounts)}
        onSubmit={(v) => {
          update.mutate(
            {
              billId: bill.id,
              name: v.name,
              amountMinor: v.amountMinor,
              accountId: v.accountId,
              categoryId: v.categoryId,
              cycle: v.cycle,
              customDays: v.customDays,
              startAt: v.startAt,
              autoLog: v.autoLog,
              note: v.note,
            },
            { onSuccess: () => onClose() },
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
