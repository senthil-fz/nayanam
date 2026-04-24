// Daily-spend heatmap — calendar-style grid (15 columns × ~6 rows for
// 90 days). Intensity = amount / intensityCapMinor clamped to [0,1],
// mapped to an alpha ramp of the theme accent. Tap a cell → Light
// haptic + tooltip overlay with date, amount, and tx count. Tap any
// other cell (or tap the tooltip dismiss button) to swap targets.
//
// Summary strip (Peak day / No-spend / Avg per day) is computed
// client-side from the points — the reduced contract does not ship
// those pre-computed aggregates.

import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { DailySpendPointType, DailySpendSeriesType } from '@nayanam/core';
import { formatMoney } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { useHomeStore } from '../../lib/hooks';
import { hapticLight } from '../../lib/haptics';
import {
  ACCENT_HEX,
  minorToNumber,
  shortDateLabel,
  withAlpha,
} from './util';
import { Tile, TileEmpty, TileSkeleton } from './Tile';

type Props = {
  series: DailySpendSeriesType | null;
  loading: boolean;
  errored: boolean;
};

const COLS = 15;
const GAP = 3;

export function DailySpendHeatmap({ series, loading, errored }: Props) {
  const balancesHidden = useHomeStore((s) => s.balancesHidden);
  const [focusedDate, setFocusedDate] = useState<string | null>(null);

  const stats = useMemo(() => {
    if (!series || series.points.length === 0) return null;
    let total = 0;
    let nonZeroDays = 0;
    let peakAmount = 0;
    let peakDate = '';
    for (const p of series.points) {
      const v = minorToNumber(p.amountMinor);
      total += v;
      if (v > 0) nonZeroDays += 1;
      if (v > peakAmount) {
        peakAmount = v;
        peakDate = p.date;
      }
    }
    const noSpendDays = series.points.length - nonZeroDays;
    const avg = Math.round(total / series.points.length);
    return { total, noSpendDays, peakAmount, peakDate, avg };
  }, [series]);

  const focused =
    focusedDate && series
      ? series.points.find((p) => p.date === focusedDate) ?? null
      : null;

  const labelSummary =
    stats && series
      ? `Daily spend heatmap, ${series.points.length} days, total ${balancesHidden ? 'hidden' : formatMoney(String(stats.total), series.currencyCode)}, peak ${stats.peakDate ? `${shortDateLabel(stats.peakDate)} at ${balancesHidden ? 'hidden' : formatMoney(String(stats.peakAmount), series.currencyCode)}` : 'none'}, ${stats.noSpendDays} no-spend days`
      : 'Daily spend heatmap';

  return (
    <Tile
      title="Daily spend"
      caption={series ? `${series.points.length}d · ${series.currencyCode}` : undefined}
      accessibilityLabel={labelSummary}
    >
      {loading ? (
        <TileSkeleton height={160} />
      ) : errored ? (
        <TileEmpty height={140}>Could not load heatmap.</TileEmpty>
      ) : !series || series.points.length === 0 || !stats ? (
        <TileEmpty height={140}>No activity in this window.</TileEmpty>
      ) : (
        <>
          <HeatmapGrid
            series={series}
            focusedDate={focusedDate}
            onFocus={(d) => {
              hapticLight();
              setFocusedDate(d === focusedDate ? null : d);
            }}
          />

          {focused ? (
            <FocusTooltip
              point={focused}
              currencyCode={series.currencyCode}
              balancesHidden={balancesHidden}
              onDismiss={() => setFocusedDate(null)}
            />
          ) : null}

          <View
            style={{
              marginTop: 12,
              flexDirection: 'row',
              justifyContent: 'space-between',
              borderRadius: 12,
              backgroundColor: LIGHT.chipBg,
              paddingHorizontal: 12,
              paddingVertical: 10,
              gap: 8,
            }}
          >
            <SummaryCell
              label="Peak day"
              value={
                stats.peakAmount > 0
                  ? balancesHidden
                    ? '••••••'
                    : `${shortDateLabel(stats.peakDate)} · ${formatMoney(
                        String(stats.peakAmount),
                        series.currencyCode,
                      )}`
                  : '—'
              }
            />
            <View style={{ width: 1, backgroundColor: LIGHT.border }} />
            <SummaryCell
              label="No-spend"
              value={`${stats.noSpendDays} ${stats.noSpendDays === 1 ? 'day' : 'days'}`}
            />
            <View style={{ width: 1, backgroundColor: LIGHT.border }} />
            <SummaryCell
              label="Avg / day"
              value={
                balancesHidden
                  ? '••••••'
                  : formatMoney(String(stats.avg), series.currencyCode)
              }
            />
          </View>
        </>
      )}
    </Tile>
  );
}

