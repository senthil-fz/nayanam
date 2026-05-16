import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

export interface CreateQueryClientOptions {
  /**
   * Called for 5xx / network errors from any query or mutation.
   * Intentionally excluded from 4xx so 401s during silent token refresh
   * don't produce user-facing noise.
   * Mobile callers omit this; the default is a no-op.
   */
  onError?: (error: unknown) => void;
}

function isClientError(err: unknown): boolean {
  const status = (err as { status?: number } | null | undefined)?.status;
  return typeof status === 'number' && status >= 400 && status < 500;
}

/** A shared QueryClient factory so both apps use identical defaults. */
export function createQueryClient(opts: CreateQueryClientOptions = {}): QueryClient {
  const { onError } = opts;

  const handleError = (error: unknown): void => {
    if (onError && !isClientError(error)) {
      onError(error);
    }
  };

  return new QueryClient({
    queryCache: new QueryCache({ onError: handleError }),
    mutationCache: new MutationCache({ onError: handleError }),
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
