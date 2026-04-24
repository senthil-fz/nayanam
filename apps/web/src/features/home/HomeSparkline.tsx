// 14-day balance sparkline. SVG polyline with gradient fill under the curve.
// Decorative — aria-hidden. Numeric conveyance is handled by the balance total.

import { useId, useMemo } from 'react';

type Point = { balanceMinor: string };

type Props = {
  points: Point[] | undefined;
  isLoading?: boolean;
  /** Stroke + fill color. Defaults to white-on-gradient (inside the hero). */
  strokeColor?: string;
  fillColor?: string;
  width?: number;
  height?: number;
  className?: string;
};

export function HomeSparkline({
  points,
  isLoading,
  strokeColor = 'rgba(255,255,255,0.95)',
  fillColor = 'rgba(255,255,255,0.25)',
  width = 160,
  height = 44,
  className,
}: Props) {
  const gradId = useId();

  const path = useMemo(() => {
    if (!points || points.length === 0) return null;
    const values = points.map((p) => Number(p.balanceMinor));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    // 2px padding so strokes don't clip.
    const padY = 3;
    const innerH = height - padY * 2;
    const stepX = points.length > 1 ? width / (points.length - 1) : width;
    const xys = values.map((v, i) => {
      const x = i * stepX;
      const y = padY + innerH - ((v - min) / range) * innerH;
      return [x, y] as const;
    });
    const line = xys.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
    const area = `${line} L${width},${height} L0,${height} Z`;
    return { line, area };
  }, [points, width, height]);

  if (isLoading) {
    return (
      <div
        aria-hidden
        className={
          (className ?? '') +
          ' h-11 w-[160px] animate-pulse rounded-md bg-white/20'
        }
      />
    );
  }

  if (!path || (points && points.length < 2)) {
    // Flat-line empty state.
    return (
      <svg
        aria-hidden
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={className}
      >
        <line
          x1={0}
          x2={width}
          y1={height / 2}
          y2={height / 2}
          stroke={strokeColor}
          strokeWidth={1.5}
          strokeDasharray="3 3"
          opacity={0.6}
        />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillColor} stopOpacity={1} />
          <stop offset="100%" stopColor={fillColor} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={path.area} fill={`url(#${gradId})`} />
      <path
        d={path.line}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
