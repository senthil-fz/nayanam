// Notification bell with an unread red-dot overlay.
// Tap: warning haptic + native Alert pointing to the Phase 8 notification centre.
// Polls every 60s while mounted; focusManager (wired in _layout) pauses polling
// while the app is backgrounded.

import { Alert, Pressable, View } from 'react-native';
import { Bell } from 'lucide-react-native';
import { LIGHT } from '@nayanam/ui-tokens';
import { useUnreadNotificationCount } from '../../lib/hooks';
import { hapticLight } from '../../lib/haptics';

export function NotificationBell() {
  const q = useUnreadNotificationCount({ refetchIntervalMs: 60_000 });
  const count = q.isError ? 0 : (q.data?.unreadCount ?? 0);
  const hasUnread = count > 0;

  const label = hasUnread
    ? `Notifications, ${count > 99 ? '99+' : count} unread`
    : 'Notifications, none unread';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        hapticLight();
        Alert.alert(
          'Notifications',
          'Notification center arrives in Phase 8.',
        );
      }}
      style={({ pressed }) => ({
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: LIGHT.chipBg,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Bell size={18} color={LIGHT.text} />
      {hasUnread ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            top: 9,
            right: 10,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: LIGHT.negative,
            borderWidth: 1.5,
            borderColor: LIGHT.surface,
          }}
        />
      ) : null}
    </Pressable>
  );
}
