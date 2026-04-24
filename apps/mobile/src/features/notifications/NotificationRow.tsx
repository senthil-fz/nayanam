// A single notification row. Icon, title, subtitle, relative time, unread dot.
// Long-press opens an Alert with Mark-unread / Delete. Tap fires the provided
// onPress (the parent marks-read, closes the sheet, and routes).

import { Alert, Pressable, Text, View } from 'react-native';
import {
  ArrowLeftRight,
  Bell,
  Receipt,
  Target,
  type LucideIcon,
} from 'lucide-react-native';
import type { Notification, NotificationCategory } from '@nayanam/core';
import { ACCENTS, LIGHT } from '@nayanam/ui-tokens';
import { hapticMedium } from '../../lib/haptics';
import { titleForType } from './titleForType';

type Props = {
  notification: Notification;
  /** Frozen "now" timestamp passed in so relative times stay stable. */
  now: number;
  onPress: () => void;
  onMarkUnread: () => void;
  onDelete: () => void;
};

const ICONS: Record<NotificationCategory, LucideIcon> = {
  bill: Receipt,
  budget: Target,
  transaction: ArrowLeftRight,
  transfer: ArrowLeftRight,
  household: Bell,
  other: Bell,
};

function relativeTime(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.floor((now - t) / 1000));
  if (diffSec < 45) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const days = Math.floor(diffSec / 86400);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function NotificationRow({
  notification,
  now,
  onPress,
  onMarkUnread,
  onDelete,
}: Props) {
  const display = titleForType(notification.type, notification.payload ?? {});
  const unread = notification.readAt === null;
  const Icon = ICONS[notification.category] ?? Bell;

  const handleLongPress = () => {
    hapticMedium();
    const unreadOption = unread
      ? null
      : {
          text: 'Mark unread',
          onPress: onMarkUnread,
        };
    const buttons: {
      text: string;
      style?: 'cancel' | 'destructive' | 'default';
      onPress?: () => void;
    }[] = [];
    if (unreadOption) buttons.push(unreadOption);
    buttons.push({ text: 'Delete', style: 'destructive', onPress: onDelete });
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(display.title, display.subtitle, buttons);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        unread ? `Unread notification: ${display.title}` : display.title
      }
      onPress={onPress}
      onLongPress={handleLongPress}
      delayLongPress={400}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: pressed
          ? LIGHT.chipBg
          : unread
            ? ACCENTS.indigo.hex + '10'
            : 'transparent',
      })}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          marginTop: 6,
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: unread ? ACCENTS.indigo.hex : 'transparent',
        }}
      />
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: LIGHT.chipBg,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        }}
      >
        <Icon size={14} color={LIGHT.textDim} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              fontSize: 14,
              fontWeight: '500',
              color: LIGHT.text,
              flex: 1,
            }}
          >
            {display.title}
          </Text>
          <Text
            style={{
              fontSize: 10,
              color: LIGHT.textDim,
              fontFamily: 'Geist Mono',
              letterSpacing: 0.3,
              textTransform: 'uppercase',
            }}
          >
            {relativeTime(notification.createdAt, now)}
          </Text>
        </View>
        {display.subtitle ? (
          <Text
            numberOfLines={1}
            style={{
              marginTop: 2,
              fontSize: 12,
              color: LIGHT.textDim,
            }}
          >
            {display.subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
