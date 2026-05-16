// Bills tab orchestrator. Matches prototype screen-bills.jsx layout:
//   1. Header (title + search + add)
//   2. BillsTotalsCard (per-currency monthly cost + due soon)
//   3. UpcomingTimeline (14-day horizontal strip)
//   4. BillsFilterChips (All / Due Soon / Active / Paused)
//   5. BillsList (infinite FlatList with SwipeableBillRow)

import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type {
  Account,
  Bill,
  BillsListFilter,
  Category,
} from '@nayanam/core';
import { ACCENTS, LIGHT } from '@nayanam/ui-tokens';
import { useAuthStore } from '../../lib/api';
import {
  useAccounts,
  useArchiveBill,
  useBills,
  useBillsSummary,
  useBillsUpcoming,
  useCategories,
  useHomeStore,
  useHouseholds,
  useMe,
  usePauseBill,
  useResumeBill,
} from '../../lib/hooks';
import { hapticError, hapticSuccess } from '../../lib/haptics';
import { logWarn } from '../../lib/log';
import { BillsHeader } from './BillsHeader';
import { BillsTotalsCard } from './BillsTotalsCard';
import { UpcomingTimeline } from './UpcomingTimeline';
import { BillsFilterChips } from './BillsFilterChips';
import { SwipeableBillRow } from './SwipeableBillRow';
import { AddBillSheet, type AddBillSheetHandle } from './AddBillSheet';
import { MarkPaidSheet, type MarkPaidSheetHandle } from './MarkPaidSheet';
import { BillsList, type BillsListHandle } from './BillsList';

