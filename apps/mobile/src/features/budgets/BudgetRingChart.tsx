// SVG ring chart — solid track + stroke-dashoffset arc for progress,
// with a gradient fill on the active arc. Mirrors the prototype `Ring`
// component in `~/Downloads/Expense manager/components/ui.jsx` while
// adopting the same colour-coded tint the BudgetProgressBar uses.

import { View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgGradient,
  Stop,
} from 'react-native-svg';
import { progressColor } from './format';

type Props = {
  percent: number;
  size?: number;
  thickness?: number;
  /** Rendered inside the ring — caller composes percent / label. */
  children?: React.ReactNode;
  /** Override the colour-coded tint (e.g. to match the prototype accent). */
  colorOverride?: string;
};

export function BudgetRingChart({
  percent,
  size = 72,
  thickness = 8,
  children,
  colorOverride,
}: Props) {
  const tint = progressColor(percent);
  const color = colorOverride ?? tint.fg;
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  const dashOffset = circumference * (1 - clamped / 100);
  const gradientId = `budget-ring-${size}-${thickness}`;

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg
        width={size}
        height={size}
        // Rotate so the arc starts from the top (12 o'clock).
        style={{ position: 'absolute' }}
      >
        <Defs>
          <SvgGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={1} />
            <Stop offset="1" stopColor={color} stopOpacity={0.7} />
          </SvgGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={tint.track}
          strokeWidth={thickness}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#${gradientId})`}
          strokeWidth={thickness}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}
