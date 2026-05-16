import { createApiClient, createAuthStore, type AuthState } from '@nayanam/core';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PersistStorage, StorageValue } from 'zustand/middleware';
import { router } from 'expo-router';

const BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

// SecureStore options: device-only keychain entry, not eligible for backup or
// iCloud Keychain sync (Finding #5).
const SECURE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

// SECURITY — split storage strategy (Finding #9).
//
// Android SecureStore can silently fail for values > ~2KB. Storing the whole
// auth blob (user profile + households[]) in one entry risks silently dropping
// the refresh token when the household list grows.
//
// Solution: store ONLY the refresh token in SecureStore; store the rest of the
// auth state (user, households, activeHouseholdId) in AsyncStorage which has
// no size limit. This follows the principle of keeping secrets minimal in the
// high-security store.
//
// The Zustand persist middleware calls getItem/setItem/removeItem with the full
// StorageValue<AuthState>. We intercept those calls to split the payload.

const SECURE_TOKEN_KEY = 'nayanam-auth-token'; // Only refreshToken.
const NONSECRET_KEY = 'nayanam-auth-meta'; // user, households, activeHouseholdId.

type PersistedAuth = StorageValue<AuthState>;

// Extract only the refreshToken into SecureStore; everything else into AsyncStorage.
const splitStorage: PersistStorage<AuthState> = {
  getItem: async (_name) => {
    const [tokenRaw, metaRaw] = await Promise.all([
      SecureStore.getItemAsync(SECURE_TOKEN_KEY, SECURE_OPTS),
      AsyncStorage.getItem(NONSECRET_KEY),
    ]);
    if (!tokenRaw && !metaRaw) return null;
    // Re-merge into the StorageValue shape.
    const tokenPart = tokenRaw
      ? (JSON.parse(tokenRaw) as { refreshToken: string | null })
      : { refreshToken: null };
    const metaPart = metaRaw
      ? (JSON.parse(metaRaw) as Omit<
          PersistedAuth['state'],
          'refreshToken' | 'accessToken' | 'accessTokenExpiresAt'
        >)
      : { user: null, households: [], activeHouseholdId: null };
    const merged: PersistedAuth = {
      version: 0,
      state: {
        ...metaPart,
        refreshToken: tokenPart.refreshToken,
        accessToken: null,
        accessTokenExpiresAt: null,
      } as AuthState,
    };
    return merged;
  },

  setItem: async (_name, value) => {
    const state = value.state;
    // Only the refreshToken goes to SecureStore.
    const tokenPart = { refreshToken: state.refreshToken ?? null };
    // Everything else (non-secret profile data) goes to AsyncStorage.
    const metaPart = {
      user: state.user ?? null,
      households: state.households ?? [],
      activeHouseholdId: state.activeHouseholdId ?? null,
    };
    await Promise.all([
      SecureStore.setItemAsync(
        SECURE_TOKEN_KEY,
        JSON.stringify(tokenPart),
        SECURE_OPTS,
      ),
      AsyncStorage.setItem(NONSECRET_KEY, JSON.stringify(metaPart)),
    ]);
  },

  removeItem: async (_name) => {
    await Promise.all([
      SecureStore.deleteItemAsync(SECURE_TOKEN_KEY, SECURE_OPTS),
      AsyncStorage.removeItem(NONSECRET_KEY),
    ]);
  },
};

export const useAuthStore = createAuthStore(splitStorage, 'nayanam-auth');

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
