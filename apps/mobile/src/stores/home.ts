// Mobile instantiation of the shared home-screen preferences store.
// Mirrors the auth-store wiring in `src/lib/api.ts`, but backed by AsyncStorage
// rather than SecureStore — the hide-balances / period prefs are
// non-sensitive and benefit from the larger AsyncStorage budget.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createHomeStore, type HomeState } from '@nayanam/core';
import type { PersistStorage, StorageValue } from 'zustand/middleware';

function makeAsyncPersistStorage(): PersistStorage<HomeState> {
  return {
    getItem: async (name) => {
      const raw = await AsyncStorage.getItem(name);
      return raw ? (JSON.parse(raw) as StorageValue<HomeState>) : null;
    },
    setItem: async (name, value) => {
      await AsyncStorage.setItem(name, JSON.stringify(value));
    },
    removeItem: async (name) => {
      await AsyncStorage.removeItem(name);
    },
  };
}

export const useHomeStore = createHomeStore(
  makeAsyncPersistStorage(),
  'nayanam-home',
);
