// Delete-confirm helper. The spec asks for a "destructive Alert.alert with
// Undo-via-toast after delete". Without a toast system in Phase 3, we use a
// two-step flow:
//   1. Alert.alert confirms deletion (destructive button).
//   2. On success, a second Alert.alert offers "Undo" which calls restore.
// A real toast system lands in a later phase; until then this gives the
// user a reliable undo path with zero new deps.

import { Alert } from 'react-native';
import { apiClient } from '../../lib/api';
import { hapticError, hapticSuccess } from '../../lib/haptics';
import { logWarn } from '../../lib/log';
import { ulid } from 'ulid';

export type TxForDelete = {
  id: string;
  transferId: string | null;
  label: string;
};

async function restoreTransaction(id: string): Promise<void> {
  await apiClient.restoreTransaction(id, ulid());
}

async function restoreTransfer(id: string): Promise<void> {
  await apiClient.restoreTransfer(id, ulid());
}

/**
 * Confirms deletion then offers Undo on success. Returns a promise that
 * resolves when the deletion (and optional undo) flow completes.
 */
export function confirmDeleteTransaction(
  tx: TxForDelete,
  performDelete: () => Promise<void>,
): void {
  const isTransfer = Boolean(tx.transferId);
  const title = isTransfer ? 'Delete transfer?' : 'Delete transaction?';
  const message = isTransfer
    ? 'Both sides of this transfer will be removed and balances restored.'
    : `"${tx.label}" will be moved to the trash. You can undo from the prompt that appears after.`;

  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Delete',
      style: 'destructive',
      onPress: () => {
        void (async () => {
        try {
          await performDelete();
          hapticSuccess();
          Alert.alert('Deleted', isTransfer ? 'Transfer removed.' : 'Transaction removed.', [
            {
              text: 'Undo',
              onPress: () => {
                void (async () => {
                try {
                  if (isTransfer && tx.transferId) await restoreTransfer(tx.transferId);
                  else await restoreTransaction(tx.id);
                  hapticSuccess();
                } catch (err) {
                  hapticError();
                  Alert.alert('Undo failed', 'Please try restoring from Edit.');
                  logWarn('Undo failed', err);
                }
                })();
              },
            },
            { text: 'OK', style: 'cancel' },
          ]);
        } catch (err) {
          hapticError();
          Alert.alert('Delete failed', (err as Error).message ?? 'Unknown error.');
        }
        })();
      },
    },
  ]);
}
