// Web-side adapter for the shared `createAppearanceStore`. Applies the
// persisted theme + accent to the DOM by setting `class="dark"` on `<html>`
// and mirroring the accent hex into `--color-accent` + `--color-accent-soft`
// CSS vars defined in `styles.css`.
//
// The mobile app reads the same store and maps the same accent token into
// NativeWind classes — the token is the stable contract; only the render side
// differs.

import {
  ACCOUNT_COLORS,
  type AccountColorToken,
  ACCOUNT_COLOR_TOKENS,
} from '@nayanam/ui-tokens';
import type { AppearanceTheme } from '@nayanam/core';

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function resolveAccent(token: string): { hex: string; soft: string } {
  const key = (ACCOUNT_COLOR_TOKENS as readonly string[]).includes(token)
    ? (token as AccountColorToken)
    : ('indigo' as AccountColorToken);
  const color = ACCOUNT_COLORS[key];
  // `account.colors` carries gradient stops (`from`/`to`). For the accent
  // surface we use the bright end; the soft tint is a translucent overlay.
  return { hex: color.from, soft: hexToRgba(color.from, 0.12) };
}

function resolveThemeMode(theme: AppearanceTheme): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function applyAppearance(theme: AppearanceTheme, accentToken: string): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const mode = resolveThemeMode(theme);
  root.classList.toggle('dark', mode === 'dark');
  root.dataset.theme = mode;
  root.dataset.appearancePref = theme;

  const { hex, soft } = resolveAccent(accentToken);
  root.style.setProperty('--color-accent', hex);
  root.style.setProperty('--color-accent-soft', soft);
}
