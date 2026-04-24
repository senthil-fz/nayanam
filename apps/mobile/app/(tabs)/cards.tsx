// Cards tab — mobile parity with web Cards screen. Matches the prototype
// `screen-cards.jsx` top-nav + stacked deck + quick-actions layout, adapted
// for a horizontal swipe-through on mobile.

import { useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ACCENTS, LIGHT } from '@nayanam/ui-tokens';
import type { components } from '@nayanam/contracts';
import { useAccounts, useMe } from '../../src/lib/hooks';
import { CardCarousel } from '../../src/features/cards/CardCarousel';
import { SelectedCardSummary } from '../../src/features/cards/SelectedCardSummary';
import { QuickActions } from '../../src/features/cards/QuickActions';
import { AddAccountSheet, type AddAccountSheetHandle } from '../../src/features/cards/AddAccountSheet';
import { EditAccountSheet, type EditAccountSheetHandle } from '../../src/features/cards/EditAccountSheet';
import { ArchivedList } from '../../src/features/cards/ArchivedList';
import { ReorderMode } from '../../src/features/cards/ReorderMode';
import { EmptyState } from '../../src/features/cards/EmptyState';
import { PlusIcon } from '../../src/features/cards/icons';
import { hapticLight, hapticMedium } from '../../src/lib/haptics';

type Account = components['schemas']['Account'];

export default function CardsTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const me = useMe();
  const [showArchived, setShowArchived] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [reordering, setReordering] = useState(false);

  const addSheetRef = useRef<AddAccountSheetHandle>(null);
  const editSheetRef = useRef<EditAccountSheetHandle>(null);

  const accountsQuery = useAccounts({ includeArchived: showArchived });

  const allAccounts = useMemo<Account[]>(
    () => (accountsQuery.data?.pages ?? []).flatMap((p) => p.items),
    [accountsQuery.data?.pages],
  );
  const activeAccounts = useMemo(
    () => allAccounts.filter((a) => !a.archivedAt),
    [allAccounts],
  );
  const archivedAccounts = useMemo(
    () => allAccounts.filter((a) => a.archivedAt),
    [allAccounts],
  );

  const selected = activeAccounts[selectedIndex] ?? activeAccounts[0];
  const defaultCurrency =
    me.data?.households?.[0]?.defaultCurrencyCode ?? 'USD';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LIGHT.bg }} edges={['top']}>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 8,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text style={{ fontSize: 28, fontWeight: '700', color: LIGHT.text, letterSpacing: -0.5 }}>
          Accounts
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {activeAccounts.length > 1 && !reordering && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reorder cards"
              onLongPress={() => {
                hapticMedium();
                setReordering(true);
              }}
              onPress={() => {
                hapticLight();
                setReordering(true);
              }}
              style={{
                paddingHorizontal: 12,
                height: 38,
                borderRadius: 19,
                backgroundColor: LIGHT.chipBg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: LIGHT.text, fontSize: 12, fontWeight: '600' }}>
                Reorder
              </Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add account"
            onPress={() => addSheetRef.current?.present()}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: LIGHT.chipBg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <PlusIcon size={20} color={LIGHT.text} />
          </Pressable>
        </View>
      </View>

      {reordering ? (
        <ReorderMode accounts={activeAccounts} onDone={() => setReordering(false)} />
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingBottom: insets.bottom + 120,
          }}
          refreshControl={
            <RefreshControl
              refreshing={accountsQuery.isRefetching}
              onRefresh={() => accountsQuery.refetch()}
              tintColor={ACCENTS.indigo.hex}
            />
          }
        >
          {activeAccounts.length === 0 ? (
            <EmptyState onAdd={() => addSheetRef.current?.present()} />
          ) : (
            <>
              <CardCarousel
                accounts={activeAccounts}
                selectedIndex={Math.min(selectedIndex, activeAccounts.length - 1)}
                onSelect={setSelectedIndex}
                onOpenDetail={(a) => router.push(`/cards/${a.id}`)}
              />

              {selected && (
                <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
                  <SelectedCardSummary
                    accountId={selected.id}
                    type={selected.type}
                    last4={selected.last4}
                    balanceMinor={selected.cachedBalanceMinor}
                    currencyCode={selected.currencyCode}
                  />
                  <QuickActions
                    onManage={() => {
                      if (selected) editSheetRef.current?.present(selected);
                    }}
                  />
                </View>
              )}
            </>
          )}

          <View
            style={{
              marginTop: 18,
              paddingHorizontal: 20,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{
                fontSize: 13,
                color: LIGHT.textDim,
                fontFamily: 'Geist Mono',
                letterSpacing: 0.4,
              }}
            >
              SHOW ARCHIVED
            </Text>
            <Switch
              value={showArchived}
              onValueChange={(v) => {
                hapticLight();
                setShowArchived(v);
              }}
              trackColor={{ false: LIGHT.border, true: ACCENTS.indigo.hex }}
            />
          </View>

          {showArchived && (
            <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
              <ArchivedList accounts={archivedAccounts} />
            </View>
          )}
        </ScrollView>
      )}

      <AddAccountSheet
        ref={addSheetRef}
        defaultCurrencyCode={defaultCurrency}
        onCreated={() => {
          // Promote the newly created card (it lands at the top of the deck
          // server-side via displayOrder=0, but the list orders by ASC so it
          // appears at index 0).
          setSelectedIndex(0);
        }}
      />
      <EditAccountSheet ref={editSheetRef} />
    </SafeAreaView>
  );
}
