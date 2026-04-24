// Shared helpers private to the mobile Stats feature. Mirrors the
// web util file (`apps/web/src/features/stats/util.ts`) — display-only
// formatters, label lookups, and color-token → hex resolution.
//
// Mobile cannot use CSS variables, so `colorForToken` returns a real
// hex string from `packages/ui-tokens`' `CATEGORY_COLORS` table.

import type { StatsPeriodKind } from '@nayanam/core';
import { ACCENTS, CATEGORY_COLORS } from '@nayanam/ui-tokens';

export const ACCENT_HEX = ACCENTS.indigo.hex;

export type UIPeriod = Exclude<StatsPeriodKind, 'custom'>;

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

export function periodEyebrow(p: StatsPeriodKind): string {
  return `NET THIS ${p === 'custom' ? 'PERIOD' : p.toUpperCase()}`;
}

export function minorToNumber(s: string | undefined | null): number {
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// Map a Nayanam category color token to an ink hex. Falls back to the
// theme accent when the token is missing from the table or null/empty.
export function colorForToken(token?: string | null): string {
  if (!token) return ACCENT_HEX;
  const entry = (CATEGORY_COLORS as Record<string, { ink: string } | undefined>)[
    token
  ];
  return entry?.ink ?? ACCENT_HEX;
}

export function softColorForToken(token?: string | null): string {
  if (!token) return ACCENTS.indigo.soft;
  const entry = (CATEGORY_COLORS as Record<string, { soft: string } | undefined>)[
    token
  ];
  return entry?.soft ?? ACCENTS.indigo.soft;
}

// Render a vs-previous delta as a short pill string.
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

// Short month label from "YYYY-MM" → "Jan" / "Feb" / ...
export function shortMonthLabel(ym: string): string {
  const [yStr, mStr] = ym.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return ym;
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
}

// YYYY-MM-DD → "Apr 9"
export function shortDateLabel(iso: string): string {
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const [yStr, mStr, dStr] = parts;
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return iso;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

// Mix an opaque hex color with transparency using an alpha 0..1.
// Used for heatmap / sparkline fills — RN doesn't support CSS color-mix().
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const hh = hex.replace('#', '');
  const pair =
    hh.length === 3
      ? hh
          .split('')
          .map((c) => c + c)
          .join('')
      : hh.slice(0, 6);
  const r = parseInt(pair.slice(0, 2), 16);
  const g = parseInt(pair.slice(2, 4), 16);
  const b = parseInt(pair.slice(4, 6), 16);
  if (
    Number.isNaN(r) ||
    Number.isNaN(g) ||
    Number.isNaN(b)
  ) {
    return hex;
  }
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}
