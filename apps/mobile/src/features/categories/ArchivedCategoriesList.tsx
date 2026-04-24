// Compact list of archived household categories with a Restore button per
// row. System rows never archive so this list is always household-scoped.

import { Pressable, Text, View } from 'react-native';
import type { Category } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { useRestoreCategory } from '../../lib/hooks';
import { hapticSuccess } from '../../lib/haptics';
import { CategoryChip } from './CategoryChip';

export function ArchivedCategoriesList({ items }: { items: Category[] }) {
  if (items.length === 0) {
    return (
      <Text style={{ color: LIGHT.textDim, paddingHorizontal: 20, paddingVertical: 8 }}>
        No archived categories.
      </Text>
    );
  }
  return (
    <View>
      {items.map((c) => (
        <ArchivedRow key={c.id} category={c} />
      ))}
    </View>
  );
}

function ArchivedRow({ category }: { category: Category }) {
  const restore = useRestoreCategory(category.id);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 20,
        paddingVertical: 10,
        opacity: 0.7,
      }}
    >
      <CategoryChip iconToken={category.iconToken} colorToken={category.colorToken} size={32} />
      <Text style={{ flex: 1, fontSize: 15, color: LIGHT.text }}>{category.label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Restore ${category.label}`}
        disabled={restore.isPending}
        onPress={async () => {
          await restore.mutateAsync({});
          hapticSuccess();
        }}
        style={{
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: LIGHT.chipBg,
        }}
      >
        <Text style={{ color: LIGHT.text, fontSize: 13, fontWeight: '600' }}>
          {restore.isPending ? 'Restoring…' : 'Restore'}
        </Text>
      </Pressable>
    </View>
  );
}
