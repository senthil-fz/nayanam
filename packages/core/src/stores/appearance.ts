// Client-persisted appearance preferences — theme (light/dark/system) + accent.
// Mirrors `createHomeStore` from Phase 4: the platform supplies its own
// `PersistStorage` adapter (localStorage on web, AsyncStorage on mobile) and
// gets back a Zustand hook.
//
// Appearance is deliberately local-only: the spec §Edge-cases documents that
// theme/accent are NEVER synced across devices.

import { create, type StateCreator } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

export type AppearanceTheme = 'light' | 'dark' | 'system';

/**
 * Accent token — one of the `account.colors` keys from `@nayanam/ui-tokens`
 * (`indigo | teal | rose | amber | violet | graphite | emerald | sky`). Typed
 * as `string` here to keep `packages/core` free of a UI-tokens dependency; web
 * + mobile narrow at the edge when they map the token to CSS vars.
 */
export const DEFAULT_APPEARANCE_ACCENT_TOKEN = 'indigo';

export type AppearanceState = {
  theme: AppearanceTheme;
  accentToken: string;
  setTheme: (t: AppearanceTheme) => void;
  setAccentToken: (token: string) => void;
};

const initializer: StateCreator<AppearanceState> = (set) => ({
  theme: 'system',
  accentToken: DEFAULT_APPEARANCE_ACCENT_TOKEN,
  setTheme: (theme) => set({ theme }),
  setAccentToken: (accentToken) => set({ accentToken }),
});

export function createAppearanceStore(
  storage: PersistStorage<AppearanceState>,
  name = 'nayanam-appearance',
) {
  return create<AppearanceState>()(
    persist(initializer, {
      name,
      storage,
      partialize: (s) => ({
        theme: s.theme,
        accentToken: s.accentToken,
        setTheme: s.setTheme,
        setAccentToken: s.setAccentToken,
      }),
    }),
  );
}

export type AppearanceStore = ReturnType<typeof createAppearanceStore>;