export function BillsScreen() {
  const router = useRouter();
  const qc = useQueryClient();

  const me = useMe();
  const { data: householdsData } = useHouseholds();
  const activeId = useAuthStore((s) => s.activeHouseholdId);
  const households = householdsData ?? me.data?.households ?? [];
  const activeHousehold =
    households.find((h) => h.id === activeId) ?? households[0];
  const role = activeHousehold?.role;
  const canMutate = role === 'OWNER' || role === 'ADMIN' || role === 'MEMBER';
  const canArchive = role === 'OWNER' || role === 'ADMIN';

  const balancesHidden = useHomeStore((s) => s.balancesHidden);

  const [filter, setFilter] = useState<BillsListFilter>('all');
  const [query, setQuery] = useState('');

  const summaryQuery = useBillsSummary();
  const upcomingQuery = useBillsUpcoming(14);
  const billsQuery = useBills({ filter });

  const accountsQuery = useAccounts({ includeArchived: true });
  const categoriesQuery = useCategories({ includeArchived: true });

  const accounts: Account[] = useMemo(
    () => accountsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [accountsQuery.data],
  );
  const accountsById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  const categories: Category[] = useMemo(
    () => categoriesQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [categoriesQuery.data],
  );
  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const bills: Bill[] = useMemo(
    () => billsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [billsQuery.data],
  );

  const filteredBills = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bills;
    return bills.filter((b) => b.name.toLowerCase().includes(q));
  }, [bills, query]);

  const addRef = useRef<AddBillSheetHandle>(null);
  const markPaidRef = useRef<MarkPaidSheetHandle>(null);

  const listRef = useRef<BillsListHandle>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  // Pull-to-refresh — narrow keys, matching Phase 4 discipline.
  const onRefresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['bills'] });
    void qc.invalidateQueries({ queryKey: ['bills', 'summary'] });
    void qc.invalidateQueries({ queryKey: ['bills', 'upcoming', 14] });
    void qc.invalidateQueries({ queryKey: ['accounts', 'summary'] });
  }, [qc]);

  const refreshing =
    billsQuery.isRefetching && !billsQuery.isFetchingNextPage;

  // Refetch on focus — mirrors the Transactions tab pattern.
  const refetchRef = useRef(billsQuery.refetch);
  refetchRef.current = billsQuery.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetchRef.current();
    }, []),
  );

  const openDetail = useCallback(
    (bill: Bill) => {
      router.push(`/bills/${bill.id}`);
    },
    [router],
  );

  const flashThenClear = useCallback((billId: string) => {
    setFlashId(billId);
    setTimeout(() => setFlashId((v) => (v === billId ? null : v)), 1500);
  }, []);

  // Timeline-dot tap: primary path is filter→scroll so the tapped bill is
  // reachable in the list. If the bill is already visible in the current
  // filter, we just scroll. If not, we widen to 'all' first — the list
  // re-renders with the full dataset and `scrollToBillId` can then hit
  // the row. Detail nav is kept only as a last-resort fallback when the
  // bill isn't in the loaded (or infinite-paginated) dataset at all.
  const onTimelineDot = useCallback(
    (billId: string) => {
      const visible = listRef.current?.scrollToBillId(billId) ?? false;
      if (visible) {
        flashThenClear(billId);
        return;
      }
      // Not in the current filter: swap to 'all'. The list re-renders on
      // the next tick; `onScrollToIndexFailed` inside BillsList retries
      // after 80ms so we can safely attempt the scroll synchronously.
      setFilter('all');
      setTimeout(() => {
        const hit = listRef.current?.scrollToBillId(billId) ?? false;
        if (hit) {
          flashThenClear(billId);
        } else {
          // Dataset doesn't contain it (not yet paginated) — last-resort
          // detail nav matches the UpcomingTimeline response shape which
          // always includes the bill summary, so we can build nav from
          // the id directly.
          router.push(`/bills/${billId}`);
        }
      }, 50);
    },
    [flashThenClear, router],
  );

  const pauseMut = usePauseBill();
  const resumeMut = useResumeBill();
  const archiveMut = useArchiveBill();

  const pauseOrResume = useCallback(
    async (bill: Bill) => {
      try {
        if (bill.status === 'PAUSED') {
          await resumeMut.mutateAsync({ billId: bill.id });
        } else {
          await pauseMut.mutateAsync({ billId: bill.id });
        }
        hapticSuccess();
      } catch (err) {
        hapticError();
        logWarn('Pause/resume failed', err);
      }
    },
    [pauseMut, resumeMut],
  );

  const archive = useCallback(
    async (bill: Bill) => {
      try {
        await archiveMut.mutateAsync({ billId: bill.id });
        hapticSuccess();
      } catch (err) {
        hapticError();
        logWarn('Archive failed', err);
      }
    },
    [archiveMut],
  );

  const onMarkPaid = useCallback(
    (bill: Bill) => {
      markPaidRef.current?.present({
        bill,
        account: accountsById.get(bill.accountId) ?? null,
        category: categoriesById.get(bill.categoryId) ?? null,
      });
    },
    [accountsById, categoriesById],
  );

  const renderItem = useCallback(
    ({ item }: { item: Bill }) => (
      <SwipeableBillRow
        bill={item}
        category={categoriesById.get(item.categoryId)}
        balancesHidden={balancesHidden}
        canMarkPaid={canMutate}
        canPauseResume={canMutate}
        canArchive={canArchive}
        onOpen={openDetail}
        onMarkPaid={onMarkPaid}
        onPauseResume={(b) => void pauseOrResume(b)}
        onArchive={(b) => void archive(b)}
        flash={flashId === item.id}
      />
    ),
    [
      archive,
      balancesHidden,
      canArchive,
      canMutate,
      categoriesById,
      flashId,
      onMarkPaid,
      openDetail,
      pauseOrResume,
    ],
  );

  const primaryCurrencyCode =
    activeHousehold?.defaultCurrencyCode ??
    me.data?.user.primaryCurrencyCode ??
    undefined;

  const listHeader = useMemo(
    () => (
      <View>
        <BillsHeader
          query={query}
          onQueryChange={setQuery}
          canAdd={canMutate}
          onAdd={() => addRef.current?.present()}
        />
        <BillsTotalsCard
          summary={summaryQuery.data}
          isLoading={summaryQuery.isLoading}
          isError={summaryQuery.isError}
          primaryCurrencyCode={primaryCurrencyCode}
          balancesHidden={balancesHidden}
        />
        <UpcomingTimeline
          data={upcomingQuery.data}
          isLoading={upcomingQuery.isLoading}
          isError={upcomingQuery.isError}
          onDotPress={onTimelineDot}
        />
        <BillsFilterChips value={filter} onChange={setFilter} />
      </View>
    ),
    [
      balancesHidden,
      canMutate,
      filter,
      onTimelineDot,
      primaryCurrencyCode,
      query,
      summaryQuery.data,
      summaryQuery.isError,
      summaryQuery.isLoading,
      upcomingQuery.data,
      upcomingQuery.isError,
      upcomingQuery.isLoading,
    ],
  );

  const listEmpty = (
    <ListEmpty
      isLoading={billsQuery.isLoading}
      hasQuery={query.trim().length > 0}
      canAdd={canMutate}
      onAdd={() => addRef.current?.present()}
    />
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LIGHT.bg }} edges={['top']}>
      <BillsList
        ref={listRef}
        bills={filteredBills}
        renderItem={renderItem}
        listHeader={listHeader}
        listEmpty={listEmpty}
        refreshing={refreshing}
        onRefresh={onRefresh}
        hasNextPage={billsQuery.hasNextPage ?? false}
        isFetchingNextPage={billsQuery.isFetchingNextPage}
        onEndReached={() => void billsQuery.fetchNextPage()}
      />

      <AddBillSheet
        ref={addRef}
        defaultCurrencyCode={primaryCurrencyCode ?? 'USD'}
      />
      <MarkPaidSheet ref={markPaidRef} />
    </SafeAreaView>
  );
}

function ListEmpty({
  isLoading,
  hasQuery,
  canAdd,
  onAdd,
}: {
  isLoading: boolean;
  hasQuery: boolean;
  canAdd: boolean;
  onAdd: () => void;
}) {
  if (isLoading) {
    return (
      <View style={{ paddingTop: 60, alignItems: 'center' }}>
        <ActivityIndicator color={LIGHT.textDim} />
      </View>
    );
  }
  if (hasQuery) {
    return (
      <View style={{ paddingTop: 40, alignItems: 'center' }}>
        <Text style={{ color: LIGHT.textDim, fontSize: 13 }}>
          No bills match your search.
        </Text>
      </View>
    );
  }
  return (
    <View
      style={{
        marginTop: 32,
        paddingVertical: 32,
        alignItems: 'center',
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: LIGHT.border,
        borderRadius: 20,
        gap: 10,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: '600', color: LIGHT.text }}>
        No bills yet
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: LIGHT.textDim,
          textAlign: 'center',
          paddingHorizontal: 24,
        }}
      >
        Track your subscriptions in one place.
      </Text>
      {canAdd ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add your first bill"
          onPress={onAdd}
          style={{
            marginTop: 6,
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 999,
            backgroundColor: ACCENTS.indigo.hex,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>
            Add your first bill
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
