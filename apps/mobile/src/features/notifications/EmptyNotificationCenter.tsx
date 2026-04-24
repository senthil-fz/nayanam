// Empty state for the notification center. Bell icon + two-line copy.

import { Text, View } from 'react-native';
import { Bell } from 'lucide-react-native';
import { LIGHT } from '@nayanam/ui-tokens';

export function EmptyNotificationCenter() {
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        paddingVertical: 40,
        gap: 8,
      }}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: LIGHT.chipBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Bell size={20} color={LIGHT.textDim} />
      </View>
      <Text
        style={{
          fontSize: 14,
          fontWeight: '600',
          color: LIGHT.text,
          textAlign: 'center',
        }}
      >
        No notifications yet
      </Text>
      <Text
        style={{
          fontSize: 12,
          color: LIGHT.textDim,
          textAlign: 'center',
          maxWidth: 220,
        }}
      >
        Bills and budget alerts land here.
      </Text>
    </View>
  );
}
