// Day-group section header — uppercase mono date label.
// Matches the prototype's date-cap typography on `TxRow` and keeps the
// grouping consistent with web's `DayGroupHeader`.

import { Text, View } from 'react-native';
import { LIGHT } from '@nayanam/ui-tokens';
import { dayGroupLabel } from './format';

export function DayGroupHeader({ iso }: { iso: string }) {
  return (
    <View
      style={{
        paddingTop: 18,
        paddingBottom: 6,
      }}
      accessibilityRole="header"
      accessibilityLabel={dayGroupLabel(iso)}
    >
      <Text
        style={{
          fontSize: 11,
          color: LIGHT.textFaint,
          fontFamily: 'Geist Mono',
          letterSpacing: 0.6,
        }}
      >
        {dayGroupLabel(iso)}
      </Text>
    </View>
  );
}
