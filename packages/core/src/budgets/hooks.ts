// Budget TanStack Query hooks, shared by web + mobile.
//
// Idempotency-Key is generated in `onMutate` and stashed on the mutation
// variables object so persisted/offline replays keep the same key (the
// server's 24h idempotency dedupe prevents double-writes). Same pattern as
// bills/hooks.ts + transactions/hooks.ts.
//
// Invalidation policy:
//   - Every budget mutation invalidates `['budgets']` (prefix → covers list,
//     detail, status, suggest, history).
//   - Transaction mutations change spend-per-period, so we extend the
//     transactions/hooks.ts `invalidateAfterMutation` helper to also
//     invalidate `['budgets', 'status']` and `['budgets', 'suggest']`.

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { ApiClient } from '../api/client';
import type {
  BudgetScope,
  BudgetStatus,
  CreateBudgetInputType,
  ReorderBudgetsInputType,
  UpdateBudgetInputType,
} from './schemas';

function genIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function ensureKey<V extends { idempotencyKey?: string }>(vars: V): V {
  if (!vars.idempotencyKey) vars.idempotencyKey = genIdempotencyKey();
  return vars;
}

const budgetsRoot = ['budgets'] as const;

export type BudgetsListFilters = {
  scope?: BudgetScope;
  status?: BudgetStatus;
  includeArchived?: boolean;
};

export type BudgetsStatusFilters = {
  scope?: BudgetScope;
  includeArchived?: boolean;
  asOf?: string;
};

export type CreateBudgetVars = CreateBudgetInputType & {
  idempotencyKey?: string;
};
export type UpdateBudgetVars = UpdateBudgetInputType & {
  budgetId: string;
  idempotencyKey?: string;
};
export type ReorderBudgetsVars = ReorderBudgetsInputType & {
  idempotencyKey?: string;
};
export type BudgetActionVars = { budgetId: string; idempotencyKey?: string };

function invalidateBudgets(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: budgetsRoot });
}

export function makeBudgetHooks(client: ApiClient) {
  function useBudgets(filters: BudgetsListFilters = {}) {
    const norm = {
      scope: filters.scope,
      status: filters.status,
      includeArchived: filters.includeArchived ?? false,
    };
    return useInfiniteQuery({
      queryKey: [...budgetsRoot, 'list', norm] as const,
      queryFn: ({ pageParam }) =>
        client.listBudgets({
          ...norm,
          cursor: pageParam ?? undefined,
        }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    });
  }

  function useBudget(id: string | null | undefined) {
    return useQuery({
      queryKey: [...budgetsRoot, 'detail', id] as const,
      enabled: Boolean(id),
      queryFn: () => client.getBudget(id!),
    });
  }

  function useBudgetsStatus(filters: BudgetsStatusFilters = {}) {
    const norm = {
      scope: filters.scope,
      includeArchived: filters.includeArchived ?? false,
      asOf: filters.asOf,
    };
    return useQuery({
      queryKey: [...budgetsRoot, 'status', norm] as const,
      queryFn: () => client.getBudgetsStatus(norm),
      staleTime: 30_000,
    });
  }

  function useBudgetsSuggest() {
    return useQuery({
      queryKey: [...budgetsRoot, 'suggest'] as const,
      queryFn: () => client.getBudgetsSuggest(),
      staleTime: 5 * 60_000,
    });
  }

  function useBudgetHistory(id: string | null | undefined, periods = 6) {
    return useQuery({
      queryKey: [...budgetsRoot, 'history', id, periods] as const,
      enabled: Boolean(id),
      queryFn: () => client.getBudgetHistory(id!, periods),
      staleTime: 30_000,
    });
  }

  function useCreateBudget() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<CreateBudgetVars>,
      mutationFn: (vars: CreateBudgetVars) => {
        const { idempotencyKey, ...body } = vars;
        return client.createBudget(body, idempotencyKey);
      },
      onSuccess: () => {
        invalidateBudgets(qc);
      },
    });
  }

  function useUpdateBudget() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<UpdateBudgetVars>,
      mutationFn: (vars: UpdateBudgetVars) => {
        const { budgetId, idempotencyKey, ...body } = vars;
        return client.updateBudget(budgetId, body, idempotencyKey);
      },
      onSuccess: () => {
        invalidateBudgets(qc);
      },
    });
  }

  function usePauseBudget() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<BudgetActionVars>,
      mutationFn: (vars: BudgetActionVars) =>
        client.pauseBudget(vars.budgetId, vars.idempotencyKey),
      onSuccess: () => {
        invalidateBudgets(qc);
      },
    });
  }

  function useResumeBudget() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<BudgetActionVars>,
      mutationFn: (vars: BudgetActionVars) =>
        client.resumeBudget(vars.budgetId, vars.idempotencyKey),
      onSuccess: () => {
        invalidateBudgets(qc);
      },
    });
  }

  function useArchiveBudget() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<BudgetActionVars>,
      mutationFn: (vars: BudgetActionVars) =>
        client.archiveBudget(vars.budgetId, vars.idempotencyKey),
      onSuccess: () => {
        invalidateBudgets(qc);
      },
    });
  }

  function useRestoreBudget() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<BudgetActionVars>,
      mutationFn: (vars: BudgetActionVars) =>
        client.restoreBudget(vars.budgetId, vars.idempotencyKey),
      onSuccess: () => {
        invalidateBudgets(qc);
      },
    });
  }

  function useReorderBudgets() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<ReorderBudgetsVars>,
      mutationFn: (vars: ReorderBudgetsVars) => {
        const { idempotencyKey, ...body } = vars;
        return client.reorderBudgets(body, idempotencyKey);
      },
      onSuccess: () => {
        invalidateBudgets(qc);
      },
    });
  }

  return {
    useBudgets,
    useBudget,
    useBudgetsStatus,
    useBudgetsSuggest,
    useBudgetHistory,
    useCreateBudget,
    useUpdateBudget,
    usePauseBudget,
    useResumeBudget,
    useArchiveBudget,
    useRestoreBudget,
    useReorderBudgets,
  };
}

export type BudgetHooks = ReturnType<typeof makeBudgetHooks>;
