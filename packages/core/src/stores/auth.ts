import { create, type StateCreator } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';
import type { ApiHouseholdSummary, ApiTokenPair, ApiUser } from '@nayanam/contracts';

export type AuthState = {
  user: ApiUser | null;
  households: ApiHouseholdSummary[];
  activeHouseholdId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: string | null;

  setSession: (input: {
    user: ApiUser;
    households: ApiHouseholdSummary[];
    tokens: ApiTokenPair;
  }) => void;
  setTokens: (tokens: ApiTokenPair | null) => void;
  setHouseholds: (households: ApiHouseholdSummary[]) => void;
  setActiveHousehold: (id: string | null) => void;
  clear: () => void;
};

const initializer: StateCreator<AuthState> = (set, get) => ({
  user: null,
  households: [],
  activeHouseholdId: null,
  accessToken: null,
  refreshToken: null,
  accessTokenExpiresAt: null,

  setSession: ({ user, households, tokens }) =>
    set({
      user,
      households,
      activeHouseholdId: get().activeHouseholdId ?? households[0]?.id ?? null,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
    }),

  setTokens: (tokens) =>
    set({
      accessToken: tokens?.accessToken ?? null,
      refreshToken: tokens?.refreshToken ?? null,
      accessTokenExpiresAt: tokens?.accessTokenExpiresAt ?? null,
    }),

  setHouseholds: (households) =>
    set((s) => ({
      households,
      activeHouseholdId:
        s.activeHouseholdId && households.some((h) => h.id === s.activeHouseholdId)
          ? s.activeHouseholdId
          : (households[0]?.id ?? null),
    })),

  setActiveHousehold: (id) => set({ activeHouseholdId: id }),

  clear: () =>
    set({
      user: null,
      households: [],
      activeHouseholdId: null,
      accessToken: null,
      refreshToken: null,
      accessTokenExpiresAt: null,
    }),
});

export function createAuthStore(storage: PersistStorage<AuthState>, name = 'nayanam-auth') {
  return create<AuthState>()(
    persist(initializer, {
      name,
      storage,
      // Don't persist access tokens — short-lived; keep refresh + user + household choice.
      partialize: (state) => ({
        refreshToken: state.refreshToken,
        user: state.user,
        households: state.households,
        activeHouseholdId: state.activeHouseholdId,
        accessToken: null,
        accessTokenExpiresAt: null,
        setSession: state.setSession,
        setTokens: state.setTokens,
        setHouseholds: state.setHouseholds,
        setActiveHousehold: state.setActiveHousehold,
        clear: state.clear,
      }),
    }),
  );
}

export type AuthStore = ReturnType<typeof createAuthStore>;
