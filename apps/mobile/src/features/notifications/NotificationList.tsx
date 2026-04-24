// Infinite-scroll notification list grouped by day (Today / Yesterday /
// long-form date in the device timezone). Tap a row: mark-read → close sheet →
// router.push the mobile route. Long-press: Alert with mark-unread / delete.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import {
  resolveNotificationRoute,
  type Notification,
  type NotificationCategory,
} from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { useQueryClient } from '@tanstack/react-query';
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

type ListRow =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'row'; key: string; notification: Notification };

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
  const router = useRouter();
  const qc = useQueryClient();
  const query = useNotifications({ unreadOnly: false, category });
  const markRead = useMarkNotificationRead();
  const markUnread = useMarkNotificationUnread();
  const del = useDeleteNotification();

  const items = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );

  const [renderNow, setRenderNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setRenderNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo<ListRow[]>(() => {
    const out: ListRow[] = [];
    let prevKey: string | null = null;
    for (const n of items) {
      const k = dayKey(n.createdAt);
      if (k !== prevKey) {
        out.push({
          kind: 'header',
          key: `hdr-${k}`,
          label: dayLabel(n.createdAt, renderNow),
        });
        prevKey = k;
      }
      out.push({ kind: 'row', key: n.id, notification: n });
    }
    return out;
  }, [items, renderNow]);

  const onRowPress = useCallback(
    (n: Notification) => {
      if (n.readAt === null) {
        markRead.mutate({ notificationId: n.id });
      }
      const target = resolveNotificationRoute(n).mobile;
      onRowNavigate();
      if (target) {
        router.push(target);
      }
    },
    [markRead, onRowNavigate, router],
  );

  const onEndReached = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage();
    }
  }, [query]);

  const onRefresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['notifications'] });
  }, [qc]);

  if (query.isLoading) {
    return (
      <View style={{ paddingVertical: 24 }}>
        <ActivityIndicator color={LIGHT.textDim} />
      </View>
    );
  }
  if (query.isError) {
    return (
      <View style={{ paddingVertical: 24, alignItems: 'center' }}>
        <Text style={{ fontSize: 12, color: LIGHT.negative }}>
          Couldn&apos;t load notifications.
        </Text>
      </View>
    );
  }
  if (items.length === 0) {
    return <EmptyNotificationCenter />;
  }

  return (
    <BottomSheetFlatList<ListRow>
      data={rows}
      keyExtractor={(r) => r.key}
      onEndReachedThreshold={0.3}
      onEndReached={onEndReached}
      refreshing={query.isRefetching}
      onRefresh={onRefresh}
      ListFooterComponent={
        query.isFetchingNextPage ? (
          <View style={{ paddingVertical: 12, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={LIGHT.textDim} />
          </View>
        ) : null
      }
      renderItem={({ item }) => {
        if (item.kind === 'header') {
          return (
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 6,
                backgroundColor: LIGHT.bg,
                borderBottomWidth: 1,
                borderBottomColor: LIGHT.border,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  color: LIGHT.textDim,
                  fontFamily: 'Geist Mono',
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                }}
              >
                {item.label}
              </Text>
            </View>
          );
        }
        const n = item.notification;
        return (
          <NotificationRow
            notification={n}
            now={renderNow}
            onPress={() => onRowPress(n)}
            onMarkUnread={() =>
              markUnread.mutate({ notificationId: n.id })
            }
            onDelete={() => del.mutate({ notificationId: n.id })}
          />
        );
      }}
    />
  );
}
