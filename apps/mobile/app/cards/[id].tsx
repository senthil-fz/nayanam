// Card detail screen — full-width CardArt, meta grid, sparkline, and a
// "Latest transactions" placeholder until Phase 3 lands.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ACCENTS, LIGHT } from '@nayanam/ui-tokens';
import { formatMoney } from '@nayanam/core';
import { useMemo } from 'react';
import type { Category } from '@nayanam/core';
import {
  useAccount,
  useBalanceHistory,
  useCategories,
  useTransactions,
} from '../../src/lib/hooks';
import { CardArt } from '../../src/features/cards/CardArt';
import { Sparkline } from '../../src/features/cards/Sparkline';
import { ChevLIcon } from '../../src/features/cards/icons';
import { TransactionRow } from '../../src/features/transactions/TransactionRow';

export default function CardDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const accountQuery = useAccount(id);
  const history = useBalanceHistory(id, 6);
  const account = accountQuery.data;
  const txns = useTransactions({ accountId: id ? [id] : undefined, limit: 10 });
  const rows = useMemo(
    () => txns.data?.pages.flatMap((p) => p.items).slice(0, 10) ?? [],
    [txns.data],
  );
  const categoriesQuery = useCategories({ includeArchived: true });
  const categoriesById = useMemo(() => {
    const m = new Map<string, Category>();
    for (const p of categoriesQuery.data?.pages ?? []) for (const c of p.items) m.set(c.id, c);
    return m;
  }, [categoriesQuery.data]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LIGHT.bg }} edges={['top']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingVertical: 10,
          gap: 12,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: LIGHT.chipBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevLIcon size={18} color={LIGHT.text} />
        </Pressable>
        <Text style={{ fontSize: 20, fontWeight: '700', color: LIGHT.text }}>
          {account?.nickname ?? 'Account'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }}>
        {account && (
          <>
            <CardArt
              nickname={account.nickname}
              type={account.type}
              last4={account.last4}
              colorToken={account.colorToken}
              balanceMinor={account.cachedBalanceMinor}
              currencyCode={account.currencyCode}
              height={220}
            />

            <View style={{ marginTop: 20 }}>
              <Meta label="Balance" value={formatMoney(account.cachedBalanceMinor, account.currencyCode)} />
              <Meta label="Type" value={account.type} mono />
              <Meta label="Currency" value={account.currencyCode} mono />
              <Meta label="Institution" value={account.institution ?? '—'} />
              <Meta
                label="Opening balance"
                value={formatMoney(account.openingBalanceMinor, account.currencyCode)}
              />
            </View>

            <View
              style={{
                marginTop: 24,
                padding: 16,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: LIGHT.border,
                backgroundColor: LIGHT.surface,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  color: LIGHT.textDim,
                  fontFamily: 'Geist Mono',
                  letterSpacing: 0.6,
                }}
              >
                6-MONTH BALANCE
              </Text>
              <Sparkline
                values={(history.data?.points ?? []).map((p) => Number(p.balanceMinor))}
                width={320}
                height={90}
                stroke={ACCENTS.indigo.hex}
                fill={ACCENTS.indigo.hex + '22'}
                strokeWidth={2.5}
                loading={history.isLoading}
              />
            </View>

            <View style={{ marginTop: 28 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: LIGHT.text, marginBottom: 10 }}>
                Latest on this card
              </Text>
              {txns.isLoading ? (
                <Text style={{ color: LIGHT.textDim, paddingVertical: 8 }}>Loading…</Text>
              ) : rows.length === 0 ? (
                <View
                  style={{
                    padding: 20,
                    borderRadius: 18,
                    backgroundColor: LIGHT.chipBg,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: LIGHT.textDim, fontSize: 13, textAlign: 'center' }}>
                    No transactions on this account yet.
                  </Text>
                </View>
              ) : (
                <View
                  style={{
                    borderRadius: 16,
                    backgroundColor: LIGHT.surface,
                    borderWidth: 1,
                    borderColor: LIGHT.border,
                    paddingHorizontal: 14,
                  }}
                >
                  {rows.map((t, idx) => (
                    <View
                      key={t.id}
                      style={{
                        borderBottomWidth: idx < rows.length - 1 ? 0.5 : 0,
                        borderBottomColor: LIGHT.border,
                      }}
                    >
                      <TransactionRow
                        transaction={t}
                        account={account}
                        category={categoriesById.get(t.categoryId)}
                        isTransferDestination={
                          Boolean(t.transferId) && t.accountId === account.id
                        }
                        compact
                      />
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Meta({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: 0.5,
        borderBottomColor: LIGHT.border,
      }}
    >
      <Text style={{ fontSize: 13, color: LIGHT.textDim }}>{label}</Text>
      <Text
        style={{
          fontSize: 14,
          color: LIGHT.text,
          fontWeight: '600',
          fontFamily: mono ? 'Geist Mono' : undefined,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
