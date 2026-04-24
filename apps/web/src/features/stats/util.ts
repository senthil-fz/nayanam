// Small helpers private to the Stats feature. Not promoted to
// `packages/core` because they're all display-only formatters and color
// lookups specific to web theming.

import type { StatsPeriodKind } from '@nayanam/core';

/** Label used in copy like "Net this {period}". */
export function periodLabel(p: StatsPeriodKind): string {
  switch (p) {
    case 'week':
      return 'week';
    case 'month':
      return 'month';
    case 'year':
      return 'year';
    case 'custom':
      return 'period';
  }
}

/** Short eyebrow label ("THIS WEEK" / "THIS MONTH" / etc). */
export function periodEyebrow(p: StatsPeriodKind): string {
  return `NET THIS ${p === 'custom' ? 'PERIOD' : p.toUpperCase()}`;
}

/**
 * Parse a minor-units decimal string as a JS number. Safe for every
 * real-world household balance; if we ever need bigint math here we'd
 * swap it in.
 */
export function minorToNumber(s: string): number {
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Map a Nayanam color token (from `packages/ui-tokens`) to a CSS color.
 * Stats reuses the category/account color palette defined in tokens. Since
 * `ui-tokens` exposes colors as CSS variables, we map the color *token*
 * (e.g. `"emerald"`) to its matching `var(--color-cat-emerald)` css-var.
 *
 * Fallback: the theme accent.
 */
export function colorForToken(token?: string | null): string {
  if (!token) return 'var(--color-accent)';
  // The design tokens are exposed as `--color-cat-<token>` CSS variables.
  // If a future token set doesn't include a given name, `var(...)` returns
  // the fallback instead of failing.
  return `var(--color-cat-${token}, var(--color-accent))`;
}

/**
 * Render a vs-previous delta as a short pill string.
 * - has_previous + delta: "+12%" / "−4%" (uses minus-sign char for alignment).
 * - zero_to_positive / zero_to_negative: "new".
 * - no_previous_data: "—".
 */
export function formatDelta(
  percent: number | null,
  state:
    | 'has_previous'
    | 'no_previous_data'
    | 'zero_to_positive'
    | 'zero_to_negative',
): { text: string; sign: 'pos' | 'neg' | 'neutral' } {
  if (state === 'zero_to_positive') return { text: 'new', sign: 'pos' };
  if (state === 'zero_to_negative') return { text: 'new', sign: 'neg' };
  if (state === 'no_previous_data' || percent === null) {
    return { text: '—', sign: 'neutral' };
  }
  const sign: 'pos' | 'neg' | 'neutral' =
    percent > 0 ? 'pos' : percent < 0 ? 'neg' : 'neutral';
  const arrow = percent > 0 ? '↑' : percent < 0 ? '↓' : '';
  const abs = Math.abs(percent);
  return { text: `${arrow}${arrow ? ' ' : ''}${abs}%`, sign };
}

/**
 * Short month label from "YYYY-MM" → "Jan" / "Feb" / ...
 */
export function shortMonthLabel(ym: string): string {
  const [yStr, mStr] = ym.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return ym;
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
}

/**
 * Format a YYYY-MM-DD date (UTC) to a short human label like "Apr 9".
 */
export function shortDateLabel(iso: string): string {
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const [yStr, mStr, dStr] = parts;
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
