// Draggable reorder mode for household categories. System rows cannot be
// reordered (spec §reorder rejects system ids) so they never enter this
// list. The parent component filters before passing `items` in.

import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import DraggableFlatList, {
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import type { Category, ReorderCategoriesInputType } from '@nayanam/core';
import { ACCENTS, LIGHT } from '@nayanam/ui-tokens';
import { useReorderCategories } from '../../lib/hooks';
import { hapticError, hapticSelection, hapticSuccess } from '../../lib/haptics';
import { logWarn } from '../../lib/log';
import { CategoryChip } from './CategoryChip';

export function ReorderCategoriesMode({
  items,
  onDone,
}: {
  items: Category[];
  onDone: () => void;
}) {
  const [data, setData] = useState(items);
  const reorder = useReorderCategories();

  // Keep state in sync when upstream re-sorts (e.g. after save).
  useEffect(() => setData(items), [items]);

  const save = async () => {
    try {
      const body: ReorderCategoriesInputType = {
        order: data.map((c, i) => ({ id: c.id, displayOrder: i })),
      };
      await reorder.mutateAsync(body);
      hapticSuccess();
      onDone();
    } catch (err) {
      hapticError();
      logWarn('Reorder failed', err);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingVertical: 10,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel reorder"
          onPress={onDone}
        >
          <Text style={{ color: LIGHT.textDim, fontSize: 15 }}>Cancel</Text>
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '700', color: LIGHT.text }}>Reorder</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save order"
          disabled={reorder.isPending}
          onPress={save}
        >
          <Text style={{ color: ACCENTS.indigo.hex, fontSize: 15, fontWeight: '700' }}>
            {reorder.isPending ? 'Saving…' : 'Save'}
          </Text>
        </Pressable>
      </View>

      <DraggableFlatList
        data={data}
        keyExtractor={(c) => c.id}
        onDragBegin={() => hapticSelection()}
        onDragEnd={({ data: next }) => setData(next)}
        renderItem={({ item, drag, isActive }: RenderItemParams<Category>) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Drag ${item.label}`}
            onLongPress={drag}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingHorizontal: 20,
              paddingVertical: 10,
              backgroundColor: isActive ? LIGHT.chipBg : 'transparent',
            }}
          >
            <CategoryChip
              iconToken={item.iconToken}
              colorToken={item.colorToken}
              size={32}
            />
            <Text style={{ flex: 1, color: LIGHT.text, fontSize: 15, fontWeight: '600' }}>
              {item.label}
            </Text>
            <Text style={{ color: LIGHT.textFaint, fontSize: 18 }}>⋮⋮</Text>
          </Pressable>
        )}
      />
    </View>
  );
}