function HeatmapGrid({
  series,
  focusedDate,
  onFocus,
}: {
  series: DailySpendSeriesType;
  focusedDate: string | null;
  onFocus: (date: string) => void;
}) {
  const cap = Math.max(1, minorToNumber(series.intensityCapMinor));
  return (
    <View
      accessible
      accessibilityLabel={`Heatmap grid, ${series.points.length} days. Tap a cell for details.`}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginHorizontal: -GAP / 2,
      }}
    >
      {series.points.map((p) => {
        const v = minorToNumber(p.amountMinor);
        const intensity = Math.min(1, v / cap);
        const alpha = v === 0 ? 0.05 : 0.18 + intensity * 0.82;
        const active = focusedDate === p.date;
        return (
          <Cell
            key={p.date}
            point={p}
            active={active}
            alpha={alpha}
            onPress={() => onFocus(p.date)}
          />
        );
      })}
    </View>
  );
}

function Cell({
  point,
  active,
  alpha,
  onPress,
}: {
  point: DailySpendPointType;
  active: boolean;
  alpha: number;
  onPress: () => void;
}) {
  // 15 columns with small gaps; each cell is a flex basis of ~6.66%.
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${point.date}, ${point.transactionCount} transactions`}
      onPress={onPress}
      style={{
        width: `${100 / COLS}%`,
        padding: GAP / 2,
      }}
    >
      <View
        style={{
          aspectRatio: 1,
          borderRadius: 4,
          backgroundColor: withAlpha(ACCENT_HEX, alpha),
          borderWidth: active ? 1.5 : 0,
          borderColor: active ? LIGHT.text : 'transparent',
        }}
      />
    </Pressable>
  );
}

function FocusTooltip({
  point,
  currencyCode,
  balancesHidden,
  onDismiss,
}: {
  point: DailySpendPointType;
  currencyCode: string;
  balancesHidden: boolean;
  onDismiss: () => void;
}) {
  const amount = balancesHidden
    ? '••••••'
    : formatMoney(point.amountMinor, currencyCode);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Dismiss. ${shortDateLabel(point.date)}, ${amount}, ${point.transactionCount} transactions`}
      onPress={onDismiss}
      style={{
        marginTop: 10,
        borderRadius: 10,
        backgroundColor: LIGHT.text,
        paddingHorizontal: 12,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <View>
        <Text
          style={{
            fontFamily: 'Geist Mono',
            fontSize: 10,
            color: 'rgba(245,245,246,0.7)',
            letterSpacing: 0.6,
            textTransform: 'uppercase',
          }}
        >
          {shortDateLabel(point.date)}
        </Text>
        <Text
          style={{
            fontSize: 13,
            fontWeight: '700',
            color: LIGHT.bg,
            fontFamily: 'Geist Mono',
          }}
        >
          {amount}
        </Text>
      </View>
      <Text
        style={{
          fontFamily: 'Geist Mono',
          fontSize: 11,
          color: 'rgba(245,245,246,0.7)',
        }}
      >
        {point.transactionCount} tx · tap to close
      </Text>
    </Pressable>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text
        style={{
          fontFamily: 'Geist Mono',
          fontSize: 9,
          color: LIGHT.textFaint,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          marginTop: 2,
          fontSize: 12,
          fontWeight: '700',
          color: LIGHT.text,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
