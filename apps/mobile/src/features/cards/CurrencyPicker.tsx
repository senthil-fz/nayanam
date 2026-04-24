// Native modal list for currency selection, backed by the shared allowlist.

import { Modal, View, Text, Pressable, FlatList } from 'react-native';
import { SUPPORTED_CURRENCY_CODES } from '@nayanam/core';
import { ACCENTS, LIGHT } from '@nayanam/ui-tokens';

export function CurrencyPicker({
  visible,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  value: string;
  onChange: (code: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: LIGHT.bg, paddingTop: 60 }}>
        <View
          style={{
            paddingHorizontal: 20,
            paddingBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text style={{ fontSize: 20, fontWeight: '700', color: LIGHT.text }}>
            Currency
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={{ padding: 6 }}
          >
            <Text style={{ color: ACCENTS.indigo.hex, fontWeight: '600', fontSize: 15 }}>
              Done
            </Text>
          </Pressable>
        </View>
        <FlatList
          data={SUPPORTED_CURRENCY_CODES}
          keyExtractor={(c) => c}
          renderItem={({ item }) => {
            const selected = item === value;
            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => {
                  onChange(item);
                  onClose();
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 20,
                  paddingVertical: 14,
                  borderBottomWidth: 0.5,
                  borderBottomColor: LIGHT.border,
                  backgroundColor: selected ? ACCENTS.indigo.soft : 'transparent',
                }}
              >
                <Text style={{ fontSize: 16, color: LIGHT.text, fontFamily: 'Geist Mono' }}>
                  {item}
                </Text>
                {selected && (
                  <Text style={{ color: ACCENTS.indigo.hex, fontWeight: '700' }}>
                    ✓
                  </Text>
                )}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}
