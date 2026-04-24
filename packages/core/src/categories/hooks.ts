// Category TanStack Query hooks, shared by web + mobile.
//
// Idempotency-Key is generated in `onMutate` and stashed on the mutation
// variables object so a persisted/offline replay reuses the same key.
// See `transactions/hooks.ts` for full rationale.

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { ApiClient } from '../api/client';
import type {
  Category,
  CreateCategoryInputType,
  ReorderCategoriesInputType,
  UpdateCategoryInputType,
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

const categoriesRoot = ['categories'] as const;

export type CreateCategoryVars = CreateCategoryInputType & {
  idempotencyKey?: string;
};
export type UpdateCategoryVars = UpdateCategoryInputType & {
  idempotencyKey?: string;
};
export type ReorderCategoriesVars = ReorderCategoriesInputType & {
  idempotencyKey?: string;
};
export type IdempotentCategoryActionVars = { idempotencyKey?: string };

export type UseCategoriesOptions = {
  type?: 'INCOME' | 'EXPENSE';
  includeArchived?: boolean;
};

export function makeCategoryHooks(client: ApiClient) {
  function useCategories(options: UseCategoriesOptions = {}) {
    const { type, includeArchived = false } = options;
    return useInfiniteQuery({
      queryKey: [...categoriesRoot, { type: type ?? null, includeArchived }] as const,
      queryFn: ({ pageParam }) =>
        client.listCategories({
          cursor: pageParam ?? undefined,
          type,
          includeArchived,
        }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    });
  }

  function useCategory(id: string | null | undefined) {
    return useQuery({
      queryKey: [...categoriesRoot, id] as const,
      enabled: Boolean(id),
      queryFn: () => client.getCategory(id!),
    });
  }

  function useCreateCategory() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<CreateCategoryVars>,
      mutationFn: (vars: CreateCategoryVars) => {
        const { idempotencyKey, ...body } = vars;
        return client.createCategory(body, idempotencyKey);
      },
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: categoriesRoot });
      },
    });
  }

  function useUpdateCategory(id: string) {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<UpdateCategoryVars>,
      mutationFn: (vars: UpdateCategoryVars) => {
        const { idempotencyKey, ...body } = vars;
        return client.updateCategory(id, body, idempotencyKey);
      },
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: categoriesRoot });
        void qc.invalidateQueries({ queryKey: [...categoriesRoot, id] });
      },
    });
  }

  function useArchiveCategory(id: string) {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<IdempotentCategoryActionVars>,
      mutationFn: (vars: IdempotentCategoryActionVars) =>
        client.archiveCategory(id, vars.idempotencyKey),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: categoriesRoot });
        void qc.invalidateQueries({ queryKey: [...categoriesRoot, id] });
      },
    });
  }

  function useRestoreCategory(id: string) {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<IdempotentCategoryActionVars>,
      mutationFn: (vars: IdempotentCategoryActionVars) =>
        client.restoreCategory(id, vars.idempotencyKey),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: categoriesRoot });
        void qc.invalidateQueries({ queryKey: [...categoriesRoot, id] });
      },
    });
  }

  function useReorderCategories() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<ReorderCategoriesVars>,
      mutationFn: (vars: ReorderCategoriesVars) => {
        const { idempotencyKey, ...body } = vars;
        return client.reorderCategories(body, idempotencyKey);
      },
      onSuccess: (res) => {
        // Server returns the full current ordering; seed all matching lists
        // with one page so the next paint reflects the new order without a roundtrip.
        qc.setQueriesData({ queryKey: categoriesRoot }, (old: unknown) => {
          if (!old || typeof old !== 'object') return old;
          const maybe = old as {
            pages?: Array<{ items: Category[]; nextCursor: string | null }>;
          };
          if (!Array.isArray(maybe.pages)) return old;
          return {
            ...maybe,
            pages: [{ items: res.items, nextCursor: null }],
            pageParams: [undefined],
          };
        });
      },
    });
  }

  return {
    useCategories,
    useCategory,
    useCreateCategory,
    useUpdateCategory,
    useArchiveCategory,
    useRestoreCategory,
    useReorderCategories,
  };
}

export type CategoryHooks = ReturnType<typeof makeCategoryHooks>;
