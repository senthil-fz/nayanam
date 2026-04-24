// Stack route — detailed view of a single bill. Shows the bill header
// (icon, name, cycle, next-due), totals (monthly equivalent, last paid),
// payment history (infinite), and footer actions (Edit / Pause-Resume /
// Archive / Mark paid / Undo last payment). Role gates mirror the list.

import { useCallback, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Archive,
  Pause,
  Pencil,
  Play,
  Undo2,
  CircleCheckBig,
} from 'lucide-react-native';
import type { Bill, BillPayment } from '@nayanam/core';
import { formatMoney } from '@nayanam/core';
import {
  CATEGORY_COLORS,
  type CategoryColorToken,
  LIGHT,
  ACCENTS,
} from '@nayanam/ui-tokens';
import {
  useAccounts,
  useArchiveBill,
  useBill,
  useBillPayments,
  useCategories,
  useHomeStore,
  useHouseholds,
  useMe,
  usePauseBill,
  useResumeBill,
} from '../../src/lib/hooks';
import { useAuthStore } from '../../src/lib/api';
import { hapticError, hapticSuccess } from '../../src/lib/haptics';
import { cycleIconFor } from '../../src/features/bills/icons';
import {
  cycleEyebrow,
  daysUntilDue,
  dueLabel,
  formatShortDate,
} from '../../src/features/bills/format';
import {
  EditBillSheet,
  type EditBillSheetHandle,
} from '../../src/features/bills/EditBillSheet';
import {
  MarkPaidSheet,
  type MarkPaidSheetHandle,
} from '../../src/features/bills/MarkPaidSheet';
import {
  UndoPaymentSheet,
  type UndoPaymentSheetHandle,
} from '../../src/features/bills/UndoPaymentSheet';
import { ChevLIcon } from '../../src/features/cards/icons';

const REDACT = '••••••';

function resolveTint(token: string | null | undefined) {
  if (token && token in CATEGORY_COLORS) {
    const c = CATEGORY_COLORS[token as CategoryColorToken];
    return { ink: c.ink, soft: c.soft };
  }
  return { ink: '#3F3F46', soft: '#E4E4E7' };
}

// Monthly-equivalent minor units — matches the server/web helper. Floor
// division on bigints; errs slightly low for weekly/custom (documented).
function monthlyCostMinor(
  amountMinor: string,
  cycle: Bill['cycle'],
  customDays: number | null,
): bigint {
  const n = BigInt(amountMinor);
  switch (cycle) {
    case 'WEEKLY':
      return (n * 52n) / 12n;
    case 'MONTHLY':
      return n;
    case 'QUARTERLY':
      return n / 3n;
    case 'YEARLY':
      return n / 12n;
    case 'CUSTOM_DAYS': {
      const d = BigInt(customDays && customDays > 0 ? customDays : 30);
      return (n * 30n) / d;
    }
  }
}

