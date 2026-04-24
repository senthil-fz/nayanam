// Tiny per-category sparkline consumed by TopCategoriesGrid. One <Svg>
// polyline + gradient-fill area. No axis, no labels — the enclosing tile
// carries the label and amount.

import { Text, View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
} from 'react-native-svg';
import type { CategorySparklineItemType } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { colorForToken, minorToNumber } from './util';

const W = 140;
const H = 26;

type Props = {
  item: CategorySparklineItemType | undefined;
  colorToken?: string | null;
};

export function CategorySparkline({ item, colorToken }: Props) {
  if (!item || item.points.length === 0) {
    return (
      <View style={{ height: H, justifyContent: 'center' }}>
        <Text style={{ fontSize: 10, color: LIGHT.textFaint }}>—</Text>
      </View>
    );
  }

  const values = item.points.map((p) => minorToNumber(p.amountMinor));
  const max = Math.max(1, ...values);
  const n = values.length;
  const stepX = W / Math.max(1, n - 1);

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = H - (v / max) * (H - 2) - 1;
    return [x, y] as const;
  });
  const linePath = points.reduce(
    (acc, [x, y], i) =>
      acc + `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)} `,
    '',
  );
  const areaPath = linePath + `L ${W.toFixed(1)} ${H} L 0 ${H} Z`;
  const color = colorForToken(colorToken ?? undefined);
  // Stable-per-category gradient id — keeps `<Svg>` tree diff-friendly.
  const gradId = `spark-${item.categoryId.slice(-8)}`;

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <SvgLinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </SvgLinearGradient>
      </Defs>
      <Path d={areaPath} fill={`url(#${gradId})`} />
      <Path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
