// Segmented recent activity (All / Income / Expenses). Reuses the shipped
// TransactionRow in compact mode. Transfers are excluded from every segment
// to match the prototype (spec §10, §Edge cases).

import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type {
  Account,
  Category,
  Transaction,
  TransactionType,
} from '@nayanam/core';
import { LIGHT, ACCENTS } from '@nayanam/ui-tokens';
import { TransactionRow } from '../transactions/TransactionRow';
import { useHomeStore, useTransactions } from '../../lib/hooks';
import { hapticSelection } from '../../lib/haptics';

type Segment = 'all' | 'income' | 'expense';

const SEGMENTS: { value: Segment; label: string; type?: TransactionType }[] = [
  { value: 'all', label: 'All' },
  { value: 'income', label: 'Income', type: 'INCOME' },
  { value: 'expense', label: 'Expenses', type: 'EXPENSE' },
];

type Props = {
  accounts: Account[];
  categories: Category[];
  onAddFirst: () => void;
};

export function RecentActivity({ accounts, categories, onAddFirst }: Props) {
  const [segment, setSegment] = useState<Segment>('all');
  const balancesHidden = useHomeStore((s) => s.balancesHidden);
  const selected = SEGMENTS.find((s) => s.value === segment)!;
  const router = useRouter();

  const q = useTransactions({ limit: 8, type: selected.type });

  const transactions: Transaction[] = useMemo(() => {
    const all = q.data?.pages[0]?.items ?? [];
    return (segment === 'all' ? all.filter((t) => t.type !== 'TRANSFER') : all).slice(
      0,
      8,
    );
  }, [q.data, segment]);

  const accountsById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );
  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  return (
    <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: '700',
            color: LIGHT.text,
            letterSpacing: -0.2,
          }}
        >
          Activity
        </Text>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="See all transactions"
          onPress={() => router.push('/(tabs)/transactions')}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: '600',
              color: ACCENTS.indigo.hex,
            }}
          >
            See all
          </Text>
        </Pressable>
      </View>

      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: 'row',
          backgroundColor: LIGHT.chipBg,
          borderRadius: 999,
          padding: 3,
          marginBottom: 8,
          alignSelf: 'flex-start',
        }}
      >
        {SEGMENTS.map((s) => {
          const active = s.value === segment;
          return (
            <Pressable
              key={s.value}
              accessibilityRole="tab"
              accessibilityLabel={`${s.label} filter`}
              accessibilityState={{ selected: active }}
              onPress={() => {
                hapticSelection();
                setSegment(s.value);
              }}
              style={{
                paddingHorizontal: 13,
                paddingVertical: 7,
                borderRadius: 999,
                backgroundColor: active ? LIGHT.surface : 'transparent',
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: active ? LIGHT.text : LIGHT.textDim,
                  letterSpacing: 0.2,
                }}
              >
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {q.isLoading ? (
        <Text style={{ color: LIGHT.textDim, paddingVertical: 12 }}>Loading…</Text>
      ) : q.isError ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: LIGHT.border,
            borderStyle: 'dashed',
            borderRadius: 14,
            padding: 16,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: LIGHT.negative, fontSize: 13 }}>
            Couldn&apos;t load recent activity.
          </Text>
        </View>
      ) : transactions.length === 0 ? (
        <View
          style={{
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: LIGHT.border,
            borderRadius: 18,
            paddingVertical: 20,
            paddingHorizontal: 18,
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: LIGHT.text }}>
            No activity yet
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a transaction"
            onPress={onAddFirst}
            style={{
              backgroundColor: ACCENTS.indigo.hex,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
              Add a transaction
            </Text>
          </Pressable>
        </View>
      ) : (
        <View
          style={{
            backgroundColor: LIGHT.surface,
            borderWidth: 1,
            borderColor: LIGHT.border,
            borderRadius: 16,
            paddingHorizontal: 14,
          }}
        >
          {transactions.map((t, idx) => (
            <View
              key={t.id}
              style={{
                borderBottomWidth: idx < transactions.length - 1 ? 0.5 : 0,
                borderBottomColor: LIGHT.border,
              }}
            >
              <TransactionRow
                transaction={t}
                account={accountsById.get(t.accountId)}
                category={categoriesById.get(t.categoryId)}
                compact
                redactAmount={balancesHidden}
                onPress={() => router.push('/(tabs)/transactions')}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
