// Notification TanStack Query hooks, shared by web + mobile.
//
// Invalidation policy:
//   - Every mutation invalidates the `['notifications']` prefix (covers list
//     pages, single-row, filtered views).
//   - Mutations that change read/unread also invalidate the unread-count key
//     explicitly so the Home bell dot updates without waiting for the 60s poll.

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { ApiClient } from '../api/client';
import type {
  MarkAllNotificationsReadInputType,
  NotificationCategory,
  UnreadCountResponseType,
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

const notificationsRoot = ['notifications'] as const;

function invalidateAll(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: notificationsRoot });
  void qc.invalidateQueries({
    queryKey: [...notificationsRoot, 'unread-count'],
  });
}

export type UseUnreadNotificationCountOptions = {
  /** Caller opts in to polling; default is no polling. Home passes 60_000. */
  refetchIntervalMs?: number;
  enabled?: boolean;
};

export type UseNotificationsFilters = {
  unreadOnly?: boolean;
  category?: NotificationCategory;
};

export type NotificationIdVars = {
  notificationId: string;
  idempotencyKey?: string;
};

export type MarkAllReadVars = MarkAllNotificationsReadInputType & {
  idempotencyKey?: string;
};

export function makeNotificationHooks(client: ApiClient) {
  function useUnreadNotificationCount(
    options: UseUnreadNotificationCountOptions = {},
  ) {
    return useQuery<UnreadCountResponseType>({
      queryKey: [...notificationsRoot, 'unread-count'] as const,
      queryFn: () => client.getNotificationUnreadCount(),
      staleTime: 30_000,
      refetchInterval: options.refetchIntervalMs,
      retry: false,
      enabled: options.enabled ?? true,
    });
  }

  function useNotifications(filters: UseNotificationsFilters = {}) {
    const norm = {
      unreadOnly: filters.unreadOnly ?? false,
      category: filters.category,
    };
    return useInfiniteQuery({
      queryKey: [...notificationsRoot, 'list', norm] as const,
      queryFn: ({ pageParam }) =>
        client.listNotifications({
          unreadOnly: norm.unreadOnly,
          category: norm.category,
          cursor: pageParam ?? undefined,
        }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    });
  }

  function useNotification(id: string | null | undefined) {
    return useQuery({
      queryKey: [...notificationsRoot, id] as const,
      enabled: Boolean(id),
      queryFn: () => client.getNotification(id!),
    });
  }

  function useMarkNotificationRead() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<NotificationIdVars>,
      mutationFn: (vars: NotificationIdVars) =>
        client.markNotificationRead(vars.notificationId, vars.idempotencyKey),
      onSuccess: () => invalidateAll(qc),
    });
  }

  function useMarkNotificationUnread() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<NotificationIdVars>,
      mutationFn: (vars: NotificationIdVars) =>
        client.markNotificationUnread(vars.notificationId, vars.idempotencyKey),
      onSuccess: () => invalidateAll(qc),
    });
  }

  function useMarkAllNotificationsRead() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<MarkAllReadVars>,
      mutationFn: (vars: MarkAllReadVars) => {
        const { idempotencyKey, ...body } = vars;
        return client.markAllNotificationsRead(body, idempotencyKey);
      },
      onSuccess: () => invalidateAll(qc),
    });
  }

  function useDeleteNotification() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<NotificationIdVars>,
      mutationFn: (vars: NotificationIdVars) =>
        client.deleteNotification(vars.notificationId, vars.idempotencyKey),
      onSuccess: () => invalidateAll(qc),
    });
  }

  return {
    useUnreadNotificationCount,
    useNotifications,
    useNotification,
    useMarkNotificationRead,
    useMarkNotificationUnread,
    useMarkAllNotificationsRead,
    useDeleteNotification,
  };
}

export type NotificationHooks = ReturnType<typeof makeNotificationHooks>;
