// Bill row with swipe affordances.
//   - Swipe-left (reveals from right): Mark paid (accent). Hidden for
//     VIEWER, disabled for PAUSED. Mirrors the spec wording "swipe right →
//     Mark paid" — on Swipeable the primary-action side is the one that
//     tracks the finger leftward.
//   - Swipe-right (reveals from left): Pause/Resume (context) or Archive
//     (ADMIN+). VIEWER: no actions.
// Tap on the face opens the detail route.

import { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Archive, Pause, Play, CircleCheckBig } from 'lucide-react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { Bill, Category } from '@nayanam/core';
import { formatMoney } from '@nayanam/core';
import {
  CATEGORY_COLORS,
  type CategoryColorToken,
  LIGHT,
} from '@nayanam/ui-tokens';
import { hapticLight } from '../../lib/haptics';
import { cycleIconFor } from './icons';
import { cycleEyebrow, daysUntilDue, dueLabel, formatShortDate } from './format';

type Props = {
  bill: Bill;
  category?: Category;
  balancesHidden: boolean;
  canMarkPaid: boolean;
  canPauseResume: boolean;
  canArchive: boolean;
  onOpen: (bill: Bill) => void;
  onMarkPaid: (bill: Bill) => void;
  onPauseResume: (bill: Bill) => void;
  onArchive: (bill: Bill) => void;
  /** Flash the row briefly after timeline-dot → scroll, for visual confirmation. */
  flash?: boolean;
};

const REDACT = '••••••';

function resolveTint(token: string | null | undefined) {
  if (token && token in CATEGORY_COLORS) {
    const c = CATEGORY_COLORS[token as CategoryColorToken];
    return { ink: c.ink, soft: c.soft };
  }
  return { ink: '#3F3F46', soft: '#E4E4E7' };
}

export function SwipeableBillRow({
  bill,
  category,
  balancesHidden,
  canMarkPaid,
  canPauseResume,
  canArchive,
  onOpen,
  onMarkPaid,
  onPauseResume,
  onArchive,
  flash,
}: Props) {
  const revealed = useRef(false);
  const paused = bill.status === 'PAUSED';
  const days = daysUntilDue(bill.nextDueAt);
  const due = paused ? null : dueLabel(days);

  const colorToken = bill.colorToken ?? category?.colorToken ?? null;
  const { ink, soft } = resolveTint(colorToken);
  // For bills, the cycle icon takes precedence over the category icon —
  // bills are fundamentally about cadence, and this matches the prototype.
  const Icon = cycleIconFor(bill.cycle);

  const markPaidEnabled = canMarkPaid && !paused;

  const renderRightActions = () => {
    if (!markPaidEnabled) return null;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Mark ${bill.name} as paid`}
        onPress={() => onMarkPaid(bill)}
        style={{
          width: 96,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#0A84FF',
          flexDirection: 'row',
          gap: 6,
        }}
      >
        <CircleCheckBig size={16} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: '700' }}>Paid</Text>
      </Pressable>
    );
  };

  const renderLeftActions = () => {
    if (!canPauseResume && !canArchive) return null;
    return (
      <View style={{ flexDirection: 'row' }}>
        {canPauseResume ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={paused ? `Resume ${bill.name}` : `Pause ${bill.name}`}
            onPress={() => onPauseResume(bill)}
            style={{
              width: 80,
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: LIGHT.chipBg,
              flexDirection: 'row',
              gap: 4,
            }}
          >
            {paused ? (
              <Play size={14} color={LIGHT.text} />
            ) : (
              <Pause size={14} color={LIGHT.text} />
            )}
            <Text style={{ color: LIGHT.text, fontWeight: '700', fontSize: 12 }}>
              {paused ? 'Resume' : 'Pause'}
            </Text>
          </Pressable>
        ) : null}
        {canArchive ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Archive ${bill.name}`}
            onPress={() => onArchive(bill)}
            style={{
              width: 80,
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: LIGHT.negative,
              flexDirection: 'row',
              gap: 4,
            }}
          >
            <Archive size={14} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
              Archive
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <Swipeable
      friction={2}
      rightThreshold={56}
      leftThreshold={56}
      onSwipeableWillOpen={() => {
        if (!revealed.current) {
          revealed.current = true;
          hapticLight();
        }
      }}
      onSwipeableClose={() => {
        revealed.current = false;
      }}
      renderRightActions={markPaidEnabled ? renderRightActions : undefined}
      renderLeftActions={
        canPauseResume || canArchive ? renderLeftActions : undefined
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${bill.name}, ${
          balancesHidden
            ? 'amount hidden'
            : formatMoney(bill.amountMinor, bill.currencyCode)
        }, ${cycleEyebrow(bill)}${paused ? ', paused' : ''}`}
        onPress={() => onOpen(bill)}
        style={{
          backgroundColor: LIGHT.surface,
          borderWidth: 1,
          borderColor: flash ? '#0A84FF' : LIGHT.border,
          borderRadius: 16,
          padding: 14,
          marginBottom: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            backgroundColor: soft,
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon size={18} color={ink} />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: LIGHT.text,
                flexShrink: 1,
              }}
            >
              {bill.name}
            </Text>
            {paused ? (
              <StatusPill label="Paused" tone="neutral" />
            ) : due?.tone === 'negative' ? (
              <StatusPill label={due.label} tone="negative" />
            ) : null}
          </View>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 11,
              color: LIGHT.textDim,
              marginTop: 2,
              fontFamily: 'Geist Mono',
            }}
          >
            {cycleEyebrow(bill)} · Next {formatShortDate(bill.nextDueAt)}
          </Text>
        </View>

        <View style={{ alignItems: 'flex-end' }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: '700',
              color: LIGHT.text,
              fontFamily: 'Geist Mono',
            }}
          >
            {balancesHidden
              ? REDACT
              : formatMoney(bill.amountMinor, bill.currencyCode)}
          </Text>
          <Text
            style={{
              fontSize: 9,
              color: LIGHT.textFaint,
              marginTop: 2,
              letterSpacing: 0.4,
              fontFamily: 'Geist Mono',
              textTransform: 'uppercase',
            }}
          >
            /mo
          </Text>
        </View>
      </Pressable>
    </Swipeable>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: 'negative' | 'neutral';
}) {
  const bg = tone === 'negative' ? LIGHT.negative + '22' : LIGHT.chipBg;
  const fg = tone === 'negative' ? LIGHT.negative : LIGHT.textDim;
  return (
    <View
      style={{
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 100,
        backgroundColor: bg,
      }}
    >
      <Text
        style={{
          fontSize: 9,
          fontWeight: '700',
          letterSpacing: 0.6,
          color: fg,
          fontFamily: 'Geist Mono',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
    </View>
  );
}
