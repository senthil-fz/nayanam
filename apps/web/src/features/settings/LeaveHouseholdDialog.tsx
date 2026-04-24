// Confirm-leave dialog. When the caller is the sole OWNER with other members,
// the backend returns HOUSEHOLD_LAST_OWNER and we surface a hint to promote
// another member first.

import type { ApiHouseholdRole } from '@nayanam/contracts';
import { Dialog } from '../../components/Dialog';
import { useLeaveHousehold } from '../../lib/hooks';
import { useToast } from '../../components/Toast';

export function LeaveHouseholdDialog({
  open,
  onClose,
  householdId,
  myRole,
  ownerCount,
  memberCount,
}: {
  open: boolean;
  onClose: () => void;
  householdId: string;
  myRole: ApiHouseholdRole | null;
  ownerCount: number;
  memberCount: number;
}) {
  const leave = useLeaveHousehold();
  const toast = useToast();
  const isLastOwner =
    myRole === 'OWNER' && ownerCount <= 1 && memberCount > 1;

  const onLeave = async () => {
    try {
      await leave.mutateAsync({ householdId });
      toast.show('You left the household');
      onClose();
    } catch (e) {
      toast.show(
        e instanceof Error ? e.message : 'Could not leave',
        { tone: 'negative' },
      );
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Leave household" size="sm">
      <div className="flex flex-col gap-4">
        {isLastOwner ? (
          <p className="text-sm text-[var(--color-text)]">
            You are the last owner. Promote someone before leaving or deleting.
          </p>
        ) : (
          <p className="text-sm text-[var(--color-text)]">
            You&rsquo;ll lose access to this household&rsquo;s data. You can rejoin via a new invite.
          </p>
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
            onClick={() => void onLeave()}
            disabled={leave.isPending || isLastOwner}
            className="rounded-full bg-[var(--color-negative)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {leave.isPending ? 'Leaving…' : 'Leave household'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
