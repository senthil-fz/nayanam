// Sparkline — react-native-svg polyline + area fill for balance history.
// Matches the prototype's <Sparkline> proportions (96x34 on detail row).

import { View, Text } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

export type SparklineProps = {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  loading?: boolean;
};

export function Sparkline({
  values,
  width = 96,
  height = 34,
  stroke = '#0A84FF',
  fill = 'rgba(10,132,255,0.13)',
  strokeWidth = 2,
  loading = false,
}: SparklineProps) {
  if (loading) return <SparklineSkeleton width={width} height={height} />;
  if (!values.length) {
    return (
      <View style={{ width, height }}>
        <Text style={{ fontSize: 10, color: 'rgba(14,14,16,0.38)' }}>—</Text>
      </View>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / span) * (height - strokeWidth * 2) - strokeWidth;
    return { x, y };
  });

  const line = points
    .map((p, i) => (i === 0 ? `M${p.x} ${p.y}` : `L${p.x} ${p.y}`))
    .join(' ');
  const area = `${line} L${width} ${height} L0 ${height} Z`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={fill} stopOpacity={1} />
          <Stop offset="1" stopColor={fill} stopOpacity={0.1} />
        </SvgGradient>
      </Defs>
      <Path d={area} fill="url(#sparkFill)" />
      <Path d={line} stroke={stroke} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function SparklineSkeleton({ width, height }: { width: number; height: number }) {
  const shimmer = useSharedValue(0);
  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.linear }),
      -1,
      false,
    );
  }, [shimmer]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.35 + shimmer.value * 0.35,
  }));
  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: 6,
          backgroundColor: 'rgba(14,14,16,0.08)',
        },
        style,
      ]}
    />
  );
}
