// Horizontal chip row for the Transactions tab filters. Tapping a chip opens
// its owning bottom sheet; the currently-applied filter is summarized in the
// chip label.

import { Pressable, ScrollView, Text, View } from 'react-native';
import { LIGHT } from '@nayanam/ui-tokens';

type ChipProps = {
  label: string;
  value?: string | null;
  active?: boolean;
  onPress: () => void;
  onClear?: () => void;
};

function Chip({ label, value, active, onPress, onClear }: ChipProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} filter${value ? `: ${value}` : ''}`}
        onPress={onPress}
        style={({ pressed }) => ({
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: active ? LIGHT.text : LIGHT.border,
          backgroundColor: active ? LIGHT.text : pressed ? LIGHT.chipBg : LIGHT.surface,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        })}
      >
        <Text
          style={{
            fontSize: 12,
            color: active ? LIGHT.bg : LIGHT.text,
            fontWeight: '600',
            letterSpacing: 0.2,
          }}
        >
          {value ?? label}
        </Text>
      </Pressable>
      {active && onClear ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Clear ${label} filter`}
          onPress={onClear}
          style={{
            marginLeft: -8,
            paddingHorizontal: 8,
            paddingVertical: 4,
          }}
          hitSlop={8}
        >
          <Text style={{ color: LIGHT.textDim, fontSize: 12 }}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export type FilterChipsProps = {
  accountLabel: string | null;
  categoryLabel: string | null;
  dateLabel: string | null;
  onAccountPress: () => void;
  onCategoryPress: () => void;
  onDatePress: () => void;
  onClearAccount: () => void;
  onClearCategory: () => void;
  onClearDate: () => void;
};

export function FilterChips(props: FilterChipsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingVertical: 8 }}
    >
      <Chip
        label="Account"
        value={props.accountLabel}
        active={Boolean(props.accountLabel)}
        onPress={props.onAccountPress}
        onClear={props.onClearAccount}
      />
      <Chip
        label="Category"
        value={props.categoryLabel}
        active={Boolean(props.categoryLabel)}
        onPress={props.onCategoryPress}
        onClear={props.onClearCategory}
      />
      <Chip
        label="Date"
        value={props.dateLabel}
        active={Boolean(props.dateLabel)}
        onPress={props.onDatePress}
        onClear={props.onClearDate}
      />
    </ScrollView>
  );
}
