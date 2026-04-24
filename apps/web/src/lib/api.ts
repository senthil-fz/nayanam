// App-level API client + auth store wiring for the web app.
// Mobile has its own file (lib/api.ts) with SecureStore + AsyncStorage adapters.

import { createApiClient, createAuthStore, type ApiClient, type AuthState } from '@nayanam/core';
import type { PersistStorage, StorageValue } from 'zustand/middleware';

const BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000/api/v1';

const webStorage: PersistStorage<AuthState> = {
  getItem: (name) => {
    const raw = localStorage.getItem(name);
    return raw ? (JSON.parse(raw) as StorageValue<AuthState>) : null;
  },
  setItem: (name, value) => localStorage.setItem(name, JSON.stringify(value)),
  removeItem: (name) => localStorage.removeItem(name),
};

export const useAuthStore = createAuthStore(webStorage);

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
        location.href = '/auth';
      }
    },
  },
  getActiveHouseholdId: () => useAuthStore.getState().activeHouseholdId,
});
