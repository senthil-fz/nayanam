// Infinite-scrolling bills FlatList extracted from BillsScreen so the
// screen can drive it imperatively — the upcoming-timeline dot needs a
// `scrollToBillId()` handle that first re-filters to `all` and then jumps
// to the tapped row. Colocating the FlatList + its ref here keeps that
// one-directional.

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  type ListRenderItem,
  RefreshControl,
  View,
} from 'react-native';
import type { Bill } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';

export type BillsListHandle = {
  /**
   * Jump to the row identified by `billId` if it's in the current dataset.
   * Returns `true` on hit, `false` if the id isn't present — the caller
   * decides the fallback (detail nav, etc).
   */
  scrollToBillId: (billId: string) => boolean;
};

type Props = {
  bills: Bill[];
  renderItem: ListRenderItem<Bill>;
  listHeader: React.ReactElement;
  listEmpty: React.ReactElement;
  refreshing: boolean;
  onRefresh: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onEndReached: () => void;
};

export const BillsList = forwardRef<BillsListHandle, Props>(function BillsList(
  {
    bills,
    renderItem,
    listHeader,
    listEmpty,
    refreshing,
    onRefresh,
    hasNextPage,
    isFetchingNextPage,
    onEndReached,
  },
  ref,
) {
  const listRef = useRef<FlatList<Bill>>(null);
  const billsRef = useRef(bills);
  billsRef.current = bills;

  useImperativeHandle(
    ref,
    () => ({
      scrollToBillId: (billId: string) => {
        const idx = billsRef.current.findIndex((b) => b.id === billId);
        if (idx < 0) return false;
        // +1 accounts for the header row rendered as ListHeaderComponent.
        listRef.current?.scrollToIndex({
          index: idx,
          animated: true,
          viewPosition: 0.3,
        });
        return true;
      },
    }),
    [],
  );

  const handleScrollFail = useCallback(
    ({ index }: { index: number }) => {
      // Row wasn't measured yet (fresh mount or just-changed filter).
      // Retry after a tick — by then the filter swap has rendered the row.
      setTimeout(() => {
        listRef.current?.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.3,
        });
      }, 80);
    },
    [],
  );

  return (
    <FlatList
      ref={listRef}
      data={bills}
      keyExtractor={(b) => b.id}
      renderItem={renderItem}
      ListHeaderComponent={listHeader}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage) {
          onEndReached();
        }
      }}
      onScrollToIndexFailed={handleScrollFail}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={LIGHT.text}
        />
      }
      ListEmptyComponent={listEmpty}
      ListFooterComponent={
        isFetchingNextPage ? (
          <View style={{ paddingVertical: 16 }}>
            <ActivityIndicator color={LIGHT.textDim} />
          </View>
        ) : null
      }
    />
  );
});
