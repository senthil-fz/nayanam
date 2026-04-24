// Budget list row. Icon chip + name + period eyebrow + progress bar +
// optional status pill. Tap → detail; long-press → actions sheet.

import { Pressable, Text, View } from 'react-native';
import type { BudgetsStatusItemType, Category } from '@nayanam/core';
import { formatMoney } from '@nayanam/core';
import {
  CATEGORY_COLORS,
  type CategoryColorToken,
  LIGHT,
} from '@nayanam/ui-tokens';
import { categoryIconFor } from '../categories/icons';
import { hapticSelection } from '../../lib/haptics';
import { HouseholdBudgetIcon } from './icons';
import { BudgetProgressBar } from './BudgetProgressBar';
import { periodLabel, progressColor } from './format';

const REDACT = '••••••';

type Props = {
  item: BudgetsStatusItemType;
  category: Category | null;
  balancesHidden: boolean;
  onPress: (item: BudgetsStatusItemType) => void;
  onLongPress: (item: BudgetsStatusItemType) => void;
  /** Expose a drag handler when the parent is in reorder mode. */
  onDragStart?: () => void;
  dragActive?: boolean;
};

export function BudgetRow({
  item,
  category,
  balancesHidden,
  onPress,
  onLongPress,
  onDragStart,
  dragActive,
}: Props) {
  const { budget, progressPercent, spentMinor, effectiveAmountMinor } = item;
  const tint = progressColor(progressPercent);
  const paused = budget.status === 'PAUSED';

  const isHousehold = budget.scope === 'HOUSEHOLD';
  const Icon = isHousehold
    ? HouseholdBudgetIcon
    : category
      ? categoryIconFor(category.iconToken)
      : HouseholdBudgetIcon;
  const colorToken: CategoryColorToken =
    !isHousehold &&
    category?.colorToken &&
    category.colorToken in CATEGORY_COLORS
      ? (category.colorToken as CategoryColorToken)
      : 'indigo';
  const { ink, soft } = CATEGORY_COLORS[colorToken];

  const spentLabel = balancesHidden
    ? REDACT
    : formatMoney(spentMinor, budget.currencyCode);
  const amountLabel = balancesHidden
    ? REDACT
    : formatMoney(effectiveAmountMinor, budget.currencyCode);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${budget.name}, ${progressPercent}% used, ${tint.label}`}
      onPress={() => onPress(item)}
      onLongPress={() => {
        hapticSelection();
        if (onDragStart) {
          onDragStart();
        } else {
          onLongPress(item);
        }
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: dragActive
          ? LIGHT.chipBg
          : pressed
            ? LIGHT.chipBg
            : 'transparent',
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: soft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={18} color={ink} />
      </View>

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
            style={{ fontSize: 15, fontWeight: '700', color: LIGHT.text }}
          >
            {budget.name}
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: LIGHT.textDim,
              fontFamily: 'Geist Mono',
            }}
          >
            {spentLabel} / {amountLabel}
          </Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginTop: 2,
          }}
        >
          <Text
            style={{
              fontSize: 10,
              color: LIGHT.textFaint,
              fontFamily: 'Geist Mono',
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            {periodLabel(budget.period)} · {budget.currencyCode}
            {budget.rollover ? ' · ROLLOVER' : ''}
          </Text>
          {paused ? <Pill label="PAUSED" tone="dim" /> : null}
          <View style={{ flex: 1 }} />
          <Text
            style={{
              fontSize: 10,
              color: tint.fg,
              fontFamily: 'Geist Mono',
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            {progressPercent}% · {tint.label}
          </Text>
        </View>

        <View style={{ marginTop: 8 }}>
          <BudgetProgressBar percent={progressPercent} height={5} />
        </View>
      </View>
    </Pressable>
  );
}

function Pill({ label, tone }: { label: string; tone: 'dim' | 'warn' }) {
  const bg = tone === 'warn' ? 'rgba(217,119,6,0.14)' : LIGHT.chipBg;
  const fg = tone === 'warn' ? '#D97706' : LIGHT.textDim;
  return (
    <View
      style={{
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        backgroundColor: bg,
      }}
    >
      <Text
        style={{
          fontSize: 9,
          fontFamily: 'Geist Mono',
          letterSpacing: 0.4,
          color: fg,
          fontWeight: '700',
        }}
      >
        {label}
      </Text>
    </View>
  );
}
