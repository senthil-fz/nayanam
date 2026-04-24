// Port of the prototype `TxRow` primitive (components/ui.jsx:108-142).
// - 40px circular icon chip using category color soft/ink
// - 15px/600 label
// - 12px monospace "time · note" eyebrow
// - right-aligned signed amount (15px/600 mono)
// - uppercase 11px mono date cap beneath the amount
//
// Two variants:
//   - Default: the full row used inside the Transactions tab list.
//   - `compact`: drops the right-side day cap; used on Home recent-activity
//     where the day grouping lives on the section header instead.

import { Pressable, Text, View } from 'react-native';
import {
  CATEGORY_COLORS,
  type CategoryColorToken,
} from '@nayanam/ui-tokens';
import type { Category, Transaction, Account } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { categoryIconFor } from '../categories/icons';
import { rowDayCap, rowTime, signedAmount } from './format';

export type TransactionRowProps = {
  transaction: Transaction;
  account?: Account;
  category?: Category;
  /** Whether this row is the destination side of a transfer. */
  isTransferDestination?: boolean;
  /** Show right-aligned day cap (default). Disable for day-grouped lists. */
  showDayCap?: boolean;
  /** Smaller right gutter + no date cap — used on Home's recent-activity tile. */
  compact?: boolean;
  /** "Syncing…" pill rendered at the right edge (offline-queued rows). */
  isSyncing?: boolean;
  onPress?: (t: Transaction) => void;
};

function resolveTint(token: string | undefined | null) {
  if (token && token in CATEGORY_COLORS) {
    const c = CATEGORY_COLORS[token as CategoryColorToken];
    return { ink: c.ink, soft: c.soft };
  }
  return { ink: '#3F3F46', soft: '#E4E4E7' };
}

export function TransactionRow({
  transaction: t,
  account,
  category,
  isTransferDestination,
  showDayCap = true,
  compact,
  isSyncing,
  onPress,
}: TransactionRowProps) {
  const isDeleted = Boolean(t.deletedAt);
  const isTransfer = t.type === 'TRANSFER';
  const iconToken = isTransfer
    ? 'arrow-right-arrow-left'
    : category?.iconToken ?? 'tag';
  const colorToken = isTransfer ? 'graphite' : category?.colorToken ?? 'graphite';
  const { ink, soft } = resolveTint(colorToken);
  const Icon = categoryIconFor(iconToken);

  const amount = signedAmount(t.type, t.amountMinor, t.currencyCode, {
    isTransferDestination,
  });
  const toneColor =
    amount.tone === 'positive'
      ? LIGHT.positive
      : amount.tone === 'negative'
        ? LIGHT.text
        : LIGHT.text;

  const label = isTransfer
    ? isTransferDestination
      ? 'Transfer in'
      : 'Transfer out'
    : category?.label ?? 'Uncategorized';

  const eyebrow = [rowTime(t.occurredAt), t.note?.trim(), account?.nickname]
    .filter(Boolean)
    .join(' · ');

  const a11yAmount = amount.text.replace('−', 'minus ').replace('+', 'plus ');
  const a11yLabel = [
    label,
    a11yAmount,
    category?.label,
    isSyncing ? 'syncing' : undefined,
    isDeleted ? 'deleted' : undefined,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      onPress={onPress ? () => onPress(t) : undefined}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        opacity: isDeleted ? 0.55 : pressed ? 0.85 : 1,
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
        <Text
          numberOfLines={1}
          style={{
            fontSize: 15,
            fontWeight: '600',
            color: LIGHT.text,
            letterSpacing: -0.1,
          }}
        >
          {label}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 12,
            color: LIGHT.textDim,
            marginTop: 2,
            fontFamily: 'Geist Mono',
          }}
        >
          {eyebrow || ' '}
        </Text>
      </View>

      <View
        style={{
          alignItems: 'flex-end',
          flexShrink: 0,
          minWidth: compact ? 72 : 84,
        }}
      >
        <Text
          style={{
            fontSize: 15,
            fontWeight: '600',
            color: toneColor,
            fontFamily: 'Geist Mono',
          }}
          numberOfLines={1}
        >
          {amount.text}
        </Text>
        {isSyncing ? (
          <View
            style={{
              marginTop: 2,
              paddingHorizontal: 6,
              paddingVertical: 1,
              borderRadius: 999,
              backgroundColor: LIGHT.chipBg,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                color: LIGHT.textDim,
                fontFamily: 'Geist Mono',
                letterSpacing: 0.4,
              }}
            >
              SYNCING
            </Text>
          </View>
        ) : !compact && showDayCap ? (
          <Text
            style={{
              fontSize: 11,
              color: LIGHT.textFaint,
              marginTop: 2,
              fontFamily: 'Geist Mono',
              letterSpacing: 0.4,
            }}
          >
            {rowDayCap(t.occurredAt)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
