// Tiny SVG polyline + gradient area under the curve. Consumes
// `/stats/category-sparkline` data for a single category. The orchestrator
// fetches all sparklines in one request and passes the matching item in.

import type { CategorySparklineItemType } from '@nayanam/core';
import { colorForToken, minorToNumber } from './util';

const W = 140;
const H = 28;

export function CategorySparkline({
  item,
  colorToken,
}: {
  item: CategorySparklineItemType | undefined;
  colorToken?: string | null;
}) {
  if (!item || item.points.length === 0) {
    return <div className="h-[28px] w-full" aria-hidden />;
  }

  const values = item.points.map((p) => minorToNumber(p.amountMinor));
  const max = Math.max(1, ...values);
  const stepX = W / Math.max(1, values.length - 1);

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = H - (v / max) * (H - 2) - 1;
    return [x, y] as const;
  });
  const linePath = points.reduce(
    (acc, [x, y], i) => acc + `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)} `,
    '',
  );
  const areaPath =
    linePath + `L ${W.toFixed(1)} ${H} L 0 ${H} Z`;

  const color = colorForToken(colorToken ?? undefined);
  const gradId = `spark-${item.categoryId.slice(-8)}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}
