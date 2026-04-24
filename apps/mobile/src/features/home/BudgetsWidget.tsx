// Home budget widget — Phase 6. Replaces the Phase 4 static placeholder.
//
// States:
//   - Zero active budgets → empty card with primary CTA pushing /budgets.
//   - One or more household-wide budgets → ring + top-3 per-category rows.
//   - Per-category only (no household-wide) → top-3 rows, no ring.
//
// Redacts money when `useHomeStore.balancesHidden` is true (Phase 4 pref).
// Tapping anywhere deep-links to `/budgets` — matches the web widget.

import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import type { BudgetsStatusItemType, Category } from '@nayanam/core';
import { formatMoney } from '@nayanam/core';
import {
  ACCENTS,
  CATEGORY_COLORS,
  type CategoryColorToken,
  LIGHT,
} from '@nayanam/ui-tokens';
import {
  useBudgetsStatus,
  useCategories,
  useHomeStore,
} from '../../lib/hooks';
import { categoryIconFor } from '../categories/icons';
import { HouseholdBudgetIcon } from '../budgets/icons';
import { BudgetProgressBar } from '../budgets/BudgetProgressBar';
import { BudgetRingChart } from '../budgets/BudgetRingChart';
import { progressColor } from '../budgets/format';

const REDACT = '••••••';

export function BudgetsWidget({ canMutate }: { canMutate: boolean }) {
  const router = useRouter();
  const statusQuery = useBudgetsStatus();
  const balancesHidden = useHomeStore((s) => s.balancesHidden);

  const categoriesQuery = useCategories({ includeArchived: true });
  const categoriesById = useMemo(() => {
    const items: Category[] =
      categoriesQuery.data?.pages.flatMap((p) => p.items) ?? [];
    return new Map(items.map((c) => [c.id, c]));
  }, [categoriesQuery.data]);

  const items = statusQuery.data?.items ?? [];
  const householdWide = items.filter((i) => i.budget.scope === 'HOUSEHOLD');
  const categoryItems = items
    .filter((i) => i.budget.scope === 'CATEGORY')
    .slice()
    .sort((a, b) => b.progressPercent - a.progressPercent)
    .slice(0, 3);

  // Loading skeleton — matches placeholder footprint.
  if (statusQuery.isLoading) {
    return (
      <View
        accessibilityLabel="Monthly budget loading"
        style={cardStyle}
      >
        <ActivityIndicator color={LIGHT.textDim} />
      </View>
    );
  }

  // Empty state — both household-wide and per-category are empty.
  if (householdWide.length === 0 && categoryItems.length === 0) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          canMutate
            ? 'Set your first budget'
            : 'Ask an owner to add a budget'
        }
        onPress={() => router.push('/budgets')}
        style={({ pressed }) => [
          cardStyle,
          {
            gap: 10,
            opacity: pressed ? 0.85 : 1,
            alignItems: 'flex-start',
          },
        ]}
      >
        <Text style={{ fontSize: 15, fontWeight: '700', color: LIGHT.text }}>
          Set a monthly ceiling
        </Text>
        <Text style={{ fontSize: 12, color: LIGHT.textDim }}>
          Track spend against a budget and get notified at 50, 80, 100%.
        </Text>
        {canMutate ? (
          <View
            style={{
              marginTop: 4,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: ACCENTS.indigo.hex,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
              Set your first budget
            </Text>
          </View>
        ) : (
          <Text
            style={{
              marginTop: 4,
              fontSize: 11,
              color: LIGHT.textFaint,
              fontFamily: 'Geist Mono',
              letterSpacing: 0.4,
            }}
          >
            ASK AN OWNER
          </Text>
        )}
      </Pressable>
    );
  }

  // Pick the first household-wide budget as the ring subject. Additional
  // currencies are summarised below.
  const primaryRing = householdWide[0];
  const extraCurrencies = householdWide.length - 1;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open budgets"
      onPress={() => router.push('/budgets')}
      style={({ pressed }) => [
        cardStyle,
        { gap: 12, opacity: pressed ? 0.92 : 1 },
      ]}
    >
      {primaryRing ? (
        <RingBlock
          item={primaryRing}
          balancesHidden={balancesHidden}
          extraCurrencies={extraCurrencies > 0 ? extraCurrencies : 0}
        />
      ) : null}

      {categoryItems.length > 0 ? (
        <View style={{ gap: 10, marginTop: primaryRing ? 4 : 0 }}>
          {categoryItems.map((it) => (
            <CategoryRow
              key={it.budget.id}
              item={it}
              category={categoriesById.get(it.budget.categoryId ?? '') ?? null}
              balancesHidden={balancesHidden}
            />
          ))}
        </View>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 2,
          marginTop: 2,
        }}
      >
        <Text
          style={{ color: ACCENTS.indigo.hex, fontSize: 12, fontWeight: '600' }}
        >
          See all
        </Text>
        <ChevronRight size={14} color={ACCENTS.indigo.hex} />
      </View>
    </Pressable>
  );
}

