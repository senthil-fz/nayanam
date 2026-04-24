// Horizontally-scrolling filter chips: All / Due soon / Active / Paused.
// Matches the prototype pill chips (selected chip swaps fg/bg to text/bg).

import { Pressable, ScrollView, Text } from 'react-native';
import type { BillsListFilter } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { hapticSelection } from '../../lib/haptics';

type Props = {
  value: BillsListFilter;
  onChange: (next: BillsListFilter) => void;
};

const CHIPS: Array<{ key: BillsListFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'due-soon', label: 'Due soon' },
  { key: 'active', label: 'Active' },
  { key: 'paused', label: 'Paused' },
];

export function BillsFilterChips({ value, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 6,
        gap: 6,
      }}
    >
      {CHIPS.map((c) => {
        const active = c.key === value;
        return (
          <Pressable
            key={c.key}
            accessibilityRole="button"
            accessibilityLabel={`Filter: ${c.label}${active ? ', selected' : ''}`}
            accessibilityState={{ selected: active }}
            onPress={() => {
              hapticSelection();
              onChange(c.key);
            }}
            style={{
              paddingVertical: 7,
              paddingHorizontal: 12,
              borderRadius: 100,
              backgroundColor: active ? LIGHT.text : LIGHT.chipBg,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: active ? LIGHT.bg : LIGHT.text,
              }}
            >
              {c.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
