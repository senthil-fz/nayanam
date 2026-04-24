// Horizontal scroller of suggestion chips derived from trailing-30d spend
// for EXPENSE categories without an active budget in the household's
// default currency. Tapping a chip opens the AddBudgetSheet prefilled.

import { useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import type { BudgetSuggestionType, Category } from '@nayanam/core';
import { formatMoney } from '@nayanam/core';
import {
  CATEGORY_COLORS,
  type CategoryColorToken,
  LIGHT,
} from '@nayanam/ui-tokens';
import { useBudgetsSuggest, useCategories } from '../../lib/hooks';
import { categoryIconFor } from '../categories/icons';
import { hapticLight } from '../../lib/haptics';

type Props = {
  onPick: (args: {
    category: Category;
    suggestion: BudgetSuggestionType;
  }) => void;
};

export function BudgetsSuggestionsRow({ onPick }: Props) {
  const query = useBudgetsSuggest();
  const categoriesQuery = useCategories({ includeArchived: true });

  const categoriesById = useMemo(() => {
    const items: Category[] =
      categoriesQuery.data?.pages.flatMap((p) => p.items) ?? [];
    return new Map(items.map((c) => [c.id, c]));
  }, [categoriesQuery.data]);

  const items = query.data?.items ?? [];
  if (items.length === 0) return null;

  return (
    <View style={{ marginTop: 8 }}>
      <Text
        style={{
          paddingHorizontal: 20,
          paddingBottom: 8,
          color: LIGHT.textFaint,
          fontFamily: 'Geist Mono',
          letterSpacing: 0.4,
          fontSize: 11,
          textTransform: 'uppercase',
        }}
      >
        Quick add
      </Text>
      <FlatList
        data={items}
        horizontal
        keyExtractor={(s) => s.categoryId}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        renderItem={({ item }) => {
          const category = categoriesById.get(item.categoryId) ?? null;
          return (
            <SuggestionChip
              suggestion={item}
              category={category}
              onPress={() => {
                hapticLight();
                if (category) onPick({ category, suggestion: item });
              }}
            />
          );
        }}
      />
    </View>
  );
}

function SuggestionChip({
  suggestion,
  category,
  onPress,
}: {
  suggestion: BudgetSuggestionType;
  category: Category | null;
  onPress: () => void;
}) {
  const Icon = category
    ? categoryIconFor(category.iconToken)
    : categoryIconFor('tag');
  const colorToken: CategoryColorToken =
    category?.colorToken && category.colorToken in CATEGORY_COLORS
      ? (category.colorToken as CategoryColorToken)
      : 'indigo';
  const { ink, soft } = CATEGORY_COLORS[colorToken];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Quick add budget for ${suggestion.categoryName}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 16,
        backgroundColor: LIGHT.surface,
        borderWidth: 1,
        borderColor: LIGHT.border,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: soft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={14} color={ink} />
      </View>
      <View>
        <Text style={{ fontSize: 13, fontWeight: '600', color: LIGHT.text }}>
          {suggestion.categoryName}
        </Text>
        <Text
          style={{
            fontSize: 11,
            color: LIGHT.textDim,
            fontFamily: 'Geist Mono',
            marginTop: 1,
          }}
        >
          {formatMoney(suggestion.suggestedAmountMinor, suggestion.currencyCode)}
          {' / mo'}
        </Text>
      </View>
    </Pressable>
  );
}
