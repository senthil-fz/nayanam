// Delete (archive) household. OWNER only. Backend returns HOUSEHOLD_NOT_EMPTY
// (409) when other members remain — we pre-gate on member count to avoid
// wasted round-trips and still surface the server message when hit.

import { useState } from 'react';
import { ApiRequestError } from '@nayanam/core';
import { Dialog } from '../../components/Dialog';
import { useDeleteHousehold } from '../../lib/hooks';
import { useToast } from '../../components/Toast';

export function DeleteHouseholdDialog({
  open,
  onClose,
  householdId,
  householdName,
  memberCount,
}: {
  open: boolean;
  onClose: () => void;
  householdId: string;
  householdName: string;
  memberCount: number;
}) {
  const [confirmText, setConfirmText] = useState('');
  const deleteMut = useDeleteHousehold();
  const toast = useToast();

  const notEmpty = memberCount > 1;
  const matches = confirmText.trim() === householdName.trim();

  const onDelete = async () => {
    try {
      await deleteMut.mutateAsync({ householdId });
      toast.show('Household deleted');
      onClose();
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === 'HOUSEHOLD_NOT_EMPTY') {
        toast.show('Remove or have all other members leave first.', {
          tone: 'negative',
        });
        return;
      }
      toast.show(
        e instanceof Error ? e.message : 'Could not delete',
        { tone: 'negative' },
      );
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Delete household" size="sm">
      <div className="flex flex-col gap-4">
        {notEmpty ? (
          <p className="text-sm text-[var(--color-text)]">
            Remove or have all other members leave first. Only the owner of an empty
            household can delete it.
          </p>
        ) : (
          <>
            <p className="text-sm text-[var(--color-text)]">
              This archives the household and hides it from your list. Type
              {' '}<strong>{householdName}</strong>{' '}
              to confirm.
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Household name"
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
            />
          </>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-medium text-[var(--color-text-dim)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onDelete()}
            disabled={deleteMut.isPending || notEmpty || !matches}
            className="rounded-full bg-[var(--color-negative)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {deleteMut.isPending ? 'Deleting…' : 'Delete household'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
