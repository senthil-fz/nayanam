// Home-screen per-device preferences, persisted. Mirrors the auth store's
// platform-adapter pattern — web wires localStorage, mobile wires AsyncStorage.

import { create, type StateCreator } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

export type HomePeriod = 'day' | 'week' | 'month' | 'year';

export type HomeState = {
  balancesHidden: boolean;
  period: HomePeriod;
  toggleBalancesHidden: () => void;
  setBalancesHidden: (v: boolean) => void;
  setPeriod: (p: HomePeriod) => void;
};

const initializer: StateCreator<HomeState> = (set) => ({
  balancesHidden: false,
  period: 'month',
  toggleBalancesHidden: () => set((s) => ({ balancesHidden: !s.balancesHidden })),
  setBalancesHidden: (v) => set({ balancesHidden: v }),
  setPeriod: (p) => set({ period: p }),
});

export function createHomeStore(
  storage: PersistStorage<HomeState>,
  name = 'nayanam-home',
) {
  return create<HomeState>()(
    persist(initializer, {
      name,
      storage,
      // Persist only the user-facing prefs, not the setters.
      partialize: (s) => ({
        balancesHidden: s.balancesHidden,
        period: s.period,
        toggleBalancesHidden: s.toggleBalancesHidden,
        setBalancesHidden: s.setBalancesHidden,
        setPeriod: s.setPeriod,
      }),
    }),
  );
}

export type HomeStore = ReturnType<typeof createHomeStore>;