function RingBlock({
  item,
  balancesHidden,
  extraCurrencies,
}: {
  item: BudgetsStatusItemType;
  balancesHidden: boolean;
  extraCurrencies: number;
}) {
  const { budget, progressPercent, spentMinor, effectiveAmountMinor } = item;
  const tint = progressColor(progressPercent);
  const spentLabel = balancesHidden
    ? REDACT
    : formatMoney(spentMinor, budget.currencyCode);
  const amountLabel = balancesHidden
    ? REDACT
    : formatMoney(effectiveAmountMinor, budget.currencyCode);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <BudgetRingChart percent={progressPercent} size={64} thickness={7}>
        <Text
          style={{
            fontSize: 12,
            fontWeight: '700',
            color: LIGHT.text,
            fontFamily: 'Geist Mono',
          }}
        >
          {progressPercent}%
        </Text>
      </BudgetRingChart>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <Text
            numberOfLines={1}
            style={{ fontSize: 13, fontWeight: '700', color: LIGHT.text }}
          >
            {budget.name}
          </Text>
          <Text
            style={{
              fontSize: 10,
              color: tint.fg,
              letterSpacing: 0.4,
              fontFamily: 'Geist Mono',
              textTransform: 'uppercase',
            }}
          >
            {tint.label}
          </Text>
        </View>
        <Text
          style={{
            fontSize: 11,
            color: LIGHT.textDim,
            marginTop: 2,
            fontFamily: 'Geist Mono',
          }}
        >
          {spentLabel} of {amountLabel}
        </Text>
        <View style={{ marginTop: 8 }}>
          <BudgetProgressBar percent={progressPercent} height={5} />
        </View>
        {extraCurrencies > 0 ? (
          <Text
            style={{
              marginTop: 6,
              fontSize: 10,
              color: LIGHT.textFaint,
              fontFamily: 'Geist Mono',
              letterSpacing: 0.3,
            }}
          >
            +{extraCurrencies} more{' '}
            {extraCurrencies === 1 ? 'currency' : 'currencies'}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function CategoryRow({
  item,
  category,
  balancesHidden,
}: {
  item: BudgetsStatusItemType;
  category: Category | null;
  balancesHidden: boolean;
}) {
  const { budget, progressPercent, spentMinor, effectiveAmountMinor } = item;
  const Icon = category ? categoryIconFor(category.iconToken) : HouseholdBudgetIcon;
  const colorToken: CategoryColorToken =
    category?.colorToken && category.colorToken in CATEGORY_COLORS
      ? (category.colorToken as CategoryColorToken)
      : 'graphite';
  const { ink, soft } = CATEGORY_COLORS[colorToken];

  const spentLabel = balancesHidden
    ? REDACT
    : formatMoney(spentMinor, budget.currencyCode);
  const amountLabel = balancesHidden
    ? REDACT
    : formatMoney(effectiveAmountMinor, budget.currencyCode);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
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
      <View style={{ flex: 1, minWidth: 0 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 8,
          }}
        >
          <Text
            numberOfLines={1}
            style={{ fontSize: 12, fontWeight: '600', color: LIGHT.text }}
          >
            {budget.name}
          </Text>
          <Text
            style={{
              fontSize: 10,
              color: LIGHT.textDim,
              fontFamily: 'Geist Mono',
            }}
          >
            {spentLabel} / {amountLabel}
          </Text>
        </View>
        <View style={{ marginTop: 4 }}>
          <BudgetProgressBar percent={progressPercent} height={4} />
        </View>
      </View>
    </View>
  );
}

const cardStyle = {
  marginTop: 14,
  marginHorizontal: 20,
  backgroundColor: LIGHT.surface,
  borderWidth: 1,
  borderColor: LIGHT.border,
  borderRadius: 20,
  padding: 14,
} as const;
