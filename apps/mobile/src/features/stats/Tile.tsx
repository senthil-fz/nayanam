// Small shared surface card that every Stats chart tile sits inside.
// Matches the Phase 4 / 5 / 6 tile pattern (rounded 22, hairline border,
// surface bg) and the web stats' `<section>` wrapper.

import { Text, View } from 'react-native';
import { LIGHT } from '@nayanam/ui-tokens';

type Props = {
  title: string;
  caption?: string;
  /** Accessibility summary of the chart contents for screen readers. */
  accessibilityLabel: string;
  right?: React.ReactNode;
  children: React.ReactNode;
};

export function Tile({ title, caption, accessibilityLabel, right, children }: Props) {
  return (
    <View
      accessible
      accessibilityRole="summary"
      accessibilityLabel={accessibilityLabel}
      style={{
        marginHorizontal: 20,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: LIGHT.border,
        backgroundColor: LIGHT.surface,
        padding: 16,
      }}
    >
      <View
        style={{
          marginBottom: 8,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: '600', color: LIGHT.text }}>
          {title}
        </Text>
        {right ??
          (caption ? (
            <Text
              style={{
                fontFamily: 'Geist Mono',
                fontSize: 10,
                color: LIGHT.textFaint,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
              }}
            >
              {caption}
            </Text>
          ) : null)}
      </View>
      {children}
    </View>
  );
}

export function TileSkeleton({ height }: { height: number }) {
  return (
    <View
      style={{
        height,
        borderRadius: 10,
        backgroundColor: LIGHT.border,
        opacity: 0.6,
      }}
    />
  );
}

export function TileEmpty({
  children,
  height = 120,
}: {
  children: React.ReactNode;
  height?: number;
}) {
  return (
    <View
      style={{
        height,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: 12, color: LIGHT.textDim }}>{children}</Text>
    </View>
  );
}
