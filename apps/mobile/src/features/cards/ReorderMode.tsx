// ReorderMode — vertical draggable list over the carousel when long-press
// selects "Reorder". Uses react-native-draggable-flatlist and commits via
// useReorderAccounts on Save.

import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import type { components } from '@nayanam/contracts';
import { ACCENTS, LIGHT } from '@nayanam/ui-tokens';
import { formatMoney } from '@nayanam/core';
import { useReorderAccounts } from '../../lib/hooks';
import { hapticMedium, hapticSuccess } from '../../lib/haptics';

type Account = components['schemas']['Account'];

export function ReorderMode({
  accounts,
  onDone,
}: {
  accounts: Account[];
  onDone: () => void;
}) {
  const [order, setOrder] = useState<Account[]>(accounts);
  const reorder = useReorderAccounts();

  return (
    <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: '700', color: LIGHT.text }}>Reorder cards</Text>
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel reorder"
            onPress={onDone}
          >
            <Text style={{ color: LIGHT.textDim, fontWeight: '600' }}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save new order"
            onPress={async () => {
              await reorder.mutateAsync({
                order: order.map((a, i) => ({ id: a.id, displayOrder: i })),
              });
              hapticSuccess();
              onDone();
            }}
          >
            <Text style={{ color: ACCENTS.indigo.hex, fontWeight: '700' }}>Save</Text>
          </Pressable>
        </View>
      </View>
      <DraggableFlatList
        data={order}
        keyExtractor={(a) => a.id}
        onDragBegin={() => hapticMedium()}
        onDragEnd={({ data }) => setOrder(data)}
        renderItem={({ item, drag, isActive }) => (
          <ScaleDecorator>
            <Pressable
              onLongPress={drag}
              accessibilityRole="button"
              accessibilityLabel={`Drag to reorder ${item.nickname}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 14,
                marginBottom: 8,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: isActive ? ACCENTS.indigo.hex : LIGHT.border,
                backgroundColor: isActive ? ACCENTS.indigo.soft : LIGHT.surface,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: LIGHT.text }}>
                  {item.nickname}
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    color: LIGHT.textDim,
                    marginTop: 2,
                    fontFamily: 'Geist Mono',
                  }}
                >
                  {item.type} · {formatMoney(item.cachedBalanceMinor, item.currencyCode)}
                </Text>
              </View>
              <Text style={{ color: LIGHT.textFaint, fontSize: 18 }}>≡</Text>
            </Pressable>
          </ScaleDecorator>
        )}
      />
    </View>
  );
}
