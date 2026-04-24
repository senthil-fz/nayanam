// Add-bill modal.

import type { Account, Category } from '@nayanam/core';
import { ApiRequestError } from '@nayanam/core';
import { Dialog } from '../../components/Dialog';
import { useCreateBill } from '../../lib/hooks';
import { BillForm } from './BillForm';

type Props = {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  categories: Category[];
};

export function AddBillDialog({ open, onClose, accounts, categories }: Props) {
  const create = useCreateBill();

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New bill"
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
            form="add-bill-form"
            disabled={create.isPending}
            className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {create.isPending ? 'Saving…' : 'Save bill'}
          </button>
        </div>
      }
    >
      <BillForm
        id="add-bill-form"
        accounts={accounts}
        categories={categories}
        onSubmit={(v) => {
          create.mutate(
            {
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
