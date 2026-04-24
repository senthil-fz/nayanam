// Tiny SVG polyline sparkline used in the selected-card summary.
// Accepts balance-minor values as strings (wire format) and normalizes
// them into the plot area. Flat lines render as a centered horizontal line.

type SparklineProps = {
  values: string[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  className?: string;
  /** When true, render a skeleton shimmer block instead of the line. */
  loading?: boolean;
};

export function Sparkline({
  values,
  width = 120,
  height = 40,
  strokeWidth = 2,
  className,
  loading = false,
}: SparklineProps) {
  if (loading) {
    return (
      <div
        className={'animate-pulse rounded-md bg-[var(--color-border)] ' + (className ?? '')}
        style={{ width, height }}
        aria-hidden
      />
    );
  }
  if (!values.length) {
    return (
      <svg width={width} height={height} className={className} aria-hidden>
        <line
          x1={0}
          x2={width}
          y1={height / 2}
          y2={height / 2}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeOpacity={0.3}
        />
      </svg>
    );
  }

  const nums = values.map((v) => Number(v));
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;

  const points = nums
    .map((n, i) => {
      const x = i * stepX;
      // invert so higher values are higher on screen
      const y = height - ((n - min) / span) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  const last = nums[nums.length - 1] ?? 0;
  const first = nums[0] ?? 0;
  const positive = last >= first;

  return (
    <svg
      width={width}
      height={height}
      className={className}
      role="img"
      aria-label="Balance trend"
    >
      <polyline
        fill="none"
        stroke={positive ? 'var(--color-positive)' : 'var(--color-negative)'}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}
