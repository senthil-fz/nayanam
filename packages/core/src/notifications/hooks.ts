// Notification TanStack Query hooks, shared by web + mobile.
// Phase 4 only wires unread-count; list + mark-read land in Phase 8.

import { useQuery } from '@tanstack/react-query';
import type { ApiClient } from '../api/client';
import type { UnreadCountResponseType } from './schemas';

const notificationsRoot = ['notifications'] as const;

export type UseUnreadNotificationCountOptions = {
  /** Caller opts in to polling; default is no polling. Home passes 60_000. */
  refetchIntervalMs?: number;
  enabled?: boolean;
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

  return { useUnreadNotificationCount };
}

export type NotificationHooks = ReturnType<typeof makeNotificationHooks>;
