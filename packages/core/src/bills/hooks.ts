// Bill TanStack Query hooks, shared by web + mobile.
//
// Idempotency-Key lives on `onMutate` (not `mutationFn`) so persisted/offline
// replays keep the same key and the server's 24h idempotency dedupe prevents
// double-writes. See accounts/hooks.ts + transactions/hooks.ts for the full
// rationale — this file follows the same pattern.
//
// Invalidation policy:
//   - Every bill mutation invalidates the `['bills']` prefix (covers list,
//     detail, summary, upcoming, payments).
//   - `useMarkBillPaid` + `useUndoBillPayment` additionally invalidate the
//     full transactions/accounts/balance-history set — a bill payment mints
//     (or soft-deletes) a Transaction and moves the owning account's cached
//     balance, so every screen that depends on either must refetch.

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { ApiClient } from '../api/client';
import type {
  BillsListFilter,
  BillStatus,
  CreateBillInputType,
  MarkBillPaidInputType,
  ReorderBillsInputType,
  UpdateBillInputType,
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

const billsRoot = ['bills'] as const;
const transactionsRoot = ['transactions'] as const;
const accountsRoot = ['accounts'] as const;

export type BillsListFilters = {
  filter?: BillsListFilter;
  status?: BillStatus;
  includeArchived?: boolean;
};

export type CreateBillVars = CreateBillInputType & { idempotencyKey?: string };
export type UpdateBillVars = UpdateBillInputType & {
  billId: string;
  idempotencyKey?: string;
};
export type ReorderBillsVars = ReorderBillsInputType & {
  idempotencyKey?: string;
};
export type MarkBillPaidVars = MarkBillPaidInputType & {
  billId: string;
  idempotencyKey?: string;
};
export type BillActionVars = { billId: string; idempotencyKey?: string };
export type UndoBillPaymentVars = {
  billId: string;
  paymentId: string;
  idempotencyKey?: string;
};

function invalidateBills(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: billsRoot });
}

// Ledger-touching invalidations shared by mark-paid + undo-payment. Mirrors
// `invalidateAfterMutation` in transactions/hooks.ts but is duplicated here
// instead of imported to avoid a cross-module dependency surface.
function invalidateLedger(qc: QueryClient, accountId: string) {
  void qc.invalidateQueries({ queryKey: transactionsRoot });
  void qc.invalidateQueries({ queryKey: [...transactionsRoot, 'period-summary'] });
  void qc.invalidateQueries({ queryKey: accountsRoot });
  void qc.invalidateQueries({ queryKey: [...accountsRoot, 'summary'] });
  void qc.invalidateQueries({ queryKey: [...accountsRoot, 'balance-history-all'] });
  void qc.invalidateQueries({
    queryKey: [...accountsRoot, accountId, 'balance-history'],
  });
  void qc.invalidateQueries({ queryKey: [...accountsRoot, accountId] });
}

export function makeBillHooks(client: ApiClient) {
  function useBills(filters: BillsListFilters = {}) {
    const norm = {
      filter: filters.filter,
      status: filters.status,
      includeArchived: filters.includeArchived ?? false,
    };
    return useInfiniteQuery({
      queryKey: [...billsRoot, norm] as const,
      queryFn: ({ pageParam }) =>
        client.listBills({
          ...norm,
          cursor: pageParam ?? undefined,
        }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    });
  }

  function useBill(id: string | null | undefined) {
    return useQuery({
      queryKey: [...billsRoot, id] as const,
      enabled: Boolean(id),
      queryFn: () => client.getBill(id!),
    });
  }

  function useBillsSummary() {
    return useQuery({
      queryKey: [...billsRoot, 'summary'] as const,
      queryFn: () => client.getBillsSummary(),
      staleTime: 30_000,
    });
  }

  function useBillsUpcoming(days = 14) {
    return useQuery({
      queryKey: [...billsRoot, 'upcoming', days] as const,
      queryFn: () => client.getBillsUpcoming(days),
      staleTime: 30_000,
    });
  }

  function useBillPayments(billId: string | null | undefined) {
    return useInfiniteQuery({
      queryKey: [...billsRoot, billId, 'payments'] as const,
      enabled: Boolean(billId),
      queryFn: ({ pageParam }) =>
        client.listBillPayments(billId!, { cursor: pageParam ?? undefined }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    });
  }

  function useCreateBill() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<CreateBillVars>,
      mutationFn: (vars: CreateBillVars) => {
        const { idempotencyKey, ...body } = vars;
        return client.createBill(body, idempotencyKey);
      },
      onSuccess: () => {
        invalidateBills(qc);
      },
    });
  }

  function useUpdateBill() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<UpdateBillVars>,
      mutationFn: (vars: UpdateBillVars) => {
        const { billId, idempotencyKey, ...body } = vars;
        return client.updateBill(billId, body, idempotencyKey);
      },
      onSuccess: () => {
        invalidateBills(qc);
      },
    });
  }

  function useArchiveBill() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<BillActionVars>,
      mutationFn: (vars: BillActionVars) =>
        client.archiveBill(vars.billId, vars.idempotencyKey),
      onSuccess: () => {
        invalidateBills(qc);
      },
    });
  }

  function useRestoreBill() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<BillActionVars>,
      mutationFn: (vars: BillActionVars) =>
        client.restoreBill(vars.billId, vars.idempotencyKey),
      onSuccess: () => {
        invalidateBills(qc);
      },
    });
  }

  function usePauseBill() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<BillActionVars>,
      mutationFn: (vars: BillActionVars) =>
        client.pauseBill(vars.billId, vars.idempotencyKey),
      onSuccess: () => {
        invalidateBills(qc);
      },
    });
  }

  function useResumeBill() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<BillActionVars>,
      mutationFn: (vars: BillActionVars) =>
        client.resumeBill(vars.billId, vars.idempotencyKey),
      onSuccess: () => {
        invalidateBills(qc);
      },
    });
  }

  function useReorderBills() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<ReorderBillsVars>,
      mutationFn: (vars: ReorderBillsVars) => {
        const { idempotencyKey, ...body } = vars;
        return client.reorderBills(body, idempotencyKey);
      },
      onSuccess: () => {
        invalidateBills(qc);
      },
    });
  }

  function useMarkBillPaid() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<MarkBillPaidVars>,
      mutationFn: (vars: MarkBillPaidVars) => {
        const { billId, idempotencyKey, ...body } = vars;
        return client.markBillPaid(billId, body, idempotencyKey);
      },
      onSuccess: (res) => {
        invalidateBills(qc);
        invalidateLedger(qc, res.bill.accountId);
        void qc.invalidateQueries({
          queryKey: [...billsRoot, res.bill.id, 'payments'],
        });
      },
    });
  }

  function useUndoBillPayment() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<UndoBillPaymentVars>,
      mutationFn: (vars: UndoBillPaymentVars) =>
        client.undoBillPayment(vars.billId, vars.paymentId, vars.idempotencyKey),
      onSuccess: (bill, vars) => {
        invalidateBills(qc);
        invalidateLedger(qc, bill.accountId);
        void qc.invalidateQueries({
          queryKey: [...billsRoot, vars.billId, 'payments'],
        });
      },
    });
  }

  return {
    useBills,
    useBill,
    useBillsSummary,
    useBillsUpcoming,
    useBillPayments,
    useCreateBill,
    useUpdateBill,
    useArchiveBill,
    useRestoreBill,
    usePauseBill,
    useResumeBill,
    useReorderBills,
    useMarkBillPaid,
    useUndoBillPayment,
  };
}

export type BillHooks = ReturnType<typeof makeBillHooks>;
