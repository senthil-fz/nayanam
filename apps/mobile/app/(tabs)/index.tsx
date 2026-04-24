// Home tab — orchestrates the Phase 4 layout. Matches the prototype
// `components/screen-home.jsx` top-to-bottom:
//   1. HomeHeader (avatar → settings, greeting, notification bell)
//   2. BalanceHero (gradient card + eye + sparkline + period tiles)
//   3. QuickActionsGrid (5 buttons)
//   4. BudgetPlaceholder (Phase 6 placeholder)
//   5. RecentActivity (segmented All / Income / Expenses, top-8)
//
// Quick actions open the Phase 3 bottom sheets via their imperative handles
// (AddTransactionSheet.present({type}), TransferSheet.present()), which is
// the existing external-open contract — no sheet extension required.

import { useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import type { Account, Category } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { useAuthStore } from '../../src/lib/api';
import {
  useAccounts,
  useCategories,
  useHomeStore,
  useHouseholds,
  useMe,
} from '../../src/lib/hooks';
import {
  AddTransactionSheet,
  type AddTransactionSheetHandle,
} from '../../src/features/transactions/AddTransactionSheet';
import {
  TransferSheet,
  type TransferSheetHandle,
} from '../../src/features/transactions/TransferSheet';
import {
  AddAccountSheet,
  type AddAccountSheetHandle,
} from '../../src/features/cards/AddAccountSheet';
import { HomeHeader } from '../../src/features/home/HomeHeader';
import { BalanceHero } from '../../src/features/home/BalanceHero';
import { QuickActionsGrid } from '../../src/features/home/QuickActionsGrid';
import { BudgetsWidget } from '../../src/features/home/BudgetsWidget';
import { RecentActivity } from '../../src/features/home/RecentActivity';

export default function HomeTab() {
  const me = useMe();
  const { data: householdsData } = useHouseholds();
  const activeId = useAuthStore((s) => s.activeHouseholdId);

  const accountsQuery = useAccounts({ includeArchived: true });
  const categoriesQuery = useCategories({ includeArchived: true });

  const accounts: Account[] = useMemo(
    () => accountsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [accountsQuery.data],
  );
  const categories: Category[] = useMemo(
    () => categoriesQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [categoriesQuery.data],
  );

  const households = householdsData ?? me.data?.households ?? [];
  const activeHousehold =
    households.find((h) => h.id === activeId) ?? households[0];

  const role = activeHousehold?.role;
  const canMutate = role !== 'VIEWER';
  const hasActiveAccounts = accounts.some((a) => !a.archivedAt);
  const lockReason = !canMutate
    ? 'Viewers cannot create transactions.'
    : !hasActiveAccounts
      ? 'Add an account first.'
      : undefined;
  const canOpenTransactionSheets = canMutate && hasActiveAccounts;

  const addSheetRef = useRef<AddTransactionSheetHandle>(null);
  const transferSheetRef = useRef<TransferSheetHandle>(null);
  const addAccountSheetRef = useRef<AddAccountSheetHandle>(null);

  const openAdd = (type: 'EXPENSE' | 'INCOME') => {
    if (!canOpenTransactionSheets) return;
    addSheetRef.current?.present({ type });
  };
  const openTransfer = () => {
    if (!canOpenTransactionSheets) return;
    transferSheetRef.current?.present();
  };

  // Pull-to-refresh — strict-keys invalidation of exactly the six Home queries
  // (spec §Mobile UX). Broad prefix invalidation was replaced because it also
  // refetched unrelated cache entries (full transactions lists used by the
  // Transactions tab, per-account detail queries, etc.).
  //   1. ['accounts']
  //   2. ['accounts', 'summary']
  //   3. ['accounts', 'balance-history-all', 14]
  //   4. ['transactions', 'period-summary', { period }]
  //   5. ['transactions', { limit: 8, type? }] — the recent-activity list.
  //      Segment (All/Income/Expenses) state lives inside RecentActivity,
  //      so we match exactly the Home-shaped entries via a predicate that
  //      keys on limit:8 in the normalized filter object. Only the Home
  //      screen uses limit:8, so scope is preserved.
  //   6. ['notifications', 'unread-count']
  const qc = useQueryClient();
  const period = useHomeStore((s) => s.period);
  const refreshing =
    me.isFetching ||
    accountsQuery.isFetching ||
    categoriesQuery.isFetching;

  const onRefresh = () => {
    void qc.invalidateQueries({ queryKey: ['accounts'] });
    void qc.invalidateQueries({ queryKey: ['accounts', 'summary'] });
    void qc.invalidateQueries({ queryKey: ['accounts', 'balance-history-all', 14] });
    void qc.invalidateQueries({
      queryKey: ['transactions', 'period-summary', { period }],
    });
    void qc.invalidateQueries({
      predicate: (query) => {
        const [root, filters] = query.queryKey;
        return (
          root === 'transactions' &&
          typeof filters === 'object' &&
          filters !== null &&
          (filters as { limit?: number }).limit === 8
        );
      },
    });
    void qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    void qc.invalidateQueries({ queryKey: ['budgets', 'status'] });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LIGHT.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <HomeHeader me={me.data} />
        <BalanceHero activeHousehold={activeHousehold} />
        <QuickActionsGrid
          canMutate={canOpenTransactionSheets}
          lockReason={lockReason}
          onAddExpense={() => openAdd('EXPENSE')}
          onAddIncome={() => openAdd('INCOME')}
          onTransfer={openTransfer}
        />
        <BudgetsWidget canMutate={canMutate} />
        <RecentActivity
          accounts={accounts}
          categories={categories}
          onAddFirst={() => {
            if (canOpenTransactionSheets) {
              openAdd('EXPENSE');
            } else if (canMutate && !hasActiveAccounts) {
              addAccountSheetRef.current?.present();
            }
          }}
        />
        {me.isLoading && !me.data ? (
          <View style={{ paddingVertical: 16, alignItems: 'center' }}>
            <ActivityIndicator color={LIGHT.textDim} />
          </View>
        ) : null}
      </ScrollView>

      <AddTransactionSheet ref={addSheetRef} />
      <TransferSheet ref={transferSheetRef} />
      <AddAccountSheet
        ref={addAccountSheetRef}
        defaultCurrencyCode={activeHousehold?.defaultCurrencyCode ?? 'USD'}
      />
    </SafeAreaView>
  );
}
