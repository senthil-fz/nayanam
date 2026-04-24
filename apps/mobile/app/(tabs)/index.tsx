import { useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatMoney } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { useAuthStore } from '../../src/lib/api';
import {
  useAccountsSummary,
  useCreateHousehold,
  useHouseholds,
  useLogout,
  useMe,
} from '../../src/lib/hooks';

export default function Home() {
  const me = useMe();
  const { data: households } = useHouseholds();
  const activeId = useAuthStore((s) => s.activeHouseholdId);
  const setActive = useAuthStore((s) => s.setActiveHousehold);
  const logout = useLogout();
  const createHousehold = useCreateHousehold();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');

  const list = households ?? me.data?.households ?? [];
  const active = list.find((h) => h.id === activeId) ?? list[0];
  const summaryQuery = useAccountsSummary();
  const summary = summaryQuery.data;

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <View className="h-9 w-9 items-center justify-center rounded-md bg-accent">
              <Text className="font-bold text-white">N</Text>
            </View>
            <View>
              <Text className="text-lg font-semibold text-text">Nayanam</Text>
              <Text className="font-mono text-[10px] uppercase tracking-wider text-text-faint">
                Expense manager
              </Text>
            </View>
          </View>
          <Pressable onPress={() => logout.mutate()}>
            <Text className="text-sm text-text-dim">Sign out</Text>
          </Pressable>
        </View>

        {/* Balance hero — per-currency buckets joined with ' · ' (spec). */}
        <View
          style={{
            marginTop: 24,
            borderRadius: 24,
            padding: 20,
            backgroundColor: LIGHT.text,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              letterSpacing: 1,
              fontFamily: 'Geist Mono',
              color: 'rgba(255,255,255,0.7)',
            }}
          >
            TOTAL BALANCE
          </Text>
          <Text
            style={{
              color: '#fff',
              fontSize: 32,
              fontWeight: '700',
              marginTop: 6,
              letterSpacing: -0.8,
            }}
            numberOfLines={2}
          >
            {summaryQuery.isLoading
              ? '—'
              : summary && summary.byCurrency.length > 0
                ? summary.byCurrency
                    .map((b) => formatMoney(b.totalMinor, b.currencyCode))
                    .join(' · ')
                : 'No accounts yet'}
          </Text>
          <Text
            style={{
              color: 'rgba(255,255,255,0.6)',
              fontSize: 12,
              marginTop: 6,
              fontFamily: 'Geist Mono',
            }}
          >
            {summary ? `${summary.totalAccounts} active` : ''}
          </Text>
        </View>

        <View className="mt-8 rounded-lg border border-border bg-surface p-6">
          <Text className="text-2xl font-semibold text-text">
            {me.data?.user?.name
              ? `Welcome back, ${me.data.user.name}.`
              : `Welcome, ${me.data?.user?.email ?? '...'}.`}
          </Text>
          <Text className="mt-2 text-sm text-text-dim">
            Phase 1 is live: auth and households. Domain features land next.
          </Text>

          <Text className="mt-6 mb-2 font-mono text-[10px] uppercase tracking-wider text-text-faint">
            Active household
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {list.map((h) => {
              const isActive = h.id === active?.id;
              return (
                <Pressable
                  key={h.id}
                  onPress={() => setActive(h.id)}
                  className={
                    'rounded-full border px-3 py-1 ' +
                    (isActive
                      ? 'border-accent bg-accent-soft'
                      : 'border-border')
                  }
                >
                  <Text className={isActive ? 'text-accent' : 'text-text'}>
                    {h.name}{' '}
                    <Text className="font-mono text-[10px] text-text-dim">{h.role}</Text>
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setShowCreate((v) => !v)}
              className="rounded-full border border-dashed border-border px-3 py-1"
            >
              <Text className="text-text-dim">+ New</Text>
            </Pressable>
          </View>

          {showCreate && (
            <View className="mt-3 flex-row gap-2">
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Household name"
                className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-text"
                placeholderTextColor="rgba(14,14,16,0.4)"
              />
              <Pressable
                onPress={() =>
                  name.trim() &&
                  createHousehold.mutate(
                    { name: name.trim() },
                    {
                      onSuccess: (hh) => {
                        setActive(hh.id);
                        setName('');
                        setShowCreate(false);
                      },
                    },
                  )
                }
                className="justify-center rounded-md bg-accent px-4"
              >
                <Text className="text-white">Create</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
