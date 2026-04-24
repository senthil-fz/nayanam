// Segmented Week / Month / Year pill selector with a disabled "Custom"
// chip communicating v2 intent (spec §9.2). Haptic selection on change.
// Mirrors the prototype's `Segmented` pill — dark-on-light active chip.

import { Pressable, Text, View } from 'react-native';
import { LIGHT } from '@nayanam/ui-tokens';
import { hapticSelection } from '../../lib/haptics';
import type { UIPeriod } from './util';

const OPTIONS: Array<{ value: UIPeriod; label: string }> = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

type Props = {
  value: UIPeriod;
  onChange: (v: UIPeriod) => void;
};

export function PeriodSelector({ value, onChange }: Props) {
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Period"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        padding: 3,
        borderRadius: 999,
        backgroundColor: LIGHT.chipBg,
      }}
    >
      {OPTIONS.map((o) => {
        const active = value === o.value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
            onPress={() => {
              if (active) return;
              hapticSelection();
              onChange(o.value);
            }}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: active ? LIGHT.text : 'transparent',
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: active ? LIGHT.bg : LIGHT.textDim,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
      <View
        accessibilityLabel="Custom range coming soon"
        style={{
          paddingHorizontal: 14,
          paddingVertical: 6,
          borderRadius: 999,
          opacity: 0.5,
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: '600', color: LIGHT.textFaint }}>
          Custom
        </Text>
      </View>
    </View>
  );
}
