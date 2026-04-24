// 12-month grouped-pair bars (income accent, expense muted). Ported from
// the web SVG implementation to `react-native-svg`. Max-axis anchored to
// the largest income OR expense in the window so one tall bar doesn't
// squash the rest.

import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';
import type { MonthlyTrendSeriesType } from '@nayanam/core';
import { formatMoney } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { useHomeStore } from '../../lib/hooks';
import { ACCENT_HEX, minorToNumber, shortMonthLabel } from './util';
import { Tile, TileEmpty, TileSkeleton } from './Tile';

type Props = {
  series: MonthlyTrendSeriesType | null;
  loading: boolean;
  errored: boolean;
};

const WIDTH = 300;
const HEIGHT = 160;
const PAD_X = 8;
const PAD_Y = 12;

export function MonthlyTrendChart({ series, loading, errored }: Props) {
  const balancesHidden = useHomeStore((s) => s.balancesHidden);

  const max = useMemo(() => {
    if (!series) return 0;
    let m = 0;
    for (const p of series.points) {
      const inc = minorToNumber(p.incomeMinor);
      const exp = minorToNumber(p.expenseMinor);
      if (inc > m) m = inc;
      if (exp > m) m = exp;
    }
    return m;
  }, [series]);

  const summary = useMemo(() => {
    if (!series || series.points.length === 0) return '';
    const total = series.points.reduce(
      (acc, p) =>
        acc + minorToNumber(p.incomeMinor) + minorToNumber(p.expenseMinor),
      0,
    );
    return `Monthly income and expense, last ${series.points.length} months, ${series.currencyCode}, total activity ${balancesHidden ? 'hidden' : formatMoney(String(total), series.currencyCode)}`;
  }, [series, balancesHidden]);

  return (
    <Tile
      title="12 months"
      caption={series?.currencyCode}
      accessibilityLabel={summary || 'Monthly trend chart'}
    >
      {loading ? (
        <TileSkeleton height={HEIGHT} />
      ) : errored ? (
        <TileEmpty height={HEIGHT}>Could not load monthly trend.</TileEmpty>
      ) : !series || series.points.length === 0 || max === 0 ? (
        <TileEmpty height={HEIGHT}>No data for this window.</TileEmpty>
      ) : (
        <TrendSvg series={series} maxValue={max} />
      )}
    </Tile>
  );
}

function TrendSvg({
  series,
  maxValue,
}: {
  series: MonthlyTrendSeriesType;
  maxValue: number;
}) {
  const n = series.points.length;
  const innerW = WIDTH - PAD_X * 2;
  const innerH = HEIGHT - PAD_Y * 2;
  const slotW = innerW / Math.max(1, n);
  const barW = Math.max(2, slotW * 0.28);
  const midX = (i: number) => PAD_X + slotW * (i + 0.5);
  const safeMax = maxValue > 0 ? maxValue : 1;
  const hFor = (v: number) => (v / safeMax) * innerH;

  return (
    <View>
      <Svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        // Chart content is summarized on the Tile wrapper for screen readers.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {series.points.map((p, i) => {
          const inc = minorToNumber(p.incomeMinor);
          const exp = minorToNumber(p.expenseMinor);
          const x = midX(i);
          const incH = hFor(inc);
          const expH = hFor(exp);
          return (
            <G key={p.month}>
              <Rect
                x={x - barW - 1}
                y={PAD_Y + innerH - incH}
                width={barW}
                height={Math.max(0, incH)}
                rx={2}
                fill={ACCENT_HEX}
                opacity={0.95}
              />
              <Rect
                x={x + 1}
                y={PAD_Y + innerH - expH}
                width={barW}
                height={Math.max(0, expH)}
                rx={2}
                fill={LIGHT.textFaint}
                opacity={0.9}
              />
              <SvgText
                x={x}
                y={HEIGHT - 1}
                textAnchor="middle"
                fontSize={8}
                fill={LIGHT.textFaint}
                fontFamily="Geist Mono"
              >
                {shortMonthLabel(p.month).slice(0, 1)}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}
