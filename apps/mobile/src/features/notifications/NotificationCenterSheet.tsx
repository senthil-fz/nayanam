// Bottom-sheet host for the Phase 8 notification center. Snap to 92% (single
// snap point — mirrors the web popover's dominant-presence behavior). The
// sheet closes on row-tap before navigation fires.

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { LIGHT } from '@nayanam/ui-tokens';
import {
  useMarkAllNotificationsRead,
  useUnreadNotificationCount,
} from '../../lib/hooks';
import {
  NotificationFilterChips,
  type CategoryFilter,
} from './NotificationFilterChips';
import { NotificationList } from './NotificationList';

export type NotificationCenterSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

export const NotificationCenterSheet = forwardRef<NotificationCenterSheetHandle>(
  function NotificationCenterSheet(_props, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const snapPoints = useMemo(() => ['92%'], []);
    const [category, setCategory] = useState<CategoryFilter>(undefined);

    const unread = useUnreadNotificationCount();
    const hasUnread = (unread.data?.unreadCount ?? 0) > 0;
    const markAll = useMarkAllNotificationsRead();

    useImperativeHandle(ref, () => ({
      present: () => sheetRef.current?.present(),
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.35}
        />
      ),
      [],
    );

    const close = useCallback(() => {
      sheetRef.current?.dismiss();
    }, []);

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: LIGHT.bg }}
        handleIndicatorStyle={{ backgroundColor: LIGHT.border }}
      >
        <View
          style={{
            paddingHorizontal: 16,
            paddingBottom: 8,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: '700', color: LIGHT.text }}>
            Notifications
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              hasUnread
                ? 'Mark all notifications as read'
                : 'No unread notifications'
            }
            disabled={!hasUnread || markAll.isPending}
            onPress={() => markAll.mutate({ category })}
            style={({ pressed }) => ({
              paddingHorizontal: 10,
              paddingVertical: 6,
              opacity: !hasUnread ? 0.4 : pressed ? 0.7 : 1,
            })}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: LIGHT.text,
              }}
            >
              Mark all
            </Text>
          </Pressable>
        </View>
        <NotificationFilterChips value={category} onChange={setCategory} />
        <View
          style={{
            flex: 1,
            borderTopWidth: 1,
            borderTopColor: LIGHT.border,
          }}
        >
          <NotificationList category={category} onRowNavigate={close} />
        </View>
      </BottomSheetModal>
    );
  },
);
