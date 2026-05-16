// App-level API client + auth store wiring for the web app.
// Mobile has its own file (lib/api.ts) with SecureStore + AsyncStorage adapters.

import {
  createApiClient,
  createAppearanceStore,
  createAuthStore,
  createHomeStore,
  type ApiClient,
  type AppearanceState,
  type AuthState,
  type HomeState,
} from '@nayanam/core';
import type { PersistStorage, StorageValue } from 'zustand/middleware';
import { getRouter } from './router';

const BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000/api/v1';

function makeWebStorage<T>(): PersistStorage<T> {
  return {
    getItem: (name) => {
      const raw = localStorage.getItem(name);
      return raw ? (JSON.parse(raw) as StorageValue<T>) : null;
    },
    setItem: (name, value) => localStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localStorage.removeItem(name),
  };
}

export const useAuthStore = createAuthStore(makeWebStorage<AuthState>());
export const useHomeStore = createHomeStore(makeWebStorage<HomeState>());
export const useAppearanceStore = createAppearanceStore(
  makeWebStorage<AppearanceState>(),
);

export const apiClient: ApiClient = createApiClient({
  baseUrl: BASE_URL,
  tokens: {
    getAccessToken: () => useAuthStore.getState().accessToken,
    getRefreshToken: () => useAuthStore.getState().refreshToken,
    setTokens: (pair) => {
      useAuthStore.getState().setTokens(pair);
    },
    onUnauthenticated: () => {
      useAuthStore.getState().clear();
      if (typeof window !== 'undefined' && !location.pathname.startsWith('/auth')) {
        const router = getRouter();
        if (router) {
          // Use the router singleton so navigation stays in-app (no hard reload,
          // no loss of in-memory access token or query cache warm-up work).
          void router.navigate({ to: '/auth', replace: true });
        } else {
          // Fallback: router not yet initialised (bootstrap edge case).
          location.href = '/auth';
        }
      }
    },
  },
  getActiveHouseholdId: () => useAuthStore.getState().activeHouseholdId,
});
