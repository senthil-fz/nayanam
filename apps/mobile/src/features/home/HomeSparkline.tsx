// 14-day balance sparkline. react-native-svg polyline with a gradient area
// fill under the curve. Decorative (accessibilityElementsHidden) — the
// numeric balance total carries the information.

import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient as SvgGradient,
  Path,
  Stop,
  Line,
} from 'react-native-svg';
import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

type Point = { balanceMinor: string };

export type HomeSparklineProps = {
  points: Point[] | undefined;
  isLoading?: boolean;
  strokeColor?: string;
  fillColor?: string;
  width?: number;
  height?: number;
};

export function HomeSparkline({
  points,
  isLoading,
  strokeColor = 'rgba(255,255,255,0.95)',
  fillColor = 'rgba(255,255,255,0.25)',
  width = 140,
  height = 40,
}: HomeSparklineProps) {
  const path = useMemo(() => {
    if (!points || points.length < 2) return null;
    const values = points.map((p) => Number(p.balanceMinor));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const padY = 3;
    const innerH = height - padY * 2;
    const stepX = width / (points.length - 1);
    const xys = values.map((v, i) => {
      const x = i * stepX;
      const y = padY + innerH - ((v - min) / range) * innerH;
      return [x, y] as const;
    });
    const line = xys
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
      .join(' ');
    const area = `${line} L${width},${height} L0,${height} Z`;
    return { line, area };
  }, [points, width, height]);

  if (isLoading) return <SparklineShimmer width={width} height={height} />;

  if (!path) {
    // Flat-line empty state (fewer than 2 points).
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Svg width={width} height={height}>
          <Line
            x1={0}
            x2={width}
            y1={height / 2}
            y2={height / 2}
            stroke={strokeColor}
            strokeWidth={1.5}
            strokeDasharray="3 3"
            opacity={0.6}
          />
        </Svg>
      </View>
    );
  }

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={width} height={height}>
        <Defs>
          <SvgGradient id="homeSparkFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={fillColor} stopOpacity={1} />
            <Stop offset="1" stopColor={fillColor} stopOpacity={0} />
          </SvgGradient>
        </Defs>
        <Path d={path.area} fill="url(#homeSparkFill)" />
        <Path
          d={path.line}
          stroke={strokeColor}
          strokeWidth={1.75}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

function SparklineShimmer({ width, height }: { width: number; height: number }) {
  const shimmer = useSharedValue(0);
  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.linear }),
      -1,
      false,
    );
  }, [shimmer]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.3 + shimmer.value * 0.35,
  }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height,
          borderRadius: 6,
          backgroundColor: 'rgba(255,255,255,0.25)',
        },
        style,
      ]}
    />
  );
}
