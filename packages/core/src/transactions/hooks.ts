// Transaction + Transfer TanStack Query hooks, shared by web + mobile.
//
// Idempotency-Key is generated in `onMutate` and stashed on the mutation
// variables object. This is critical for persisted/offline mutation queues
// (mobile today, web later): TanStack Query's persister serializes the
// variables and replays `mutationFn` on restart/reconnect. If we minted the
// key inside `mutationFn` it would differ on each replay and the server's
// 24h idempotency dedupe would not trigger, producing duplicates. `onMutate`
// runs once per logical `mutate()` call, so the key is stable across
// retries. Callers may also pass their own `idempotencyKey` through the
// variables to correlate with external state.
//
// Invalidation on every mutation touches:
//   - ['transactions']       — list + single
//   - ['accounts']           — list (cached balances change)
//   - ['accounts', 'summary']
//   - ['accounts', <id>, 'balance-history'] for each affected account id

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { ApiClient } from '../api/client';
import type {
  BulkCreateTransactionsInputType,
  CreateTransactionInputType,
  CreateTransferInputType,
  HomePeriodType,
  ListTransactionsQueryType,
  TransactionType,
  UpdateTransactionInputType,
} from './schemas';

function genIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Ensures `vars.idempotencyKey` is set, generating one if absent. Mutates
// the passed-in object so the key persists with the variables when
// TanStack Query dehydrates the mutation.
function ensureKey<V extends { idempotencyKey?: string }>(vars: V): V {
  if (!vars.idempotencyKey) vars.idempotencyKey = genIdempotencyKey();
  return vars;
}

const transactionsRoot = ['transactions'] as const;
const transfersRoot = ['transfers'] as const;
const accountsRoot = ['accounts'] as const;
const budgetsRoot = ['budgets'] as const;
const statsRoot = ['stats'] as const;

// Variables types — the input schema plus an optional idempotency key that
// `onMutate` fills in. The key is a transport concern and deliberately not
// part of the Zod input schema.
export type CreateTransactionVars = CreateTransactionInputType & {
  idempotencyKey?: string;
};
export type UpdateTransactionVars = UpdateTransactionInputType & {
  idempotencyKey?: string;
};
export type BulkCreateTransactionsVars = BulkCreateTransactionsInputType & {
  idempotencyKey?: string;
};
export type CreateTransferVars = CreateTransferInputType & {
  idempotencyKey?: string;
};
export type IdempotentTransactionActionVars = { idempotencyKey?: string };

function normalizeFilters(filters: ListTransactionsQueryType): {
  accountId?: string[];
  categoryId?: string[];
  type?: TransactionType;
  from?: string;
  to?: string;
  q?: string;
  includeDeleted?: boolean;
  transferId?: string;
  limit?: number;
} {
  // Stable serializable shape for the query key — arrays sorted, empty arrays
  // dropped so `{accountId: []}` and `{}` hit the same cache entry.
  const accountId = filters.accountId?.length
    ? [...filters.accountId].sort()
    : undefined;
  const categoryId = filters.categoryId?.length
    ? [...filters.categoryId].sort()
    : undefined;
  return {
    accountId,
    categoryId,
    type: filters.type,
    from: filters.from,
    to: filters.to,
    q: filters.q?.trim() ? filters.q.trim() : undefined,
    includeDeleted: filters.includeDeleted,
    transferId: filters.transferId,
    limit: filters.limit,
  };
}

function invalidateAfterMutation(
  qc: QueryClient,
  touchedAccountIds: ReadonlyArray<string> = [],
) {
  void qc.invalidateQueries({ queryKey: transactionsRoot });
  void qc.invalidateQueries({ queryKey: accountsRoot });
  void qc.invalidateQueries({ queryKey: [...accountsRoot, 'summary'] });
  // Phase 4: Home aggregates — invalidate broadly so any param variant is refetched.
  void qc.invalidateQueries({ queryKey: [...transactionsRoot, 'period-summary'] });
  void qc.invalidateQueries({ queryKey: [...accountsRoot, 'balance-history-all'] });
  // Phase 6: transaction mutations change budget spend-per-period, so the
  // Home widget + Settings → Budgets list must refetch. We invalidate the
  // computed views (status/suggest) plus the list prefix — detail rows are
  // unaffected by spend changes, but invalidating the whole ['budgets'] tree
  // keeps the logic simple and matches the mutation-side invalidation policy.
  void qc.invalidateQueries({ queryKey: [...budgetsRoot, 'status'] });
  void qc.invalidateQueries({ queryKey: [...budgetsRoot, 'suggest'] });
  void qc.invalidateQueries({ queryKey: budgetsRoot });
  // Phase 7: every Stats query derives from transactions, so any transaction
  // mutation (create / update / delete / restore / transfer) must sweep the
  // `['stats']` tree. Prefix invalidation covers overview, monthly-trend,
  // category-breakdown, daily-spend, category-sparkline, and sankey in one
  // call.
  void qc.invalidateQueries({ queryKey: statsRoot });
  for (const id of touchedAccountIds) {
    void qc.invalidateQueries({ queryKey: [...accountsRoot, id, 'balance-history'] });
    void qc.invalidateQueries({ queryKey: [...accountsRoot, id] });
  }
}

