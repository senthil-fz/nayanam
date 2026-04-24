// Transactions tab — sticky header with segmented type filter + search bar,
// filter chips for account/category/date, day-grouped infinite list,
// swipe-to-edit / swipe-to-delete, and entry points for the Add and
// Transfer sheets.

import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { ACCENTS, LIGHT } from '@nayanam/ui-tokens';
import type { Account, Category, Transaction } from '@nayanam/core';
import { ulid } from 'ulid';
import { apiClient } from '../../src/lib/api';
import { queryClient } from '../../src/lib/query-client';
import {
  useAccounts,
  useCategories,
  useTransactions,
} from '../../src/lib/hooks';
import {
  AddTransactionSheet,
  type AddTransactionSheetHandle,
} from '../../src/features/transactions/AddTransactionSheet';
import {
  EditTransactionSheet,
  type EditTransactionSheetHandle,
} from '../../src/features/transactions/EditTransactionSheet';
import {
  TransferSheet,
  type TransferSheetHandle,
} from '../../src/features/transactions/TransferSheet';
import {
  AccountPickerSheet,
  type AccountPickerSheetHandle,
} from '../../src/features/transactions/AccountPickerSheet';
import {
  CategoryPickerSheet,
  type CategoryPickerSheetHandle,
} from '../../src/features/transactions/CategoryPickerSheet';
import {
  DateRangePickerSheet,
  type DateRangePickerSheetHandle,
} from '../../src/features/transactions/DateRangePickerSheet';
import { FilterChips } from '../../src/features/transactions/FilterChips';
import { SearchBar } from '../../src/features/transactions/SearchBar';
import {
  TypeSegmented,
  type TypeFilterValue,
} from '../../src/features/transactions/TypeSegmented';
import { DayGroupHeader } from '../../src/features/transactions/DayGroupHeader';
import { SwipeableTransactionRow } from '../../src/features/transactions/SwipeableTransactionRow';
import { buildListItems, type ListItem } from '../../src/features/transactions/group';
import { confirmDeleteTransaction } from '../../src/features/transactions/DeleteConfirmSheet';
import { PlusIcon } from '../../src/features/cards/icons';

