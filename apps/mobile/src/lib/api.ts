import { createApiClient, createAuthStore, type AuthState } from '@nayanam/core';
import * as SecureStore from 'expo-secure-store';
import type { PersistStorage, StorageValue } from 'zustand/middleware';
import { router } from 'expo-router';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

// Zustand persist uses sync or async storage; SecureStore is async and works.
const secureStorage: PersistStorage<AuthState> = {
  getItem: async (name) => {
    const raw = await SecureStore.getItemAsync(name);
    return raw ? (JSON.parse(raw) as StorageValue<AuthState>) : null;
  },
  setItem: async (name, value) => {
    await SecureStore.setItemAsync(name, JSON.stringify(value));
  },
  removeItem: async (name) => {
    await SecureStore.deleteItemAsync(name);
  },
};

export const useAuthStore = createAuthStore(secureStorage, 'nayanam-auth');

export const apiClient = createApiClient({
  baseUrl: BASE_URL,
  tokens: {
    getAccessToken: () => useAuthStore.getState().accessToken,
    getRefreshToken: () => useAuthStore.getState().refreshToken,
    setTokens: (pair) => {
      useAuthStore.getState().setTokens(pair);
    },
    onUnauthenticated: () => {
      useAuthStore.getState().clear();
      router.replace('/auth');
    },
  },
  // Inject X-Household-Id on every household-scoped request.
  getActiveHouseholdId: () => useAuthStore.getState().activeHouseholdId,
});
