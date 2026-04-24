// Budgets stack screen. Orchestrates the suggestions row, the ordered list
// of budgets (drag-to-reorder for ADMIN+), and the Add / Edit / Actions /
// Detail sheets.
//
// Queries:
//   - useBudgetsStatus() — primary data source for the list (each row
//     renders progress, spent, remaining).
//   - useBudgets({ includeArchived: true }) — so we can show archived
//     rows behind a toggle and feed the actions sheet with the underlying
//     Budget (status endpoint also carries it but this keeps the reorder
//     call accurate).
//   - useCategories({ includeArchived: true }) — for icon / color lookup
//     and for deriving the exclude-set fed into the picker.

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import DraggableFlatList, {
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { Plus } from 'lucide-react-native';
import type {
  Budget,
  BudgetsStatusItemType,
  Category,
} from '@nayanam/core';
import { ACCENTS, LIGHT } from '@nayanam/ui-tokens';
import { useAuthStore } from '../../lib/api';
import {
  useBudgets,
  useBudgetsStatus,
  useCategories,
  useHomeStore,
  useHouseholds,
  useMe,
  useReorderBudgets,
} from '../../lib/hooks';
import {
  hapticError,
  hapticMedium,
  hapticSelection,
  hapticSuccess,
} from '../../lib/haptics';
import {
  AddBudgetSheet,
  type AddBudgetSheetHandle,
} from './AddBudgetSheet';
import {
  EditBudgetSheet,
  type EditBudgetSheetHandle,
} from './EditBudgetSheet';
import {
  BudgetActionsSheet,
  type BudgetActionsSheetHandle,
} from './BudgetActionsSheet';
import {
  BudgetDetailSheet,
  type BudgetDetailSheetHandle,
} from './BudgetDetailSheet';
import { BudgetsSuggestionsRow } from './BudgetsSuggestionsRow';
import { BudgetRow } from './BudgetRow';

export function BudgetsScreen() {
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
  const canReorder = canArchive;

  const statusQuery = useBudgetsStatus();
  const budgetsQuery = useBudgets({ includeArchived: false });
  const categoriesQuery = useCategories({ includeArchived: true });

  const categoriesById = useMemo(() => {
    const items: Category[] =
      categoriesQuery.data?.pages.flatMap((p) => p.items) ?? [];
    return new Map(items.map((c) => [c.id, c]));
  }, [categoriesQuery.data]);

  // Derive the raw Budget rows (for reorder payloads and action targets)
  // and align them with the status rows by id so row rendering has both
  // progress math and the underlying mutable record.
  const budgetsById = useMemo(() => {
    const items: Budget[] =
      budgetsQuery.data?.pages.flatMap((p) => p.items) ?? [];
    return new Map(items.map((b) => [b.id, b]));
  }, [budgetsQuery.data]);

  // The list order comes from `useBudgets` (display_order) so the reorder
  // payload maps cleanly; we overlay each row's status from `useBudgetsStatus`.
  const orderedStatus = useMemo<BudgetsStatusItemType[]>(() => {
    const statusById = new Map(
      (statusQuery.data?.items ?? []).map((s) => [s.budget.id, s]),
    );
    const out: BudgetsStatusItemType[] = [];
    for (const b of budgetsById.values()) {
      const s = statusById.get(b.id);
      if (s) out.push(s);
      else {
        // If a budget is paused / not in status (it would still appear when
        // status returns ACTIVE+PAUSED), build a minimal placeholder.
        out.push({
          budget: b,
          periodStart: b.startAt,
          periodEnd: b.startAt,
          effectiveAmountMinor: b.amountMinor,
          spentMinor: '0',
          remainingMinor: b.amountMinor,
          progressPercent: 0,
          rolloverCarryInMinor: '0',
          thresholdsFired: [],
          isOverspent: false,
          isOverThreshold: false,
        });
      }
    }
    return out;
  }, [statusQuery.data, budgetsById]);

  // Category ids already covered — fed into the picker so the user can't
  // double-create a per-category budget.
  const excludeCategoryIds = useMemo(() => {
    const out: string[] = [];
    for (const b of budgetsById.values()) {
      if (b.scope === 'CATEGORY' && b.categoryId) out.push(b.categoryId);
    }
    return out;
  }, [budgetsById]);

  const balancesHidden = useHomeStore((s) => s.balancesHidden);

  const addRef = useRef<AddBudgetSheetHandle>(null);
  const editRef = useRef<EditBudgetSheetHandle>(null);
  const actionsRef = useRef<BudgetActionsSheetHandle>(null);
  const detailRef = useRef<BudgetDetailSheetHandle>(null);

  const primaryCurrencyCode =
    activeHousehold?.defaultCurrencyCode ??
    me.data?.user.primaryCurrencyCode ??
    'USD';

  // Reorder wiring — local dragging state is kept in sync with the query data,
  // and we commit on drag end via the shared hook.
  const [dragOrder, setDragOrder] = useState<BudgetsStatusItemType[] | null>(
    null,
  );
  const data = dragOrder ?? orderedStatus;
  const reorderMut = useReorderBudgets();

  const commitReorder = useCallback(
    async (next: BudgetsStatusItemType[]) => {
      try {
        await reorderMut.mutateAsync({
          order: next.map((s, i) => ({
            id: s.budget.id,
            displayOrder: i,
          })),
        });
        hapticSuccess();
      } catch (err) {
        hapticError();
        console.warn('Reorder failed', err);
      } finally {
        setDragOrder(null);
      }
    },
    [reorderMut],
  );

  // Pull-to-refresh — narrow keys.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['budgets'] }),
        qc.invalidateQueries({ queryKey: ['budgets', 'status'] }),
        qc.invalidateQueries({ queryKey: ['budgets', 'suggest'] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [qc]);

  // Refetch on focus so coming back from Home reflects recent transactions.
  const refetchRef = useRef(statusQuery.refetch);
  refetchRef.current = statusQuery.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetchRef.current();
    }, []),
  );

  const openEdit = useCallback(
    (budget: Budget) => {
      const category = budget.categoryId
        ? (categoriesById.get(budget.categoryId) ?? null)
        : null;
      editRef.current?.present({ budget, category });
    },
    [categoriesById],
  );

  const openDetail = useCallback(
    (item: BudgetsStatusItemType) => {
      const category = item.budget.categoryId
        ? (categoriesById.get(item.budget.categoryId) ?? null)
        : null;
      detailRef.current?.present({ item, category });
    },
    [categoriesById],
  );

  const openActions = useCallback((item: BudgetsStatusItemType) => {
    actionsRef.current?.present({ budget: item.budget });
  }, []);

  const openAdd = useCallback(() => {
    hapticMedium();
    addRef.current?.present();
  }, []);

  const isLoading =
    statusQuery.isLoading || budgetsQuery.isLoading || categoriesQuery.isLoading;

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<BudgetsStatusItemType>) => {
      const category = item.budget.categoryId
        ? (categoriesById.get(item.budget.categoryId) ?? null)
        : null;
      return (
        <BudgetRow
          item={item}
          category={category}
          balancesHidden={balancesHidden}
          onPress={openDetail}
          onLongPress={openActions}
          onDragStart={
            canReorder
              ? () => {
                  hapticSelection();
                  drag();
                }
              : undefined
          }
          dragActive={isActive}
        />
      );
    },
    [balancesHidden, canReorder, categoriesById, openActions, openDetail],
  );

  const Header = (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 6,
        }}
      >
        <Text
          style={{
            flex: 1,
            fontSize: 22,
            fontWeight: '800',
            color: LIGHT.text,
            letterSpacing: -0.3,
          }}
        >
          Budgets
        </Text>
        {canMutate ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New budget"
            onPress={openAdd}
            style={({ pressed }) => ({
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: ACCENTS.indigo.hex,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Plus size={20} color="#fff" />
          </Pressable>
        ) : null}
      </View>

      {canMutate ? (
        <BudgetsSuggestionsRow
          onPick={({ category, suggestion }) => {
            addRef.current?.present({
              scope: 'CATEGORY',
              category,
              name: suggestion.categoryName,
              amountMinor: suggestion.suggestedAmountMinor,
              currencyCode: suggestion.currencyCode,
              period: 'MONTHLY',
            });
          }}
        />
      ) : null}
    </View>
  );

  const Empty = (
    <View
      style={{
        margin: 20,
        paddingVertical: 28,
        alignItems: 'center',
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: LIGHT.border,
        borderRadius: 20,
        gap: 10,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: '700', color: LIGHT.text }}>
        No budgets yet
      </Text>
      <Text
        style={{
          fontSize: 12,
          color: LIGHT.textDim,
          textAlign: 'center',
          paddingHorizontal: 24,
        }}
      >
        Set a ceiling and get notified at 50, 80, 100%.
      </Text>
      {canMutate ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add your first budget"
          onPress={openAdd}
          style={{
            marginTop: 4,
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 999,
            backgroundColor: ACCENTS.indigo.hex,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>
            Add your first budget
          </Text>
        </Pressable>
      ) : (
        <Text style={{ fontSize: 12, color: LIGHT.textFaint }}>
          Ask an owner to add a budget.
        </Text>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: LIGHT.bg }}>
      <DraggableFlatList
        data={data}
        keyExtractor={(s) => s.budget.id}
        renderItem={renderItem}
        ListHeaderComponent={Header}
        ListEmptyComponent={
          isLoading ? (
            <View style={{ paddingTop: 40, alignItems: 'center' }}>
              <ActivityIndicator color={LIGHT.textDim} />
            </View>
          ) : (
            Empty
          )
        }
        onDragBegin={() => hapticSelection()}
        onDragEnd={({ data: next }) => {
          setDragOrder(next);
          if (canReorder) void commitReorder(next);
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      />

      <AddBudgetSheet
        ref={addRef}
        defaultCurrencyCode={primaryCurrencyCode}
        excludeCategoryIds={excludeCategoryIds}
      />
      <EditBudgetSheet ref={editRef} />
      <BudgetActionsSheet
        ref={actionsRef}
        canArchive={canArchive}
        onEdit={openEdit}
      />
      <BudgetDetailSheet
        ref={detailRef}
        canArchive={canArchive}
        canPauseResume={canMutate}
        onEdit={openEdit}
      />
    </View>
  );
}
