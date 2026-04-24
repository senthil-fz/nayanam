// Category breakdown donut + 2-col legend below. Uses a dim-on-tap model
// (tap a slice/legend row to dim the others) instead of the web hover,
// since touch surfaces don't have hover. Tap outside / tap the same
// slice again clears the focus.
//
// Toggle pill above the chart switches between EXPENSE / INCOME; the
// orchestrator owns the state and passes in both the current value and
// the setter.

import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import type {
  CategoryBreakdownCurrencyBucketType,
  CategoryBreakdownItemType,
} from '@nayanam/core';
import { formatMoney } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { useHomeStore } from '../../lib/hooks';
import { hapticSelection } from '../../lib/haptics';
import { colorForToken, minorToNumber } from './util';
import { Tile, TileEmpty, TileSkeleton } from './Tile';

type Props = {
  bucket: CategoryBreakdownCurrencyBucketType | null;
  loading: boolean;
  errored: boolean;
  type: 'EXPENSE' | 'INCOME';
  onTypeChange: (t: 'EXPENSE' | 'INCOME') => void;
};

const SIZE = 200;
const THICKNESS = 26;
const RADIUS = SIZE / 2 - THICKNESS / 2;

export function CategoryDonut({
  bucket,
  loading,
  errored,
  type,
  onTypeChange,
}: Props) {
  const balancesHidden = useHomeStore((s) => s.balancesHidden);
  const [focusId, setFocusId] = useState<string | null>(null);

  const label = bucket
    ? `Category breakdown, ${type.toLowerCase()}, total ${balancesHidden ? 'hidden' : formatMoney(bucket.totalMinor, bucket.currencyCode)}`
    : 'Category breakdown';

  return (
    <Tile
      title="By category"
      accessibilityLabel={label}
      right={<TypeToggle value={type} onChange={onTypeChange} />}
    >
      {loading ? (
        <TileSkeleton height={230} />
      ) : errored ? (
        <TileEmpty height={200}>Could not load breakdown.</TileEmpty>
      ) : !bucket || bucket.items.length === 0 ? (
        <TileEmpty height={200}>No activity in this period.</TileEmpty>
      ) : (
        <>
          <DonutSvg
            bucket={bucket}
            focusId={focusId}
            onFocus={setFocusId}
            balancesHidden={balancesHidden}
          />
          <Legend
            bucket={bucket}
            focusId={focusId}
            onFocus={setFocusId}
            balancesHidden={balancesHidden}
          />
        </>
      )}
    </Tile>
  );
}

