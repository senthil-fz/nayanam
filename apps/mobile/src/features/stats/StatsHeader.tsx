// Stats title + eyebrow + right slot (currency switcher chip).
// Matches the web `StatsHeader`; the left-aligned "ANALYTICS" eyebrow +
// "Statistics" title keeps parity with the web route and the prototype's
// top-nav typography.

import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { LIGHT } from '@nayanam/ui-tokens';

export function StatsHeader({ right }: { right?: ReactNode }) {
  return (
    <View
      style={{
        paddingHorizontal: 20,
        paddingTop: 8,
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 10,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: LIGHT.textFaint,
            fontFamily: 'Geist Mono',
          }}
        >
          Analytics
        </Text>
        <Text
          accessibilityRole="header"
          style={{
            fontSize: 28,
            fontWeight: '700',
            color: LIGHT.text,
            letterSpacing: -0.6,
            marginTop: 2,
          }}
        >
          Statistics
        </Text>
      </View>
      {right}
    </View>
  );
}
