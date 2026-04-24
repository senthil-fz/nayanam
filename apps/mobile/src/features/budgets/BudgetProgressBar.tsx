// Horizontal progress bar with green/yellow/red tint. Shared by the Home
// widget, row, and detail sheet.

import { View } from 'react-native';
import { progressColor } from './format';

type Props = {
  /** Clamped to [0, 100] internally for the bar length. */
  percent: number;
  height?: number;
  trackColor?: string;
  fillColor?: string;
};

export function BudgetProgressBar({
  percent,
  height = 6,
  trackColor,
  fillColor,
}: Props) {
  const tint = progressColor(percent);
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        height,
        borderRadius: height / 2,
        backgroundColor: trackColor ?? tint.track,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          height: '100%',
          width: `${clamped}%`,
          borderRadius: height / 2,
          backgroundColor: fillColor ?? tint.fg,
        }}
      />
    </View>
  );
}
