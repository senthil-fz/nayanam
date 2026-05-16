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
  // SECURITY: Only persist non-sensitive UI-state queries.
  // DO NOT persist keys containing emails, member lists, full financial
  // history, or auth-adjacent data — AsyncStorage is plaintext and readable
  // on rooted/jailbroken devices or via unencrypted device backups.
  // Excluded: 'me' (email/PII), 'households' (member list / emails),
  // 'transactions' (full financial history), 'accounts' (balances), 'transfers'.
  dehydrateOptions: {
    shouldDehydrateQuery: (q: { queryKey: readonly unknown[] }) => {
      const root = q.queryKey[0];
      // Only persist low-sensitivity UI reference data (category names/icons).
      return root === 'categories';
    },
  },
};
