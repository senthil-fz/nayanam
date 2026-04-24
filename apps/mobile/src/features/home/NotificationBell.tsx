// Notification bell with an unread red-dot+count badge. Tap opens the Phase
// 8 notification center bottom sheet.

import { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Bell } from 'lucide-react-native';
import { LIGHT } from '@nayanam/ui-tokens';
import { useUnreadNotificationCount } from '../../lib/hooks';
import { hapticLight } from '../../lib/haptics';
import {
  NotificationCenterSheet,
  type NotificationCenterSheetHandle,
} from '../notifications/NotificationCenterSheet';

export function NotificationBell() {
  const sheetRef = useRef<NotificationCenterSheetHandle>(null);
  const q = useUnreadNotificationCount({ refetchIntervalMs: 60_000 });
  const count = q.isError ? 0 : (q.data?.unreadCount ?? 0);
  const hasUnread = count > 0;

  const label = hasUnread
    ? `Notifications, ${count > 99 ? '99+' : count} unread`
    : 'Notifications, none unread';

  const onPress = () => {
    hapticLight();
    sheetRef.current?.present();
  };

  const display = count > 99 ? '99+' : String(count);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
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
              top: -2,
              right: -2,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              paddingHorizontal: 4,
              backgroundColor: LIGHT.negative,
              borderWidth: 1.5,
              borderColor: LIGHT.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                color: '#fff',
                fontSize: 9,
                fontWeight: '700',
                fontFamily: 'Geist Mono',
                includeFontPadding: false,
              }}
            >
              {display}
            </Text>
          </View>
        ) : null}
      </Pressable>
      <NotificationCenterSheet ref={sheetRef} />
    </>
  );
}
