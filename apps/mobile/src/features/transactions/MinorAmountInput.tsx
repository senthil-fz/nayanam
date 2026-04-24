// Decimal input bound to a positive integer minor-units string.
// Mirrors the helper used inside AddAccountSheet but for POSITIVE-ONLY
// amounts (transactions never carry a sign; type drives the sign).

import { useEffect, useRef, useState } from 'react';
import { TextInput, Text, View } from 'react-native';
import { LIGHT } from '@nayanam/ui-tokens';

function minorDigits(code: string): number {
  if (['JPY', 'KRW', 'VND', 'IDR', 'CLP'].includes(code)) return 0;
  return 2;
}

function minorToDisplay(minor: string, code: string): string {
  if (!minor) return '';
  const n = Number(minor) / 10 ** minorDigits(code);
  if (!Number.isFinite(n)) return '';
  return minorDigits(code) === 0 ? `${Math.trunc(n)}` : n.toFixed(minorDigits(code));
}

function displayToMinor(display: string, code: string): string {
  if (!display || display === '.') return '0';
  const n = Number(display);
  if (!Number.isFinite(n) || n < 0) return '0';
  return Math.round(n * 10 ** minorDigits(code)).toString();
}

export function MinorAmountInput({
  value,
  onChange,
  currencyCode,
  placeholder = '0.00',
}: {
  value: string;
  onChange: (v: string) => void;
  currencyCode: string;
  placeholder?: string;
}) {
  const [display, setDisplay] = useState(() => minorToDisplay(value, currencyCode));

  // Re-format when the bound currency changes (e.g. after account swap).
  // We intentionally read `value` through a ref so typing doesn't re-render
  // partial input ("12.") into its normalized form ("12.00"); the effect
  // only fires on currency changes, which are a legitimate reason to
  // re-display the canonical form.
  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => {
    setDisplay(minorToDisplay(valueRef.current, currencyCode));
  }, [currencyCode]);

  const handle = (t: string) => {
    const cleaned = t.replace(/[^0-9.]/g, '');
    setDisplay(cleaned);
    onChange(displayToMinor(cleaned, currencyCode));
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderWidth: 1,
        borderColor: LIGHT.border,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: LIGHT.surface,
      }}
    >
      <Text style={{ fontSize: 13, color: LIGHT.textFaint, fontFamily: 'Geist Mono' }}>
        {currencyCode}
      </Text>
      <TextInput
        value={display}
        onChangeText={handle}
        placeholder={placeholder}
        placeholderTextColor={LIGHT.textFaint}
        keyboardType="decimal-pad"
        style={{
          flex: 1,
          fontSize: 17,
          color: LIGHT.text,
          fontFamily: 'Geist Mono',
          padding: 0,
        }}
      />
    </View>
  );
}