export function makeTransactionHooks(client: ApiClient) {
  function useTransactions(filters: ListTransactionsQueryType = {}) {
    const norm = normalizeFilters(filters);
    return useInfiniteQuery({
      queryKey: [...transactionsRoot, norm] as const,
      queryFn: ({ pageParam }) =>
        client.listTransactions({
          ...norm,
          cursor: pageParam ?? undefined,
        }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    });
  }

  function usePeriodSummary(
    q: { period?: HomePeriodType; from?: string; to?: string } = {},
  ) {
    return useQuery({
      queryKey: [...transactionsRoot, 'period-summary', q] as const,
      queryFn: () => client.getTransactionsPeriodSummary(q),
      staleTime: 30_000,
    });
  }

  function useTransaction(id: string | null | undefined) {
    return useQuery({
      queryKey: [...transactionsRoot, id] as const,
      enabled: Boolean(id),
      queryFn: () => client.getTransaction(id!),
    });
  }

  function useCreateTransaction() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<CreateTransactionVars>,
      mutationFn: (vars: CreateTransactionVars) => {
        const { idempotencyKey, ...body } = vars;
        return client.createTransaction(body, idempotencyKey);
      },
      onSuccess: (res) => {
        invalidateAfterMutation(qc, [res.accountId]);
      },
    });
  }

  function useUpdateTransaction(id: string) {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<UpdateTransactionVars>,
      mutationFn: (vars: UpdateTransactionVars) => {
        const { idempotencyKey, ...body } = vars;
        return client.updateTransaction(id, body, idempotencyKey);
      },
      onSuccess: (res, vars) => {
        // The row's current account is in the response; if the caller also
        // changed accountId, vars.accountId is the new id — dedupe.
        const touched = new Set<string>([res.accountId]);
        if (vars.accountId) touched.add(vars.accountId);
        void qc.invalidateQueries({ queryKey: [...transactionsRoot, id] });
        invalidateAfterMutation(qc, [...touched]);
      },
    });
  }

  function useDeleteTransaction(id: string) {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<IdempotentTransactionActionVars>,
      mutationFn: (vars: IdempotentTransactionActionVars) =>
        client.deleteTransaction(id, vars.idempotencyKey),
      onSuccess: (res) => {
        void qc.invalidateQueries({ queryKey: [...transactionsRoot, id] });
        invalidateAfterMutation(qc, [res.accountId]);
      },
    });
  }

  function useRestoreTransaction(id: string) {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<IdempotentTransactionActionVars>,
      mutationFn: (vars: IdempotentTransactionActionVars) =>
        client.restoreTransaction(id, vars.idempotencyKey),
      onSuccess: (res) => {
        void qc.invalidateQueries({ queryKey: [...transactionsRoot, id] });
        invalidateAfterMutation(qc, [res.accountId]);
      },
    });
  }

  function useBulkCreateTransactions() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<BulkCreateTransactionsVars>,
      mutationFn: (vars: BulkCreateTransactionsVars) => {
        const { idempotencyKey, ...body } = vars;
        return client.bulkCreateTransactions(body, idempotencyKey);
      },
      onSuccess: (res) => {
        const ids = Array.from(new Set(res.items.map((t) => t.accountId)));
        invalidateAfterMutation(qc, ids);
      },
    });
  }

  function useTransfer(id: string | null | undefined) {
    return useQuery({
      queryKey: [...transfersRoot, id] as const,
      enabled: Boolean(id),
      queryFn: () => client.getTransfer(id!),
    });
  }

  function useCreateTransfer() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<CreateTransferVars>,
      mutationFn: (vars: CreateTransferVars) => {
        const { idempotencyKey, ...body } = vars;
        return client.createTransfer(body, idempotencyKey);
      },
      onSuccess: (res) => {
        void qc.invalidateQueries({ queryKey: transfersRoot });
        invalidateAfterMutation(qc, [
          res.transfer.sourceAccountId,
          res.transfer.destinationAccountId,
        ]);
      },
    });
  }

  function useDeleteTransfer(id: string) {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<IdempotentTransactionActionVars>,
      mutationFn: (vars: IdempotentTransactionActionVars) =>
        client.deleteTransfer(id, vars.idempotencyKey),
      onSuccess: (res) => {
        void qc.invalidateQueries({ queryKey: [...transfersRoot, id] });
        void qc.invalidateQueries({ queryKey: transfersRoot });
        invalidateAfterMutation(qc, [
          res.transfer.sourceAccountId,
          res.transfer.destinationAccountId,
        ]);
      },
    });
  }

  function useRestoreTransfer(id: string) {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<IdempotentTransactionActionVars>,
      mutationFn: (vars: IdempotentTransactionActionVars) =>
        client.restoreTransfer(id, vars.idempotencyKey),
      onSuccess: (res) => {
        void qc.invalidateQueries({ queryKey: [...transfersRoot, id] });
        void qc.invalidateQueries({ queryKey: transfersRoot });
        invalidateAfterMutation(qc, [
          res.transfer.sourceAccountId,
          res.transfer.destinationAccountId,
        ]);
      },
    });
  }

  return {
    useTransactions,
    usePeriodSummary,
    useTransaction,
    useCreateTransaction,
    useUpdateTransaction,
    useDeleteTransaction,
    useRestoreTransaction,
    useBulkCreateTransactions,
    useTransfer,
    useCreateTransfer,
    useDeleteTransfer,
    useRestoreTransfer,
  };
}

export type TransactionHooks = ReturnType<typeof makeTransactionHooks>;
