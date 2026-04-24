// Phase 5 push wiring — foreground banner handler + tap-to-route handler.
// The Phase 1 `push.ts` module owns token registration; this module owns
// in-app behavior. Kept separate so the Phase 1 registration stays lean.

import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { AndroidNotificationPriority } from 'expo-notifications';
import { router } from 'expo-router';

// Configure the foreground-display behavior once on module import. Calling
// this multiple times is safe — the handler is overwritten, not stacked.
export function installBillPushHandler(): void {
  Notifications.setNotificationHandler({
    // The `handleNotification` signature is typed as async in expo-notifications,
    // but we have no async work to do — wrap the body in Promise.resolve to
    // satisfy `require-await` without an eslint-disable.
    handleNotification: (notification) => {
      const data = (notification.request.content.data ?? {}) as {
        type?: string;
      };
      const isBill =
        data.type === 'bill.due_soon' || data.type === 'bill.overdue';

      // Fire a matching haptic on receipt, if we know the semantic level.
      if (data.type === 'bill.overdue') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
          () => {},
        );
      } else if (data.type === 'bill.due_soon') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }

      return Promise.resolve({
        // Newer API (expo-notifications SDK 54+): both fields are required.
        shouldShowBanner: true,
        shouldShowList: true,
        // Deprecated alias for older runtimes — harmless to keep.
        shouldShowAlert: true,
        shouldPlaySound: isBill,
        shouldSetBadge: false,
        priority: AndroidNotificationPriority.HIGH,
      });
    },
  });
}

/**
 * Register the tap-to-open listener. Returns the subscription so the caller
 * can dispose of it on unmount (matches Expo's emitter pattern).
 */
export function installBillPushResponseListener(): { remove: () => void } {
  const sub = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = (response.notification.request.content.data ?? {}) as {
        type?: string;
        billId?: string;
      };
      if (!data.type) return;
      if (data.type === 'bill.due_soon' || data.type === 'bill.overdue') {
        if (data.billId) {
          router.push(`/bills/${data.billId}`);
        } else {
          router.push('/(tabs)/bills');
        }
      }
    },
  );
  return sub;
}
