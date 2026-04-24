// Bottom-sheet category picker. Filters to a single type (INCOME|EXPENSE)
// when given; always hides TRANSFER system rows (`transfer_system`) and
// archived rows from the selection list.

import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { CATEGORY_COLORS, type CategoryColorToken, LIGHT } from '@nayanam/ui-tokens';
import type { Category } from '@nayanam/core';
import { useCategories } from '../../lib/hooks';
import { categoryIconFor } from '../categories/icons';
import { hapticSelection } from '../../lib/haptics';

export type CategoryPickerSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

type Props = {
  typeFilter?: 'INCOME' | 'EXPENSE';
  selectedId?: string | null;
  onSelect: (category: Category) => void;
};

export const CategoryPickerSheet = forwardRef<CategoryPickerSheetHandle, Props>(
  function CategoryPickerSheet({ typeFilter, selectedId, onSelect }, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const snapPoints = useMemo(() => ['75%'], []);

    useImperativeHandle(ref, () => ({
      present: () => sheetRef.current?.present(),
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const query = useCategories({ type: typeFilter, includeArchived: false });
    const items = useMemo<Category[]>(() => {
      const all = query.data?.pages.flatMap((p) => p.items) ?? [];
      return all.filter(
        (c) => c.type !== 'TRANSFER' && !c.archivedAt,
      );
    }, [query.data]);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.35}
        />
      ),
      [],
    );

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: LIGHT.bg }}
        handleIndicatorStyle={{ backgroundColor: LIGHT.border }}
      >
        <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: LIGHT.text }}>
            Choose category
          </Text>
        </View>
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <CategoryRow
              category={item}
              selected={item.id === selectedId}
              onPress={() => {
                hapticSelection();
                onSelect(item);
                sheetRef.current?.dismiss();
              }}
            />
          )}
          ListEmptyComponent={
            <Text
              style={{
                padding: 20,
                color: LIGHT.textDim,
                textAlign: 'center',
              }}
            >
              {query.isLoading ? 'Loading…' : 'No categories'}
            </Text>
          }
        />
      </BottomSheetModal>
    );
  },
);

function CategoryRow({
  category,
  selected,
  onPress,
}: {
  category: Category;
  selected: boolean;
  onPress: () => void;
}) {
  const Icon = categoryIconFor(category.iconToken);
  const colorToken = (category.colorToken as CategoryColorToken) in CATEGORY_COLORS
    ? (category.colorToken as CategoryColorToken)
    : 'graphite';
  const { ink, soft } = CATEGORY_COLORS[colorToken];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Category ${category.label}${selected ? ', selected' : ''}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 8,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: selected ? LIGHT.chipBg : pressed ? LIGHT.chipBg : 'transparent',
      })}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: soft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={16} color={ink} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: LIGHT.text }}>
          {category.label}
        </Text>
        <Text
          style={{
            fontSize: 11,
            color: LIGHT.textFaint,
            fontFamily: 'Geist Mono',
            letterSpacing: 0.4,
            marginTop: 2,
          }}
        >
          {category.type}
          {category.householdId === null ? ' · SYSTEM' : ''}
        </Text>
      </View>
    </Pressable>
  );
}
