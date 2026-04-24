// Filter chips for the notification center: All / Bills / Budgets / Transactions.
// `All` maps to `undefined` (the API filter is absent).

import { Pressable, ScrollView, Text } from 'react-native';
import type { NotificationCategory } from '@nayanam/core';
import { ACCENTS, LIGHT } from '@nayanam/ui-tokens';
import { hapticSelection } from '../../lib/haptics';

export type CategoryFilter = NotificationCategory | undefined;

const OPTIONS: Array<{ label: string; value: CategoryFilter }> = [
  { label: 'All', value: undefined },
  { label: 'Bills', value: 'bill' },
  { label: 'Budgets', value: 'budget' },
  { label: 'Transactions', value: 'transaction' },
];

type Props = {
  value: CategoryFilter;
  onChange: (v: CategoryFilter) => void;
};

export function NotificationFilterChips({ value, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingBottom: 8,
        gap: 6,
        flexDirection: 'row',
      }}
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${opt.label} filter`}
            onPress={() => {
              hapticSelection();
              onChange(opt.value);
            }}
            style={({ pressed }) => ({
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: active ? ACCENTS.indigo.hex : LIGHT.border,
              backgroundColor: active
                ? ACCENTS.indigo.hex + '14'
                : 'transparent',
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '500',
                color: active ? ACCENTS.indigo.hex : LIGHT.textDim,
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
