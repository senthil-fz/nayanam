// Push wiring — foreground banner handler + tap-to-route handler.
// The Phase 1 `push.ts` module owns token registration; this module owns
// in-app behavior. Kept separate so the Phase 1 registration stays lean.
//
// Phase 8 update: tap routing now delegates to shared-core
// `resolveNotificationRoute`, so push taps and in-app notification-center taps
// use the same route table. Previously `bill.*` was hard-coded here; budget
// and transaction pushes silently dropped to `/`.

import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { AndroidNotificationPriority } from 'expo-notifications';
import { router } from 'expo-router';
import {
  resolveNotificationRoute,
  type Notification as CoreNotification,
} from '@nayanam/core';

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
 * Map a tapped push payload to a `CoreNotification`-shaped object just rich
 * enough for `resolveNotificationRoute`. Push payloads carry the dotted
 * `type` + an opaque `payload` record; the other notification fields are
 * routing-irrelevant so we stub them with safe defaults.
 */
function pushDataToNotification(data: Record<string, unknown>): CoreNotification | null {
  const type = typeof data.type === 'string' ? data.type : null;
  if (!type) return null;
  // Treat the entire `data` bag as the payload — push payloads flatten the
  // notification's payload fields alongside `type`. `resolveNotificationRoute`
  // reads only `billId`, `budgetId`, `transactionId`, `transferId`.
  return {
    id: typeof data.id === 'string' ? data.id : '',
    userId: '',
    householdId: null,
    type,
    category: deriveCategory(type),
    payload: data,
    readAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
  };
}

// Inline copy of the shared `deriveCategoryFromType` to avoid importing the
// helper twice — the routing module already calls it internally, but the
// schema type forces us to preset `category`.
function deriveCategory(
  type: string,
): CoreNotification['category'] {
  const prefix = type.split('.')[0] ?? '';
  switch (prefix) {
    case 'bill':
    case 'budget':
    case 'transaction':
    case 'transfer':
    case 'household':
      return prefix;
    default:
      return 'other';
  }
}

/**
 * Register the tap-to-open listener. Returns the subscription so the caller
 * can dispose of it on unmount (matches Expo's emitter pattern).
 */
export function installBillPushResponseListener(): { remove: () => void } {
  const sub = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      // `content.data` is typed as `Record<string, unknown>` in
      // expo-notifications — narrow defensively in case of a legacy payload
      // shape at runtime.
      const raw = response.notification.request.content.data;
      const data: Record<string, unknown> =
        raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
      const notification = pushDataToNotification(data);
      if (!notification) return;
      const target = resolveNotificationRoute(notification).mobile;
      if (target) {
        router.push(target);
      }
    },
  );
  return sub;
}
