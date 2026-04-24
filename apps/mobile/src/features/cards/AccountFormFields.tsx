// Shared form fields for Add / Edit account sheets. Kept in one file so the
// two sheets stay in visual lockstep.

import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ACCENTS,
  ACCOUNT_COLORS,
  ACCOUNT_COLOR_TOKENS,
  ACCOUNT_ICONS,
  ACCOUNT_ICON_TOKENS,
  LIGHT,
} from '@nayanam/ui-tokens';
import { AccountIcon, LockIcon } from './icons';

export type AccountTypeValue = 'DEBIT' | 'CREDIT' | 'SAVINGS' | 'CASH';

const TYPES: { value: AccountTypeValue; label: string }[] = [
  { value: 'DEBIT', label: 'Debit' },
  { value: 'CREDIT', label: 'Credit' },
  { value: 'SAVINGS', label: 'Savings' },
  { value: 'CASH', label: 'Cash' },
];

export function LabeledField({
  label,
  helper,
  locked,
  children,
}: {
  label: string;
  helper?: string;
  locked?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Text style={{ fontSize: 11, fontWeight: '600', color: LIGHT.textDim, letterSpacing: 0.6, fontFamily: 'Geist Mono' }}>
          {label.toUpperCase()}
        </Text>
        {locked && <LockIcon size={12} color={LIGHT.textFaint} strokeWidth={1.5} />}
      </View>
      {children}
      {helper && (
        <Text style={{ fontSize: 11, color: LIGHT.textFaint, marginTop: 4 }}>
          {helper}
        </Text>
      )}
    </View>
  );
}

export function InputField({
  value,
  onChange,
  placeholder,
  keyboardType,
  maxLength,
  disabled,
  autoCapitalize,
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad' | 'number-pad' | 'email-address';
  maxLength?: number;
  disabled?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={LIGHT.textFaint}
      editable={!disabled}
      keyboardType={keyboardType}
      maxLength={maxLength}
      autoCapitalize={autoCapitalize}
      style={{
        borderWidth: 1,
        borderColor: LIGHT.border,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        color: disabled ? LIGHT.textDim : LIGHT.text,
        backgroundColor: disabled ? LIGHT.chipBg : LIGHT.surface,
      }}
    />
  );
}

export function TypeSegmented({
  value,
  onChange,
  disabled,
}: {
  value: AccountTypeValue;
  onChange: (v: AccountTypeValue) => void;
  disabled?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: LIGHT.chipBg,
        padding: 3,
        borderRadius: 999,
      }}
    >
      {TYPES.map((t) => {
        const active = value === t.value;
        return (
          <Pressable
            key={t.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, disabled }}
            disabled={disabled}
            onPress={() => onChange(t.value)}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: active ? LIGHT.surface : 'transparent',
              alignItems: 'center',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: active ? LIGHT.text : LIGHT.textDim,
                letterSpacing: 0.2,
              }}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ColorChipRow({
  value,
  onChange,
}: {
  value: string;
  onChange: (token: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
    >
      {ACCOUNT_COLOR_TOKENS.map((token) => {
        const { from, to, name } = ACCOUNT_COLORS[token];
        const selected = value === token;
        return (
          <Pressable
            key={token}
            accessibilityRole="button"
            accessibilityLabel={`${name} color`}
            accessibilityState={{ selected }}
            onPress={() => onChange(token)}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              borderWidth: selected ? 2 : 0,
              borderColor: selected ? ACCENTS.indigo.hex : 'transparent',
              padding: selected ? 2 : 0,
            }}
          >
            <LinearGradient
              colors={[from, to]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ flex: 1, borderRadius: 999 }}
            />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function IconChipRow({
  value,
  onChange,
}: {
  value: string;
  onChange: (token: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
    >
      {ACCOUNT_ICON_TOKENS.map((token) => {
        const selected = value === token;
        return (
          <Pressable
            key={token}
            accessibilityRole="button"
            accessibilityLabel={`${ACCOUNT_ICONS[token].name} icon`}
            accessibilityState={{ selected }}
            onPress={() => onChange(token)}
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: selected ? ACCENTS.indigo.hex : LIGHT.border,
              backgroundColor: selected ? ACCENTS.indigo.soft : LIGHT.surface,
            }}
          >
            <AccountIcon token={token} size={20} color={selected ? ACCENTS.indigo.hex : LIGHT.text} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
