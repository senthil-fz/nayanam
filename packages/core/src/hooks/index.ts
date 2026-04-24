import { QueryClient } from '@tanstack/react-query';

/** A shared QueryClient factory so both apps use identical defaults. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, err: unknown) => {
          const status = (err as { status?: number } | null | undefined)?.status;
          if (status && status >= 400 && status < 500) return false;
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export * from './auth';
