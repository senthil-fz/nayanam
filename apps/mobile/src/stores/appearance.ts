// Mobile instantiation of the shared appearance (theme + accent) store.
// Mirrors the `src/stores/home.ts` pattern — AsyncStorage adapter for a
// non-sensitive preference. Theme + accent are deliberately NOT synced
// across devices (see packages/core/stores/appearance.ts docstring).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAppearanceStore, type AppearanceState } from '@nayanam/core';
import type { PersistStorage, StorageValue } from 'zustand/middleware';

function makeAsyncPersistStorage(): PersistStorage<AppearanceState> {
  return {
    getItem: async (name) => {
      const raw = await AsyncStorage.getItem(name);
      return raw ? (JSON.parse(raw) as StorageValue<AppearanceState>) : null;
    },
    setItem: async (name, value) => {
      await AsyncStorage.setItem(name, JSON.stringify(value));
    },
    removeItem: async (name) => {
      await AsyncStorage.removeItem(name);
    },
  };
}

export const useAppearanceStore = createAppearanceStore(
  makeAsyncPersistStorage(),
  'nayanam-appearance',
);
