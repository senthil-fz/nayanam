// Appearance context — resolves the persisted (theme, accentToken) into
// concrete runtime values: `effectiveTheme` ('light' | 'dark', honouring
// 'system') and `accentHex`.
//
// Application strategy — NativeWind media (useColorScheme) vs class:
// --------------------------------------------------------------
// The mobile app does NOT currently use NativeWind's class-strategy dark
// mode — there's no `darkMode: 'class'` in `tailwind.config.ts` and no
// `dark:` variants in existing JSX. Dark theming is therefore handled by
// flipping RN's `Appearance.colorScheme`, which flows to both:
//
//   1. `react-native`'s `useColorScheme()` hook (read by NativeWind's
//      default media strategy) — any future `dark:` classes would see the
//      override immediately.
//   2. Consumers that directly read `useColorScheme()` for token picking.
//
// We apply via `Appearance.setColorScheme(theme === 'system' ? null : theme)`
// from the `useApplyAppearanceEffect` hook wired into `_layout.tsx`. `null`
// restores OS control — the canonical "System" behaviour.
//
// Accent propagation: resolved via `ACCOUNT_COLORS[token].from` from
// `@nayanam/ui-tokens` (the first gradient stop is the "flat" accent). When a
// new component needs the live accent it calls `useAppearance().accentHex`.
// Existing components that read `LIGHT.accent` keep working unchanged; this
// is additive.

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { Appearance, useColorScheme } from 'react-native';
import {
  ACCOUNT_COLORS,
  type AccountColorToken,
} from '@nayanam/ui-tokens';
import {
  DEFAULT_APPEARANCE_ACCENT_TOKEN,
  type AppearanceTheme,
} from '@nayanam/core';
import { useAppearanceStore } from '../stores/appearance';

export type EffectiveTheme = 'light' | 'dark';

export interface AppearanceContextValue {
  theme: AppearanceTheme;
  effectiveTheme: EffectiveTheme;
  accentToken: string;
  accentHex: string;
}

const FALLBACK_ACCENT =
  ACCOUNT_COLORS[DEFAULT_APPEARANCE_ACCENT_TOKEN as AccountColorToken].from;

function resolveAccentHex(token: string): string {
  const entry =
    (ACCOUNT_COLORS as Record<string, { from: string } | undefined>)[token];
  return entry?.from ?? FALLBACK_ACCENT;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const theme = useAppearanceStore((s) => s.theme);
  const accentToken = useAppearanceStore((s) => s.accentToken);
  const systemScheme = useColorScheme();

  const value = useMemo<AppearanceContextValue>(() => {
    const sys: EffectiveTheme = systemScheme === 'dark' ? 'dark' : 'light';
    const effective: EffectiveTheme =
      theme === 'system' ? sys : theme;
    return {
      theme,
      effectiveTheme: effective,
      accentToken,
      accentHex: resolveAccentHex(accentToken),
    };
  }, [theme, accentToken, systemScheme]);

  return createElement(AppearanceContext.Provider, { value }, children);
}

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) {
    // Safe fallback: allow components rendered outside the provider (e.g.
    // storybook-style previews) to still read a deterministic value.
    return {
      theme: 'system',
      effectiveTheme: 'light',
      accentToken: DEFAULT_APPEARANCE_ACCENT_TOKEN,
      accentHex: FALLBACK_ACCENT,
    };
  }
  return ctx;
}

/**
 * Applies the persisted theme preference to RN's global color scheme.
 *
 * - `theme === 'system'` → `Appearance.setColorScheme(null)` (OS-controlled).
 * - Otherwise pins `'light' | 'dark'`.
 *
 * Mounted once from `_layout.tsx`; re-runs whenever the user flips the
 * preference in Settings.
 */
export function useApplyAppearanceEffect() {
  const theme = useAppearanceStore((s) => s.theme);
  useEffect(() => {
    try {
      Appearance.setColorScheme(theme === 'system' ? 'unspecified' : theme);
    } catch {
      // Older RN versions or web shim — no-op. Persisted state is still
      // truth-of-record; consumers reading the store directly still work.
    }
  }, [theme]);
}
