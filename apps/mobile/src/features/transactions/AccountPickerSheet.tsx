// Bottom-sheet account picker. Used inside the Add/Edit transaction sheets
// and the Transfer sheet (with `excludeId` + `currencyFilter`).

import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import type { Account } from '@nayanam/core';
import { formatMoney } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { useAccounts } from '../../lib/hooks';
import { hapticSelection } from '../../lib/haptics';

export type AccountPickerSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

type Props = {
  selectedId?: string | null;
  /** Hide this account from the list (used by TransferSheet for destination). */
  excludeId?: string | null;
  /** Restrict to accounts in this currency (used by TransferSheet). */
  currencyFilter?: string | null;
  /** Include archived accounts in the list (read-only context). */
  includeArchived?: boolean;
  onSelect: (account: Account) => void;
};

export const AccountPickerSheet = forwardRef<AccountPickerSheetHandle, Props>(
  function AccountPickerSheet(
    { selectedId, excludeId, currencyFilter, includeArchived, onSelect },
    ref,
  ) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const snapPoints = useMemo(() => ['65%'], []);

    useImperativeHandle(ref, () => ({
      present: () => sheetRef.current?.present(),
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const query = useAccounts({ includeArchived: includeArchived ?? false });
    const items = useMemo<Account[]>(() => {
      const all = query.data?.pages.flatMap((p) => p.items) ?? [];
      return all.filter(
        (a) =>
          a.id !== excludeId &&
          (!currencyFilter || a.currencyCode === currencyFilter),
      );
    }, [query.data, excludeId, currencyFilter]);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.35}
        />
      ),
      [],
    );

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: LIGHT.bg }}
        handleIndicatorStyle={{ backgroundColor: LIGHT.border }}
      >
        <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: LIGHT.text }}>
            Choose account
          </Text>
          {currencyFilter ? (
            <Text
              style={{
                fontSize: 11,
                color: LIGHT.textFaint,
                fontFamily: 'Geist Mono',
                letterSpacing: 0.4,
                marginTop: 2,
              }}
            >
              FILTERED TO {currencyFilter}
            </Text>
          ) : null}
        </View>
        <FlatList
          data={items}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Account ${item.nickname}, ${item.currencyCode}`}
              onPress={() => {
                hapticSelection();
                onSelect(item);
                sheetRef.current?.dismiss();
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor:
                  item.id === selectedId
                    ? LIGHT.chipBg
                    : pressed
                      ? LIGHT.chipBg
                      : 'transparent',
              })}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: '600',
                    color: LIGHT.text,
                  }}
                >
                  {item.nickname}
                  {item.archivedAt ? ' · archived' : ''}
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    color: LIGHT.textFaint,
                    fontFamily: 'Geist Mono',
                    letterSpacing: 0.4,
                    marginTop: 2,
                  }}
                >
                  {item.currencyCode} · {item.type}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: 'Geist Mono',
                  color: LIGHT.textDim,
                }}
              >
                {formatMoney(item.cachedBalanceMinor, item.currencyCode)}
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={{ padding: 20, color: LIGHT.textDim, textAlign: 'center' }}>
              No accounts match.
            </Text>
          }
        />
      </BottomSheetModal>
    );
  },
);
