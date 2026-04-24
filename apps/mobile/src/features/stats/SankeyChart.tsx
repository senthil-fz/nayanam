// Sankey flow chart. Geometry delegated to the shared pure helper
// `layoutSankey` in `packages/core/src/stats/sankey-layout.ts` — web +
// mobile produce identical layouts from the same API response. This
// component only renders the result with `react-native-svg`.
//
// Width comes from the enclosing layout via onLayout so the chart
// scales on small vs large devices (phones vs tablets) without forcing
// a fixed viewport.

import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { G, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { SankeyResponseType } from '@nayanam/core';
import { formatMoney, layoutSankey } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { useHomeStore } from '../../lib/hooks';
import { colorForToken } from './util';
import { Tile, TileEmpty, TileSkeleton } from './Tile';

type Props = {
  data: SankeyResponseType | null;
  loading: boolean;
  errored: boolean;
  period: string;
};

const HEIGHT = 260;
const PADDING = 16;

export function SankeyChart({ data, loading, errored, period }: Props) {
  const balancesHidden = useHomeStore((s) => s.balancesHidden);
  const [containerWidth, setContainerWidth] = useState(0);

  const result = useMemo(() => {
    if (!data || containerWidth <= 0) return null;
    return layoutSankey(data.nodes, data.links, {
      width: containerWidth,
      height: HEIGHT,
      padding: PADDING,
      nodeWidth: 10,
      nodeGap: 6,
    });
  }, [data, containerWidth]);

  const label = data
    ? `Money flow for ${data.currencyCode}, ${data.nodes.length} nodes, ${data.links.length} links, period ${period}`
    : 'Money flow chart';

  return (
    <Tile
      title={`Where money goes · ${period}`}
      caption={data?.currencyCode}
      accessibilityLabel={label}
    >
      <View
        onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        style={{ width: '100%' }}
      >
        {loading ? (
          <TileSkeleton height={HEIGHT} />
        ) : errored ? (
          <TileEmpty height={HEIGHT}>Could not load flow chart.</TileEmpty>
        ) : !data || !result || result.nodes.length === 0 ? (
          <TileEmpty height={HEIGHT}>No flow in this period.</TileEmpty>
        ) : (
          <SankeySvg
            data={data}
            width={containerWidth}
            result={result}
            balancesHidden={balancesHidden}
          />
        )}
      </View>
    </Tile>
  );
}

function SankeySvg({
  data,
  width,
  result,
  balancesHidden,
}: {
  data: SankeyResponseType;
  width: number;
  result: ReturnType<typeof layoutSankey>;
  balancesHidden: boolean;
}) {
  const isLeft = (kind: string) => kind === 'income';

  return (
    <View>
      <Svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`}>
        <G>
          {result.links.map((link, i) => (
            <Path
              key={`${link.sourceId}-${link.targetId}-${i}`}
              d={link.path}
              stroke={colorForToken(link.sourceColorToken ?? undefined)}
              strokeOpacity={0.35}
              strokeWidth={link.strokeWidth}
              fill="none"
              strokeLinecap="butt"
            />
          ))}
        </G>
        <G>
          {result.nodes.map((node) => {
            const fill = colorForToken(node.colorToken ?? undefined);
            const left = isLeft(node.kind);
            const textX = left ? node.x - 4 : node.x + node.width + 4;
            return (
              <G key={node.id}>
                <Rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={Math.max(1, node.height)}
                  rx={3}
                  fill={fill}
                />
                <SvgText
                  x={textX}
                  y={node.y + node.height / 2 + 3}
                  textAnchor={left ? 'end' : 'start'}
                  fontSize={9}
                  fill={LIGHT.text}
                >
                  {node.label}
                </SvgText>
              </G>
            );
          })}
        </G>
      </Svg>
      {/* A compact amount readout under the chart for screen readers and
          sighted users on small devices. Sum each link once per side. */}
      {!balancesHidden ? (
        <Text
          style={{
            marginTop: 6,
            fontFamily: 'Geist Mono',
            fontSize: 10,
            color: LIGHT.textFaint,
            letterSpacing: 0.4,
            textAlign: 'center',
          }}
        >
          {formatMoney(
            String(
              data.links.reduce((acc, l) => acc + Number(l.amountMinor), 0),
            ),
            data.currencyCode,
          )}{' '}
          total flow
        </Text>
      ) : null}
    </View>
  );
}
