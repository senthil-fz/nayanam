// Zustand store slices shared across web + mobile.
// Each app provides its own persistence adapter (localStorage on web, AsyncStorage on mobile)
// via `createAppStore`.

import { create, type StateCreator } from 'zustand';
import { persist, type PersistOptions, type PersistStorage } from 'zustand/middleware';

export type StorageAdapter<T> = PersistStorage<T>;

/** Create a persisted Zustand store with a platform-supplied storage adapter. */
export function createPersistedStore<T>(
  name: string,
  initializer: StateCreator<T>,
  storage: PersistStorage<T>,
  options?: Partial<PersistOptions<T>>,
) {
  return create<T>()(
    persist(initializer, {
      name,
      storage,
      ...options,
    }),
  );
}

export * from './auth';
export * from './home';
export * from './appearance';
