// 6-digit PIN keypad primitive — rendered dots + 3x4 button grid. Used by
// PinSetupSheet, PinChangeSheet, PinForgotSheet, and the UnlockGate's
// PinEntryScreen. Pure presentational + controlled value.

import { Pressable, Text, View } from 'react-native';
import { Delete } from 'lucide-react-native';
import { LIGHT } from '@nayanam/ui-tokens';
import { hapticLight } from '../../../lib/haptics';
import { useAppearance } from '../../../lib/appearance';

export type PinKeypadProps = {
  value: string;
  onChange: (next: string) => void;
  label?: string;
  error?: string;
  accentHexOverride?: string;
};

const KEYS: string[] = [
  '1', '2', '3',
  '4', '5', '6',
  '7', '8', '9',
  '', '0', 'backspace',
];

export function PinKeypad({
  value,
  onChange,
  label,
  error,
  accentHexOverride,
}: PinKeypadProps) {
  const appearance = useAppearance();
  const accent = accentHexOverride ?? appearance.accentHex;

  const push = (digit: string) => {
    if (value.length >= 6) return;
    hapticLight();
    onChange(value + digit);
  };
  const back = () => {
    if (value.length === 0) return;
    hapticLight();
    onChange(value.slice(0, -1));
  };

  return (
    <View style={{ gap: 20 }}>
      {label ? (
        <Text
          style={{
            textAlign: 'center',
            fontSize: 13,
            color: LIGHT.textDim,
            fontWeight: '500',
          }}
        >
          {label}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 14,
        }}
      >
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const filled = i < value.length;
          return (
            <View
              key={i}
              style={{
                width: 14,
                height: 14,
                borderRadius: 7,
                borderWidth: 2,
                borderColor: filled ? accent : LIGHT.border,
                backgroundColor: filled ? accent : 'transparent',
              }}
            />
          );
        })}
      </View>
      {error ? (
        <Text
          style={{
            textAlign: 'center',
            color: LIGHT.negative,
            fontSize: 12,
            fontWeight: '500',
          }}
        >
          {error}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          maxWidth: 300,
          alignSelf: 'center',
        }}
      >
        {KEYS.map((k, i) => {
          const disabled = k === '' || (k === 'backspace' && value.length === 0);
          const testID =
            k === 'backspace'
              ? 'pin-keypad-backspace'
              : k === ''
                ? undefined
                : `pin-keypad-digit-${k}`;
          return (
            <Pressable
              key={`${k}-${String(i)}`}
              testID={testID}
              accessibilityRole="button"
              accessibilityLabel={
                k === 'backspace' ? 'Delete' : k === '' ? 'Empty' : `Digit ${k}`
              }
              disabled={disabled || k === ''}
              onPress={() => {
                if (k === 'backspace') back();
                else if (k !== '') push(k);
              }}
              style={({ pressed }) => ({
                width: '33.33%',
                aspectRatio: 1.4,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: disabled ? 0.3 : 1,
                backgroundColor: pressed ? LIGHT.chipBg : 'transparent',
                borderRadius: 12,
              })}
            >
              {k === 'backspace' ? (
                <Delete size={22} color={LIGHT.text} />
              ) : (
                <Text
                  style={{
                    fontSize: 28,
                    fontWeight: '500',
                    color: LIGHT.text,
                  }}
                >
                  {k}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
