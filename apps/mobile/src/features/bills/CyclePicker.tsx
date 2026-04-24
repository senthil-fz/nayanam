// 5-option segmented cycle picker + inline customDays input revealed
// when cycle === 'CUSTOM_DAYS'. Kept standalone so BillFormFields can
// embed it without juggling segmented + input layout.

import { Pressable, Text, TextInput, View } from 'react-native';
import type { BillCycle } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { hapticSelection } from '../../lib/haptics';

const CYCLES: BillCycle[] = [
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'YEARLY',
  'CUSTOM_DAYS',
];

type Props = {
  cycle: BillCycle;
  customDays: string;
  onCycleChange: (cycle: BillCycle) => void;
  onCustomDaysChange: (days: string) => void;
  error?: string;
};

function labelFor(c: BillCycle): string {
  if (c === 'CUSTOM_DAYS') return 'Custom';
  return c.charAt(0) + c.slice(1).toLowerCase();
}

export function CyclePicker({
  cycle,
  customDays,
  onCycleChange,
  onCustomDaysChange,
  error,
}: Props) {
  return (
    <View style={{ gap: 8 }}>
      <View
        accessibilityRole="radiogroup"
        style={{
          flexDirection: 'row',
          gap: 4,
        }}
      >
        {CYCLES.map((c) => {
          const active = cycle === c;
          return (
            <Pressable
              key={c}
              accessibilityRole="radio"
              accessibilityLabel={labelFor(c)}
              accessibilityState={{ selected: active }}
              onPress={() => {
                hapticSelection();
                onCycleChange(c);
              }}
              style={{
                flex: 1,
                paddingVertical: 8,
                paddingHorizontal: 4,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: active ? '#0A84FF' : LIGHT.border,
                backgroundColor: active ? '#E6F0FF' : LIGHT.surface,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color: active ? '#0A84FF' : LIGHT.textDim,
                }}
              >
                {labelFor(c)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {cycle === 'CUSTOM_DAYS' ? (
        <View>
          <Text
            style={{
              fontSize: 11,
              color: LIGHT.textDim,
              fontFamily: 'Geist Mono',
              letterSpacing: 0.4,
              marginBottom: 6,
              textTransform: 'uppercase',
            }}
          >
            Every N days (1–366)
          </Text>
          <TextInput
            accessibilityLabel="Custom days"
            value={customDays}
            onChangeText={(t) => onCustomDaysChange(t.replace(/[^0-9]/g, ''))}
            placeholder="30"
            placeholderTextColor={LIGHT.textFaint}
            keyboardType="numeric"
            style={{
              borderWidth: 1,
              borderColor: LIGHT.border,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 10,
              backgroundColor: LIGHT.surface,
              color: LIGHT.text,
              fontFamily: 'Geist Mono',
            }}
          />
          {error ? (
            <Text style={{ color: LIGHT.negative, fontSize: 11, marginTop: 4 }}>
              {error}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
