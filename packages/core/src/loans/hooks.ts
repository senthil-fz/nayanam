// Loan TanStack Query hooks, shared by web + mobile.
//
// Idempotency-Key is generated in `onMutate` and stashed on the mutation
// variables object so persisted/offline replays keep the same key — same
// pattern as bills/budgets. `useComputeLoan` does NOT generate a key:
// `POST /loans/:id/compute` is read-only (the server ignores the header),
// and dedupe happens via the React Query cache.
//
// Invalidation policy: any real mutation invalidates the `['loans']`
// prefix → list + detail + summary. `useComputeLoan` invalidates nothing.

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { ApiClient } from '../api/client';
import type {
  ComparisonBaseline,
  CreateLoanInputType,
  LoanLumpSumInputType,
  LoanStatus,
  ReorderLoansInputType,
  UpdateLoanInputType,
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

const loansRoot = ['loans'] as const;

export type LoansListFilters = {
  status?: LoanStatus;
  includeArchived?: boolean;
};

export type CreateLoanVars = CreateLoanInputType & {
  idempotencyKey?: string;
};
export type UpdateLoanVars = UpdateLoanInputType & {
  loanId: string;
  idempotencyKey?: string;
};
export type LoanActionVars = { loanId: string; idempotencyKey?: string };
export type ReorderLoansVars = ReorderLoansInputType & {
  idempotencyKey?: string;
};
export type ComputeLoanVars = {
  loanId: string;
  extraMonthlyMinor?: string;
  lumpSums?: LoanLumpSumInputType[];
  comparisonBaseline?: ComparisonBaseline;
  idempotencyKey?: string;
};

function invalidateLoans(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: loansRoot });
}

export function makeLoanHooks(client: ApiClient) {
  function useLoans(filters: LoansListFilters = {}) {
    const norm = {
      status: filters.status,
      includeArchived: filters.includeArchived ?? false,
    };
    return useInfiniteQuery({
      queryKey: [...loansRoot, 'list', norm] as const,
      queryFn: ({ pageParam }) =>
        client.listLoans({
          ...norm,
          cursor: pageParam ?? undefined,
        }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    });
  }

  function useLoan(id: string | null | undefined) {
    return useQuery({
      queryKey: [...loansRoot, 'detail', id] as const,
      enabled: Boolean(id),
      queryFn: () => client.getLoan(id!),
    });
  }

  function useLoansSummary() {
    return useQuery({
      queryKey: [...loansRoot, 'summary'] as const,
      queryFn: () => client.getLoansSummary(),
      staleTime: 30_000,
    });
  }

  function useCreateLoan() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<CreateLoanVars>,
      mutationFn: (vars: CreateLoanVars) => {
        const { idempotencyKey, ...body } = vars;
        return client.createLoan(body, idempotencyKey);
      },
      onSuccess: () => {
        invalidateLoans(qc);
      },
    });
  }

  function useUpdateLoan() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<UpdateLoanVars>,
      mutationFn: (vars: UpdateLoanVars) => {
        const { loanId, idempotencyKey, ...body } = vars;
        return client.updateLoan(loanId, body, idempotencyKey);
      },
      onSuccess: () => {
        invalidateLoans(qc);
      },
    });
  }

  function useArchiveLoan() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<LoanActionVars>,
      mutationFn: (vars: LoanActionVars) =>
        client.archiveLoan(vars.loanId, vars.idempotencyKey),
      onSuccess: () => {
        invalidateLoans(qc);
      },
    });
  }

  function useRestoreLoan() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<LoanActionVars>,
      mutationFn: (vars: LoanActionVars) =>
        client.restoreLoan(vars.loanId, vars.idempotencyKey),
      onSuccess: () => {
        invalidateLoans(qc);
      },
    });
  }

  function useReorderLoans() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<ReorderLoansVars>,
      mutationFn: (vars: ReorderLoansVars) => {
        const { idempotencyKey, ...body } = vars;
        return client.reorderLoans(body, idempotencyKey);
      },
      onSuccess: () => {
        invalidateLoans(qc);
      },
    });
  }

  // Compute is read-only; expose as a mutation because the body carries
  // variable-length lump sum arrays. No idempotency key, no invalidation.
  function useComputeLoan() {
    return useMutation({
      mutationFn: (vars: ComputeLoanVars) => {
        const { loanId, idempotencyKey, ...body } = vars;
        return client.computeLoan(
          loanId,
          {
            ...body,
            comparisonBaseline: body.comparisonBaseline ?? 'saved',
          },
          idempotencyKey,
        );
      },
    });
  }

  return {
    useLoans,
    useLoan,
    useLoansSummary,
    useCreateLoan,
    useUpdateLoan,
    useArchiveLoan,
    useRestoreLoan,
    useReorderLoans,
    useComputeLoan,
  };
}

export type LoanHooks = ReturnType<typeof makeLoanHooks>;