export default function BillDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const balancesHidden = useHomeStore((s) => s.balancesHidden);

  const me = useMe();
  const { data: householdsData } = useHouseholds();
  const activeId = useAuthStore((s) => s.activeHouseholdId);
  const households = householdsData ?? me.data?.households ?? [];
  const activeHousehold =
    households.find((h) => h.id === activeId) ?? households[0];
  const role = activeHousehold?.role;
  const canMutate = role === 'OWNER' || role === 'ADMIN' || role === 'MEMBER';
  const canArchive = role === 'OWNER' || role === 'ADMIN';

  const billQuery = useBill(id);
  const bill = billQuery.data;
  const paymentsQuery = useBillPayments(id);

  const accountsQuery = useAccounts({ includeArchived: true });
  const categoriesQuery = useCategories({ includeArchived: true });
  const account = useMemo(
    () =>
      bill
        ? (accountsQuery.data?.pages
            .flatMap((p) => p.items)
            .find((a) => a.id === bill.accountId) ?? null)
        : null,
    [accountsQuery.data, bill],
  );
  const category = useMemo(
    () =>
      bill
        ? (categoriesQuery.data?.pages
            .flatMap((p) => p.items)
            .find((c) => c.id === bill.categoryId) ?? null)
        : null,
    [categoriesQuery.data, bill],
  );

  const payments: BillPayment[] = useMemo(
    () => paymentsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [paymentsQuery.data],
  );
  const latestActivePayment = useMemo(
    () => payments.find((p) => !p.deletedAt) ?? null,
    [payments],
  );

  const editRef = useRef<EditBillSheetHandle>(null);
  const markPaidRef = useRef<MarkPaidSheetHandle>(null);
  const undoRef = useRef<UndoPaymentSheetHandle>(null);

  const pauseMut = usePauseBill();
  const resumeMut = useResumeBill();
  const archiveMut = useArchiveBill();

  const onPauseResume = useCallback(async () => {
    if (!bill) return;
    try {
      if (bill.status === 'PAUSED') {
        await resumeMut.mutateAsync({ billId: bill.id });
      } else {
        await pauseMut.mutateAsync({ billId: bill.id });
      }
      hapticSuccess();
    } catch (err) {
      hapticError();
      console.warn('Pause/resume failed', err);
    }
  }, [bill, pauseMut, resumeMut]);

  const onArchive = useCallback(async () => {
    if (!bill) return;
    try {
      await archiveMut.mutateAsync({ billId: bill.id });
      hapticSuccess();
      router.back();
    } catch (err) {
      hapticError();
      console.warn('Archive failed', err);
    }
  }, [archiveMut, bill, router]);

  if (!bill) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: LIGHT.bg }} edges={['top']}>
        <View
          style={{
            paddingHorizontal: 20,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <BackButton onPress={() => router.back()} />
        </View>
        <View style={{ paddingTop: 40, alignItems: 'center' }}>
          {billQuery.isLoading ? (
            <ActivityIndicator color={LIGHT.textDim} />
          ) : (
            <Text style={{ color: LIGHT.textDim }}>Bill not found.</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const colorToken = bill.colorToken ?? category?.colorToken ?? null;
  const { ink, soft } = resolveTint(colorToken);
  const Icon = cycleIconFor(bill.cycle);

  const paused = bill.status === 'PAUSED';
  const days = daysUntilDue(bill.nextDueAt);
  const due = paused ? null : dueLabel(days);
  const monthly = monthlyCostMinor(
    bill.amountMinor,
    bill.cycle,
    bill.customDays,
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LIGHT.bg }} edges={['top']}>
      <View
        style={{
          paddingHorizontal: 20,
          paddingVertical: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <BackButton onPress={() => router.back()} />
        <Text
          style={{
            flex: 1,
            fontSize: 17,
            fontWeight: '700',
            color: LIGHT.text,
            letterSpacing: -0.3,
          }}
          numberOfLines={1}
        >
          {bill.name}
        </Text>
      </View>

      <FlatList
        data={payments}
        keyExtractor={(p) => p.id}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (
            paymentsQuery.hasNextPage &&
            !paymentsQuery.isFetchingNextPage
          ) {
            void paymentsQuery.fetchNextPage();
          }
        }}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={
          <View>
            {/* Icon + eyebrow */}
            <View
              style={{
                paddingHorizontal: 20,
                paddingVertical: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 14,
                  backgroundColor: soft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon size={22} color={ink} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    fontSize: 11,
                    color: LIGHT.textDim,
                    fontFamily: 'Geist Mono',
                    letterSpacing: 0.4,
                    textTransform: 'uppercase',
                  }}
                >
                  {cycleEyebrow(bill)} · {bill.status}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: due?.tone === 'negative' ? LIGHT.negative : LIGHT.textDim,
                    marginTop: 2,
                  }}
                >
                  {paused
                    ? 'Paused — no auto-log'
                    : `${due?.label ?? ''} · Next ${formatShortDate(bill.nextDueAt)}`}
                </Text>
              </View>
            </View>

            {/* Totals card */}
            <View
              style={{
                marginHorizontal: 20,
                marginTop: 4,
                padding: 18,
                borderRadius: 22,
                backgroundColor: LIGHT.surface,
                borderWidth: 1,
                borderColor: LIGHT.border,
                flexDirection: 'row',
                gap: 16,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 10,
                    letterSpacing: 0.8,
                    color: LIGHT.textDim,
                    fontFamily: 'Geist Mono',
                    textTransform: 'uppercase',
                  }}
                >
                  Monthly equiv.
                </Text>
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: '700',
                    color: LIGHT.text,
                    letterSpacing: -0.5,
                    marginTop: 2,
                  }}
                >
                  {balancesHidden
                    ? REDACT
                    : formatMoney(monthly.toString(), bill.currencyCode)}
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    color: LIGHT.textDim,
                    marginTop: 2,
                    fontFamily: 'Geist Mono',
                  }}
                >
                  {formatMoney(bill.amountMinor, bill.currencyCode)} /{' '}
                  {cycleEyebrow(bill).toLowerCase()}
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: LIGHT.border }} />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 10,
                    letterSpacing: 0.8,
                    color: LIGHT.textDim,
                    fontFamily: 'Geist Mono',
                    textTransform: 'uppercase',
                  }}
                >
                  Last paid
                </Text>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: '600',
                    color: LIGHT.text,
                    marginTop: 2,
                  }}
                >
                  {bill.lastPaidAt
                    ? new Date(bill.lastPaidAt).toLocaleDateString()
                    : '—'}
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    color: LIGHT.textDim,
                    marginTop: 2,
                    fontFamily: 'Geist Mono',
                  }}
                >
                  {bill.autoLog ? 'Auto-log ON' : 'Manual'}
                </Text>
              </View>
            </View>

            {/* Action buttons */}
            <View
              style={{
                marginHorizontal: 20,
                marginTop: 14,
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              {canMutate && !paused ? (
                <ActionButton
                  label="Mark paid"
                  icon={<CircleCheckBig size={14} color="#fff" />}
                  kind="primary"
                  onPress={() =>
                    markPaidRef.current?.present({
                      bill,
                      account,
                      category,
                    })
                  }
                />
              ) : null}
              {canMutate ? (
                <ActionButton
                  label="Edit"
                  icon={<Pencil size={14} color={LIGHT.text} />}
                  kind="secondary"
                  onPress={() =>
                    editRef.current?.present({ bill, account, category })
                  }
                />
              ) : null}
              {canMutate ? (
                <ActionButton
                  label={paused ? 'Resume' : 'Pause'}
                  icon={
                    paused ? (
                      <Play size={14} color={LIGHT.text} />
                    ) : (
                      <Pause size={14} color={LIGHT.text} />
                    )
                  }
                  kind="secondary"
                  onPress={() => void onPauseResume()}
                />
              ) : null}
              {canArchive ? (
                <ActionButton
                  label="Archive"
                  icon={<Archive size={14} color={LIGHT.negative} />}
                  kind="danger"
                  onPress={() => void onArchive()}
                />
              ) : null}
              {canArchive && latestActivePayment ? (
                <ActionButton
                  label="Undo last payment"
                  icon={<Undo2 size={14} color={LIGHT.negative} />}
                  kind="danger"
                  onPress={() =>
                    undoRef.current?.present({
                      bill,
                      payment: latestActivePayment,
                    })
                  }
                />
              ) : null}
            </View>

            {/* Payment history header */}
            <Text
              style={{
                marginTop: 22,
                marginHorizontal: 20,
                fontSize: 11,
                color: LIGHT.textDim,
                fontFamily: 'Geist Mono',
                letterSpacing: 0.4,
                textTransform: 'uppercase',
              }}
            >
              Payment history
            </Text>
          </View>
        }
        renderItem={({ item: p }) => (
          <View
            style={{
              marginHorizontal: 20,
              marginTop: 8,
              padding: 12,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: LIGHT.border,
              backgroundColor: LIGHT.surface,
              flexDirection: 'row',
              alignItems: 'center',
              opacity: p.deletedAt ? 0.5 : 1,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: LIGHT.text, fontSize: 14 }}>
                {formatMoney(p.amountMinor, bill.currencyCode)}
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: LIGHT.textDim,
                  marginTop: 2,
                  fontFamily: 'Geist Mono',
                }}
              >
                {new Date(p.paidAt).toLocaleString()} · {p.source}
              </Text>
            </View>
            {p.deletedAt ? (
              <Text
                style={{
                  fontSize: 9,
                  fontFamily: 'Geist Mono',
                  color: LIGHT.textDim,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                }}
              >
                Undone
              </Text>
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          paymentsQuery.isLoading ? (
            <View style={{ paddingTop: 16, alignItems: 'center' }}>
              <ActivityIndicator color={LIGHT.textDim} />
            </View>
          ) : (
            <Text
              style={{
                marginTop: 10,
                marginHorizontal: 20,
                fontSize: 13,
                color: LIGHT.textDim,
              }}
            >
              No payments yet.
            </Text>
          )
        }
        ListFooterComponent={
          paymentsQuery.isFetchingNextPage ? (
            <View style={{ paddingVertical: 16 }}>
              <ActivityIndicator color={LIGHT.textDim} />
            </View>
          ) : null
        }
      />

      <EditBillSheet ref={editRef} />
      <MarkPaidSheet ref={markPaidRef} />
      <UndoPaymentSheet ref={undoRef} />
    </SafeAreaView>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={onPress}
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
  );
}

function ActionButton({
  label,
  icon,
  kind,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  kind: 'primary' | 'secondary' | 'danger';
  onPress: () => void;
}) {
  const bg =
    kind === 'primary'
      ? ACCENTS.indigo.hex
      : kind === 'danger'
        ? LIGHT.surface
        : LIGHT.surface;
  const fg =
    kind === 'primary' ? '#fff' : kind === 'danger' ? LIGHT.negative : LIGHT.text;
  const borderColor = kind === 'danger' ? LIGHT.negative : LIGHT.border;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 999,
        backgroundColor: bg,
        borderWidth: kind === 'primary' ? 0 : 1,
        borderColor,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {icon}
      <Text style={{ fontSize: 13, fontWeight: '600', color: fg }}>{label}</Text>
    </Pressable>
  );
}
