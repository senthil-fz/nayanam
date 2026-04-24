// Segmented-control: All | Income | Expenses | Transfers. Owns its own
// styling to stay close to the prototype's pill segment and match the
// Phase 2 AddAccountSheet TypeSegmented look.

import { Pressable, Text, View } from 'react-native';
import { LIGHT } from '@nayanam/ui-tokens';

export type TypeFilterValue = 'ALL' | 'INCOME' | 'EXPENSE' | 'TRANSFER';

export const TYPE_OPTIONS: { value: TypeFilterValue; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'INCOME', label: 'Income' },
  { value: 'EXPENSE', label: 'Expenses' },
  { value: 'TRANSFER', label: 'Transfers' },
];

export function TypeSegmented({
  value,
  onChange,
}: {
  value: TypeFilterValue;
  onChange: (v: TypeFilterValue) => void;
}) {
  return (
    <View
      style={{
        marginHorizontal: 20,
        backgroundColor: LIGHT.chipBg,
        borderRadius: 999,
        padding: 4,
        flexDirection: 'row',
      }}
    >
      {TYPE_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="button"
            accessibilityLabel={`${opt.label} filter${active ? ', selected' : ''}`}
            onPress={() => onChange(opt.value)}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 999,
              alignItems: 'center',
              backgroundColor: active ? LIGHT.surface : 'transparent',
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: active ? LIGHT.text : LIGHT.textDim,
                letterSpacing: 0.2,
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
