// Confirm-delete modal for a transaction (or transfer pair).

import { ApiRequestError, type Transaction } from '@nayanam/core';
import {
  useDeleteTransaction,
  useDeleteTransfer,
  useRestoreTransaction,
  useRestoreTransfer,
} from '../../lib/hooks';
import { Dialog } from '../../components/Dialog';
import { useToast } from '../../components/Toast';

type Props = {
  open: boolean;
  onClose: () => void;
  transaction: Transaction | null;
};

export function DeleteTransactionConfirm({ open, onClose, transaction }: Props) {
  const toast = useToast();
  const isTransfer = Boolean(transaction?.transferId);
  const deleteTxn = useDeleteTransaction(transaction?.id ?? '');
  const deleteTxr = useDeleteTransfer(transaction?.transferId ?? '');
  const restoreTxn = useRestoreTransaction(transaction?.id ?? '');
  const restoreTxr = useRestoreTransfer(transaction?.transferId ?? '');

  if (!transaction) return null;

  const run = () => {
    if (isTransfer && transaction.transferId) {
      const transferId = transaction.transferId;
      deleteTxr.mutate({}, {
        onSuccess: () => {
          onClose();
          toast.show('Transfer deleted.', {
            action: {
              label: 'Undo',
              onClick: () => {
                void restoreTxr.mutateAsync({}).catch(() => undefined);
                void transferId;
              },
            },
          });
        },
      });
      return;
    }
    deleteTxn.mutate({}, {
      onSuccess: () => {
        onClose();
        toast.show('Transaction deleted.', {
          action: {
            label: 'Undo',
            onClick: () => {
              void restoreTxn.mutateAsync({}).catch(() => undefined);
            },
          },
        });
      },
    });
  };

  const pending = deleteTxn.isPending || deleteTxr.isPending;
  const err =
    (deleteTxn.error as ApiRequestError | null) ??
    (deleteTxr.error as ApiRequestError | null);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isTransfer ? 'Delete the transfer?' : 'Delete this transaction?'}
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
            onClick={run}
            disabled={pending}
            className="rounded-[var(--radius-md)] bg-[var(--color-negative)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      }
    >
      <p className="text-sm text-[var(--color-text-dim)]">
        {isTransfer
          ? 'Both pair-rows will be removed and the balances on both accounts will be reversed. You can undo from the toast.'
          : 'The transaction will be soft-deleted and the account balance will be reversed. You can undo from the toast.'}
      </p>
      {err ? (
        <p className="mt-3 text-sm text-[var(--color-negative)]">{err.message}</p>
      ) : null}
    </Dialog>
  );
}
