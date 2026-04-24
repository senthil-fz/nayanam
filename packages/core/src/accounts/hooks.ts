// Account TanStack Query hooks, shared by web + mobile.
// Mutations auto-generate Idempotency-Key via crypto.randomUUID().

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { ApiClient } from '../api/client';
import type {
  Account,
  AccountsSummaryType,
  BalanceHistoryResponseType,
  CreateAccountInputType,
  ReorderAccountsInputType,
  UpdateAccountInputType,
} from './schemas';

function genIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback — should never trigger on supported runtimes (web, RN 0.73+).
  return `idk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const accountsRoot = ['accounts'] as const;

export type UseAccountsOptions = { includeArchived?: boolean };

export function makeAccountHooks(client: ApiClient) {
  function useAccounts(options: UseAccountsOptions = {}) {
    const includeArchived = options.includeArchived ?? false;
    return useInfiniteQuery({
      queryKey: [...accountsRoot, { includeArchived }] as const,
      queryFn: ({ pageParam }) =>
        client.listAccounts({
          cursor: pageParam ?? undefined,
          includeArchived,
        }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    });
  }

  function useAccount(id: string | null | undefined) {
    return useQuery({
      queryKey: [...accountsRoot, id] as const,
      enabled: Boolean(id),
      queryFn: () => client.getAccount(id!),
    });
  }

  function useAccountsSummary() {
    return useQuery<AccountsSummaryType>({
      queryKey: [...accountsRoot, 'summary'] as const,
      queryFn: () => client.getAccountsSummary(),
    });
  }

  function useBalanceHistory(id: string | null | undefined, months = 6) {
    return useQuery<BalanceHistoryResponseType>({
      queryKey: [...accountsRoot, id, 'balance-history', months] as const,
      enabled: Boolean(id),
      queryFn: () => client.getAccountBalanceHistory(id!, months),
    });
  }

  function invalidateList(qc: ReturnType<typeof useQueryClient>) {
    void qc.invalidateQueries({ queryKey: accountsRoot });
  }

  function useCreateAccount() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (body: CreateAccountInputType) =>
        client.createAccount(body as never, genIdempotencyKey()),
      onSuccess: () => {
        invalidateList(qc);
      },
    });
  }

  function useUpdateAccount(id: string) {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (body: UpdateAccountInputType) =>
        client.updateAccount(id, body as never, genIdempotencyKey()),
      onSuccess: (_, vars) => {
        void qc.invalidateQueries({ queryKey: [...accountsRoot, id] });
        void qc.invalidateQueries({ queryKey: accountsRoot });
        void qc.invalidateQueries({ queryKey: [...accountsRoot, 'summary'] });
        if (vars.openingBalanceMinor !== undefined || vars.openingBalanceAt !== undefined) {
          void qc.invalidateQueries({
            queryKey: [...accountsRoot, id, 'balance-history'],
          });
        }
      },
    });
  }

  function useArchiveAccount(id: string) {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: () => client.archiveAccount(id, genIdempotencyKey()),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: [...accountsRoot, id] });
        void qc.invalidateQueries({ queryKey: accountsRoot });
        void qc.invalidateQueries({ queryKey: [...accountsRoot, 'summary'] });
      },
    });
  }

  function useRestoreAccount(id: string) {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: () => client.restoreAccount(id, genIdempotencyKey()),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: [...accountsRoot, id] });
        void qc.invalidateQueries({ queryKey: accountsRoot });
        void qc.invalidateQueries({ queryKey: [...accountsRoot, 'summary'] });
      },
    });
  }

  function useReorderAccounts() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (body: ReorderAccountsInputType) =>
        client.reorderAccounts(body as never, genIdempotencyKey()),
      onSuccess: (res) => {
        // Replace active pages in the includeArchived=false list with the new order.
        qc.setQueriesData(
          { queryKey: accountsRoot },
          (old: unknown) => {
            if (!old || typeof old !== 'object') return old;
            const maybe = old as { pages?: Array<{ items: Account[]; nextCursor: string | null }> };
            if (!Array.isArray(maybe.pages)) return old;
            // Flatten, replace by id map, re-split into a single page. The server
            // always returns the full current ordering so one page is correct.
            return {
              ...maybe,
              pages: [{ items: res.items, nextCursor: null }],
              pageParams: [undefined],
            };
          },
        );
      },
    });
  }

  return {
    useAccounts,
    useAccount,
    useAccountsSummary,
    useBalanceHistory,
    useCreateAccount,
    useUpdateAccount,
    useArchiveAccount,
    useRestoreAccount,
    useReorderAccounts,
  };
}

export type AccountHooks = ReturnType<typeof makeAccountHooks>;
