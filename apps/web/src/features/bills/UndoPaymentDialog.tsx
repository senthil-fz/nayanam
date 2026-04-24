// Undo the latest bill payment. Soft-deletes the payment + its transaction
// and rolls `nextDueAt` back one cycle.

import type { Bill, BillPayment } from '@nayanam/core';
import { ApiRequestError, formatMoney } from '@nayanam/core';
import { Dialog } from '../../components/Dialog';
import { useUndoBillPayment } from '../../lib/hooks';

type Props = {
  open: boolean;
  onClose: () => void;
  bill: Bill;
  payment: BillPayment;
};

export function UndoPaymentDialog({ open, onClose, bill, payment }: Props) {
  const undo = useUndoBillPayment();

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Undo last payment"
      size="sm"
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
            type="button"
            disabled={undo.isPending}
            onClick={() => {
              undo.mutate(
                { billId: bill.id, paymentId: payment.id },
                { onSuccess: () => onClose() },
              );
            }}
            className="rounded-[var(--radius-md)] bg-[var(--color-negative)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {undo.isPending ? 'Undoing…' : 'Undo payment'}
          </button>
        </div>
      }
    >
      <p className="text-sm text-[var(--color-text-dim)]">
        This reverses the{' '}
        <strong className="text-[var(--color-text)]">
          {formatMoney(payment.amountMinor, bill.currencyCode)}
        </strong>{' '}
        payment recorded on{' '}
        {new Date(payment.paidAt).toLocaleDateString()} and rolls the next-due
        date back one cycle. The backing transaction is soft-deleted and the
        account balance is restored.
      </p>
      {undo.isError ? (
        <p className="mt-2 text-sm text-[var(--color-negative)]">
          {(undo.error as ApiRequestError).message}
        </p>
      ) : null}
    </Dialog>
  );
}