function TypeToggle({
  value,
  onChange,
}: {
  value: 'EXPENSE' | 'INCOME';
  onChange: (v: 'EXPENSE' | 'INCOME') => void;
}) {
  const opts: Array<{ v: 'EXPENSE' | 'INCOME'; label: string }> = [
    { v: 'EXPENSE', label: 'Expenses' },
    { v: 'INCOME', label: 'Income' },
  ];
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Category type"
      style={{
        flexDirection: 'row',
        borderRadius: 999,
        padding: 2,
        backgroundColor: LIGHT.chipBg,
      }}
    >
      {opts.map((o) => {
        const active = value === o.v;
        return (
          <Pressable
            key={o.v}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
            onPress={() => {
              if (active) return;
              hapticSelection();
              onChange(o.v);
            }}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: active ? LIGHT.text : 'transparent',
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: '700',
                color: active ? LIGHT.bg : LIGHT.textDim,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function DonutSvg({
  bucket,
  focusId,
  onFocus,
  balancesHidden,
}: {
  bucket: CategoryBreakdownCurrencyBucketType;
  focusId: string | null;
  onFocus: (id: string | null) => void;
  balancesHidden: boolean;
}) {
  const total = minorToNumber(bucket.totalMinor);
  if (total <= 0) return null;

  const START = -Math.PI / 2;
  const shares = bucket.items.map(
    (item) => minorToNumber(item.amountMinor) / total,
  );
  const prefix = shares.map((_, i) =>
    shares.slice(0, i + 1).reduce((a, b) => a + b, 0),
  );
  const arcs = bucket.items.map((item, i) => {
    const prev = i === 0 ? 0 : (prefix[i - 1] ?? 0);
    const curr = prefix[i] ?? prev;
    const start = START + prev * Math.PI * 2;
    const end = START + curr * Math.PI * 2;
    return { item, start, end };
  });

  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const totalText = balancesHidden
    ? '••••••'
    : formatMoney(bucket.totalMinor, bucket.currencyCode);

  return (
    <View style={{ alignItems: 'center' }}>
      <Pressable
        onPress={() => {
          if (focusId) onFocus(null);
        }}
        accessibilityLabel="Donut chart. Tap slices to focus."
        style={{ width: SIZE, height: SIZE }}
      >
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <Circle
            cx={cx}
            cy={cy}
            r={RADIUS}
            fill="none"
            stroke={LIGHT.border}
            strokeWidth={THICKNESS}
            opacity={0.45}
          />
          {arcs.map((a) => {
            const active = focusId === null || focusId === a.item.categoryId;
            const x1 = cx + Math.cos(a.start) * RADIUS;
            const y1 = cy + Math.sin(a.start) * RADIUS;
            const x2 = cx + Math.cos(a.end) * RADIUS;
            const y2 = cy + Math.sin(a.end) * RADIUS;
            const largeArc = a.end - a.start > Math.PI ? 1 : 0;
            const d = `M ${x1} ${y1} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${x2} ${y2}`;
            return (
              <Path
                key={a.item.categoryId}
                d={d}
                fill="none"
                stroke={colorForToken(a.item.colorToken ?? undefined)}
                strokeWidth={THICKNESS}
                strokeLinecap="butt"
                opacity={active ? 1 : 0.35}
              />
            );
          })}
          <SvgText
            x={cx}
            y={cy - 4}
            textAnchor="middle"
            fontSize={10}
            fill={LIGHT.textFaint}
            fontFamily="Geist Mono"
          >
            TOTAL
          </SvgText>
          <SvgText
            x={cx}
            y={cy + 14}
            textAnchor="middle"
            fontSize={15}
            fontWeight="700"
            fill={LIGHT.text}
          >
            {totalText}
          </SvgText>
        </Svg>
      </Pressable>
    </View>
  );
}

function Legend({
  bucket,
  focusId,
  onFocus,
  balancesHidden,
}: {
  bucket: CategoryBreakdownCurrencyBucketType;
  focusId: string | null;
  onFocus: (id: string | null) => void;
  balancesHidden: boolean;
}) {
  return (
    <View
      style={{
        marginTop: 12,
        flexDirection: 'row',
        flexWrap: 'wrap',
      }}
    >
      {bucket.items.map((it: CategoryBreakdownItemType) => {
        const active = focusId === null || focusId === it.categoryId;
        const amount = balancesHidden
          ? '••••••'
          : formatMoney(it.amountMinor, bucket.currencyCode);
        return (
          <Pressable
            key={it.categoryId}
            accessibilityRole="button"
            accessibilityLabel={`${it.label}, ${amount}, ${it.percentOfTotal}% of total`}
            onPress={() => {
              hapticSelection();
              onFocus(focusId === it.categoryId ? null : it.categoryId);
            }}
            style={{
              width: '50%',
              paddingVertical: 6,
              paddingRight: 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              opacity: active ? 1 : 0.4,
            }}
          >
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                backgroundColor: colorForToken(it.colorToken ?? undefined),
              }}
            />
            <View style={{ flex: 1 }}>
              <Text
                numberOfLines={1}
                style={{ fontSize: 12, fontWeight: '600', color: LIGHT.text }}
              >
                {it.label}
              </Text>
              <Text
                style={{
                  fontSize: 10,
                  color: LIGHT.textDim,
                  fontFamily: 'Geist Mono',
                }}
              >
                {amount} · {it.percentOfTotal}%
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
