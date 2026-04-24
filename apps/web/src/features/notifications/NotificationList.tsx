// Infinite-scroll notification list grouped by day. Today / Yesterday / long-
// form date in the device time zone.

import { useEffect, useMemo, useRef, useState } from 'react';
// useRef is used below for the IntersectionObserver sentinel.
import { useRouter } from '@tanstack/react-router';
import type { Notification, NotificationCategory } from '@nayanam/core';
import { resolveNotificationRoute } from '@nayanam/core';
import {
  useDeleteNotification,
  useMarkNotificationRead,
  useMarkNotificationUnread,
  useNotifications,
} from '../../lib/hooks';
import { NotificationRow } from './NotificationRow';
import { EmptyNotificationCenter } from './EmptyNotificationCenter';

type Props = {
  category: NotificationCategory | undefined;
  onRowNavigate: () => void;
};

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string, nowMs: number): string {
  const d = new Date(iso);
  const now = new Date(nowMs);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, now)) return 'Today';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

export function NotificationList({ category, onRowNavigate }: Props) {
  const query = useNotifications({ unreadOnly: false, category });
  const markRead = useMarkNotificationRead();
  const markUnread = useMarkNotificationUnread();
  const del = useDeleteNotification();
  const router = useRouter();

  const items = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );
  // Tick a "now" timestamp every minute. Seeded lazily via `useState` init
  // (which is render-pure because React calls the initializer only once) and
  // updated via an interval — no impurity in the render body.
  const [renderNow, setRenderNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setRenderNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && query.hasNextPage && !query.isFetchingNextPage) {
        void query.fetchNextPage();
      }
    });
    io.observe(node);
    return () => io.disconnect();
  }, [query]);

  if (query.isLoading) {
    return (
      <div className="space-y-1 px-3 py-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface-alt)]"
          />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="px-3 py-6 text-center text-xs text-[var(--color-negative)]">
        Couldn&apos;t load notifications.
      </div>
    );
  }

  if (items.length === 0) {
    return <EmptyNotificationCenter />;
  }

  const groups = new Map<string, { label: string; rows: Notification[] }>();
  for (const n of items) {
    const key = dayKey(n.createdAt);
    let g = groups.get(key);
    if (!g) {
      g = { label: dayLabel(n.createdAt, renderNow), rows: [] };
      groups.set(key, g);
    }
    g.rows.push(n);
  }

  const onRowClick = (n: Notification) => {
    if (n.readAt === null) {
      markRead.mutate({ notificationId: n.id });
    }
    const target = resolveNotificationRoute(n).web;
    onRowNavigate();
    if (target) {
      void router.navigate({ to: target });
    }
  };

  return (
    <div>
      {[...groups.entries()].map(([key, g]) => (
        <div key={key}>
          <div className="sticky top-0 z-[1] border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
            {g.label}
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {g.rows.map((n) => (
              <NotificationRow
                key={n.id}
                notification={n}
                now={renderNow}
                onClick={() => onRowClick(n)}
                onMarkRead={() =>
                  markRead.mutate({ notificationId: n.id })
                }
                onMarkUnread={() =>
                  markUnread.mutate({ notificationId: n.id })
                }
                onDelete={() => del.mutate({ notificationId: n.id })}
              />
            ))}
          </div>
        </div>
      ))}
      <div ref={sentinelRef} className="h-4" aria-hidden />
      {query.isFetchingNextPage ? (
        <div className="py-2 text-center text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
          Loading…
        </div>
      ) : null}
    </div>
  );
}
