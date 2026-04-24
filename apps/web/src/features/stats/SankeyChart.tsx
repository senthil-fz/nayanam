// Sankey flow chart. Delegates geometry to the shared pure helper
// `layoutSankey` in packages/core so web + mobile render identical layouts.

import { useMemo } from 'react';
import type { SankeyResponseType } from '@nayanam/core';
import { formatMoney, layoutSankey } from '@nayanam/core';
import { colorForToken } from './util';

type Props = {
  data: SankeyResponseType | null;
  loading: boolean;
  errored: boolean;
  period: string;
};

const WIDTH = 320;
const HEIGHT = 260;
const PADDING = 14;

export function SankeyChart({ data, loading, errored, period }: Props) {
  const result = useMemo(() => {
    if (!data) return null;
    return layoutSankey(data.nodes, data.links, {
      width: WIDTH,
      height: HEIGHT,
      padding: PADDING,
      nodeWidth: 10,
      nodeGap: 6,
    });
  }, [data]);

  return (
    <section
      role="img"
      aria-label={
        data
          ? `Money flow for ${data.currencyCode}, ${data.nodes.length} nodes, ${data.links.length} links`
          : 'Money flow chart'
      }
      className="rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Where money goes · <span className="text-[var(--color-text-dim)]">{period}</span>
        </h2>
        {data ? (
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
            {data.currencyCode}
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="h-[260px] animate-pulse rounded-lg bg-[var(--color-border)]" />
      ) : errored ? (
        <EmptyBanner>Could not load flow chart.</EmptyBanner>
      ) : !data || !result || result.nodes.length === 0 ? (
        <EmptyBanner>No flow in this period.</EmptyBanner>
      ) : (
        <SankeySvg data={data} result={result} />
      )}
    </section>
  );
}

function EmptyBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[200px] items-center justify-center text-xs text-[var(--color-text-dim)]">
      {children}
    </div>
  );
}

function SankeySvg({
  data,
  result,
}: {
  data: SankeyResponseType;
  result: NonNullable<ReturnType<typeof layoutSankey>>;
}) {
  // Left column = income; right column = everything else. Used for the
  // text-anchor on labels (right-align left column, left-align right).
  const isLeft = (kind: string) => kind === 'income';

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height={HEIGHT}>
      {/* links first so nodes render over them */}
      <g>
        {result.links.map((link, i) => (
          <path
            key={`${link.sourceId}-${link.targetId}-${i}`}
            d={link.path}
            stroke={colorForToken(link.sourceColorToken ?? undefined)}
            strokeOpacity={0.35}
            strokeWidth={link.strokeWidth}
            fill="none"
            strokeLinecap="butt"
          >
            <title>
              {link.sourceId} → {link.targetId} ·{' '}
              {formatMoney(link.amountMinor, data.currencyCode)}
            </title>
          </path>
        ))}
      </g>
      <g>
        {result.nodes.map((node) => {
          const fill = colorForToken(node.colorToken ?? undefined);
          const left = isLeft(node.kind);
          const textX = left ? node.x - 4 : node.x + node.width + 4;
          return (
            <g key={node.id}>
              <rect
                x={node.x}
                y={node.y}
                width={node.width}
                height={Math.max(1, node.height)}
                rx={3}
                fill={fill}
              />
              <text
                x={textX}
                y={node.y + node.height / 2 + 3}
                textAnchor={left ? 'end' : 'start'}
                fontSize={9}
                fill="var(--color-text)"
                style={{ fontFamily: '-apple-system, system-ui, sans-serif' }}
              >
                {node.label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
