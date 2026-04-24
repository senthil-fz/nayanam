import { View, Text, Pressable } from 'react-native';
import { ACCENTS, LIGHT } from '@nayanam/ui-tokens';
import { PlusIcon } from './icons';

export function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <View className="items-center justify-center px-8 py-12" style={{ minHeight: 380 }}>
      <View
        style={{
          width: 88,
          height: 88,
          borderRadius: 24,
          backgroundColor: ACCENTS.indigo.soft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 18,
        }}
      >
        <PlusIcon size={36} color={ACCENTS.indigo.hex} />
      </View>
      <Text
        style={{
          fontSize: 18,
          fontWeight: '700',
          color: LIGHT.text,
          marginBottom: 6,
          textAlign: 'center',
        }}
      >
        No accounts yet
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: LIGHT.textDim,
          textAlign: 'center',
          lineHeight: 20,
          marginBottom: 20,
        }}
      >
        Add your first account to start tracking balances, bills and spending
        across your household.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add account"
        onPress={onAdd}
        style={({ pressed }) => ({
          backgroundColor: ACCENTS.indigo.hex,
          paddingHorizontal: 20,
          paddingVertical: 12,
          borderRadius: 999,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600', letterSpacing: 0.2 }}>
          Add account
        </Text>
      </Pressable>
    </View>
  );
}