export default function TransactionsTab() {
  const addSheetRef = useRef<AddTransactionSheetHandle>(null);
  const editSheetRef = useRef<EditTransactionSheetHandle>(null);
  const transferSheetRef = useRef<TransferSheetHandle>(null);
  const accountPickerRef = useRef<AccountPickerSheetHandle>(null);
  const categoryPickerRef = useRef<CategoryPickerSheetHandle>(null);
  const datePickerRef = useRef<DateRangePickerSheetHandle>(null);

  // Filter state
  const [typeFilter, setTypeFilter] = useState<TypeFilterValue>('ALL');
  const [accountFilter, setAccountFilter] = useState<Account | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<Category | null>(null);
  const [dateRange, setDateRange] = useState<{ from: string | null; to: string | null }>({
    from: null,
    to: null,
  });
  const [q, setQ] = useState('');

  const query = useTransactions({
    type: typeFilter === 'ALL' ? undefined : typeFilter,
    accountId: accountFilter ? [accountFilter.id] : undefined,
    categoryId: categoryFilter ? [categoryFilter.id] : undefined,
    from: dateRange.from ? new Date(dateRange.from).toISOString() : undefined,
    to: dateRange.to ? new Date(dateRange.to).toISOString() : undefined,
    q: q.trim() || undefined,
    limit: 50,
  });

  // Pre-fetched account + category lookups used to hydrate row metadata
  // without spawning N point queries.
  const accountsQuery = useAccounts({ includeArchived: true });
  const accountsById = useMemo(() => {
    const m = new Map<string, Account>();
    for (const p of accountsQuery.data?.pages ?? []) for (const a of p.items) m.set(a.id, a);
    return m;
  }, [accountsQuery.data]);

  const categoriesQuery = useCategories({ includeArchived: true });
  const categoriesById = useMemo(() => {
    const m = new Map<string, Category>();
    for (const p of categoriesQuery.data?.pages ?? []) for (const c of p.items) m.set(c.id, c);
    return m;
  }, [categoriesQuery.data]);

  const items = useMemo<ListItem[]>(
    () => buildListItems(query.data?.pages),
    [query.data],
  );

  // Delete mutations are fired directly against the api client (the shared
  // hooks bake the id into the closure; we'd need one hook per row). After
  // deletion, invalidate the same keys the shared hooks would have.
  const invalidateAfterDelete = useCallback((accountIds: string[]) => {
    void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    void queryClient.invalidateQueries({ queryKey: ['transfers'] });
    void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    void queryClient.invalidateQueries({ queryKey: ['accounts', 'summary'] });
    for (const id of accountIds) {
      void queryClient.invalidateQueries({ queryKey: ['accounts', id] });
      void queryClient.invalidateQueries({
        queryKey: ['accounts', id, 'balance-history'],
      });
    }
  }, []);

  const deleteTxn = useCallback(
    async (id: string) => {
      const res = await apiClient.deleteTransaction(id, ulid());
      invalidateAfterDelete([res.accountId]);
    },
    [invalidateAfterDelete],
  );

  const deleteXfer = useCallback(
    async (id: string) => {
      const res = await apiClient.deleteTransfer(id, ulid());
      invalidateAfterDelete([
        res.transfer.sourceAccountId,
        res.transfer.destinationAccountId,
      ]);
    },
    [invalidateAfterDelete],
  );

  const onRowEdit = useCallback((t: Transaction) => {
    editSheetRef.current?.present(t);
  }, []);

  const onRowDelete = useCallback(
    (t: Transaction) => {
      const label = categoriesById.get(t.categoryId)?.label ?? 'Transaction';
      confirmDeleteTransaction(
        { id: t.id, transferId: t.transferId, label },
        async () => {
          if (t.transferId) await deleteXfer(t.transferId);
          else await deleteTxn(t.id);
        },
      );
    },
    [categoriesById, deleteTxn, deleteXfer],
  );

  // Refetch on focus — filters cover most state, but invalidation from
  // background syncs (push events etc.) lands in a later phase. We stash
  // `refetch` in a ref so the callback is stable and the effect runs
  // exactly on focus transitions rather than on every parent re-render.
  const refetchRef = useRef(query.refetch);
  refetchRef.current = query.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetchRef.current();
    }, []),
  );

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.kind === 'header') return <DayGroupHeader iso={item.iso} />;
      const t = item.transaction;
      const isDest = Boolean(
        t.transferId && accountFilter && t.accountId === accountFilter.id,
      );
      return (
        <SwipeableTransactionRow
          transaction={t}
          account={accountsById.get(t.accountId)}
          category={categoriesById.get(t.categoryId)}
          isTransferDestination={isDest}
          onEdit={() => onRowEdit(t)}
          onDelete={() => onRowDelete(t)}
          hideEdit={Boolean(t.transferId)}
        />
      );
    },
    [accountsById, categoriesById, accountFilter, onRowEdit, onRowDelete],
  );

  const dateLabel = useMemo(() => {
    if (!dateRange.from && !dateRange.to) return null;
    return `${dateRange.from ?? '…'} → ${dateRange.to ?? '…'}`;
  }, [dateRange]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LIGHT.bg }} edges={['top']}>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text style={{ fontSize: 28, fontWeight: '700', color: LIGHT.text, letterSpacing: -0.5 }}>
          Transactions
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New transfer"
            onPress={() => transferSheetRef.current?.present()}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: LIGHT.chipBg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 16, color: LIGHT.text }}>⇄</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add transaction"
            onPress={() => addSheetRef.current?.present()}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: ACCENTS.indigo.hex,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <PlusIcon size={18} color="#fff" />
          </Pressable>
        </View>
      </View>

      <TypeSegmented value={typeFilter} onChange={setTypeFilter} />

      <View style={{ paddingVertical: 4 }}>
        <SearchBar value={q} onChange={setQ} />
      </View>

      <FilterChips
        accountLabel={accountFilter?.nickname ?? null}
        categoryLabel={categoryFilter?.label ?? null}
        dateLabel={dateLabel}
        onAccountPress={() => accountPickerRef.current?.present()}
        onCategoryPress={() => categoryPickerRef.current?.present()}
        onDatePress={() => datePickerRef.current?.present()}
        onClearAccount={() => setAccountFilter(null)}
        onClearCategory={() => setCategoryFilter(null)}
        onClearDate={() => setDateRange({ from: null, to: null })}
      />

      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) {
            void query.fetchNextPage();
          }
        }}
        windowSize={7}
        removeClippedSubviews
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            onRefresh={() => void query.refetch()}
            tintColor={LIGHT.text}
          />
        }
        ListEmptyComponent={
          <View style={{ paddingTop: 80, alignItems: 'center' }}>
            <Text style={{ fontSize: 17, fontWeight: '600', color: LIGHT.text }}>
              {query.isLoading ? 'Loading…' : 'No transactions yet'}
            </Text>
            {!query.isLoading ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add your first transaction"
                onPress={() => addSheetRef.current?.present()}
                style={{
                  marginTop: 16,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 999,
                  backgroundColor: ACCENTS.indigo.hex,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  Add your first
                </Text>
              </Pressable>
            ) : null}
          </View>
        }
      />

      <AddTransactionSheet ref={addSheetRef} />
      <EditTransactionSheet ref={editSheetRef} />
      <TransferSheet ref={transferSheetRef} />
      <AccountPickerSheet
        ref={accountPickerRef}
        selectedId={accountFilter?.id ?? null}
        includeArchived
        onSelect={(a) => setAccountFilter(a)}
      />
      <CategoryPickerSheet
        ref={categoryPickerRef}
        typeFilter={
          typeFilter === 'INCOME' || typeFilter === 'EXPENSE' ? typeFilter : undefined
        }
        selectedId={categoryFilter?.id ?? null}
        onSelect={(c) => setCategoryFilter(c)}
      />
      <DateRangePickerSheet
        ref={datePickerRef}
        value={dateRange}
        onChange={setDateRange}
      />
    </SafeAreaView>
  );
}

