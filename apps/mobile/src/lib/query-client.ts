// Persisted QueryClient for offline-friendly mobile UX.
// The cache survives app restarts and offline-queued mutations are replayed
// on reconnect (TanStack Query's `PersistQueryClientProvider`).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { createQueryClient } from '@nayanam/core';

export const queryClient = createQueryClient();

export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'nayanam-query-cache-v1',
  throttleTime: 1_000,
});

export const persistOptions = {
  persister: asyncStoragePersister,
  maxAge: 24 * 60 * 60 * 1_000, // 24h — server idempotency TTL
  // Only persist account + summary + history + me queries for now.
  dehydrateOptions: {
    shouldDehydrateQuery: (q: { queryKey: readonly unknown[] }) => {
      const root = q.queryKey[0];
      return (
        root === 'accounts' ||
        root === 'me' ||
        root === 'households' ||
        root === 'transactions' ||
        root === 'categories' ||
        root === 'transfers'
      );
    },
  },
};
