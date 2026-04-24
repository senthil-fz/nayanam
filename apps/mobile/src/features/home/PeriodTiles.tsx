// Day / Week / Month / Year segmented control + three tiles (Income / Expense / Net).
// Bound to the persisted home-store `period`. Renders the primary currency's
// bucket only — multi-currency households see an additional caption on the
// hero sparkline; Phase 4 does not attempt FX on the tiles.

import { Pressable, Text, View } from 'react-native';
import { formatMoney, type HomePeriod } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { usePeriodSummary, useHomeStore } from '../../lib/hooks';
import { hapticSelection } from '../../lib/haptics';

const PERIODS: { value: HomePeriod; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

type Props = {
  currencyCode: string | undefined;
};

export function PeriodTiles({ currencyCode }: Props) {
  const period = useHomeStore((s) => s.period);
  const setPeriod = useHomeStore((s) => s.setPeriod);
  const balancesHidden = useHomeStore((s) => s.balancesHidden);
  const summary = usePeriodSummary({ period });

  const bucket = currencyCode
    ? summary.data?.byCurrency.find((b) => b.currencyCode === currencyCode)
    : summary.data?.byCurrency[0];
  const resolvedCurrency = bucket?.currencyCode ?? currencyCode ?? 'USD';

  const show = (minor: string | undefined): string => {
    if (balancesHidden) return '••••••';
    if (!minor) return formatMoney('0', resolvedCurrency);
    return formatMoney(minor, resolvedCurrency);
  };

  // Color parity with web: Income green, Expense red, Net neutral (white on
  // the dark gradient hero). Tokens: LIGHT.positive / LIGHT.negative from
  // packages/ui-tokens — the same pair web uses for textSuccess/textDanger.
  const incomeTone = balancesHidden ? '#fff' : LIGHT.positive;
  const expenseTone = balancesHidden ? '#fff' : LIGHT.negative;
  const netTone = balancesHidden
    ? '#fff'
    : bucket && Number(bucket.netMinor) < 0
      ? LIGHT.negative
      : '#ffffff';

  return (
    <View style={{ gap: 10 }}>
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: 'row',
          backgroundColor: 'rgba(255,255,255,0.14)',
          borderRadius: 999,
          padding: 2,
        }}
      >
        {PERIODS.map((p) => {
          const selected = p.value === period;
          return (
            <Pressable
              key={p.value}
              accessibilityRole="tab"
              accessibilityLabel={`${p.label} summary`}
              accessibilityState={{ selected }}
              onPress={() => {
                hapticSelection();
                setPeriod(p.value);
              }}
              style={{
                flex: 1,
                paddingVertical: 6,
                alignItems: 'center',
                borderRadius: 999,
                backgroundColor: selected ? '#fff' : 'transparent',
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  letterSpacing: 0.6,
                  color: selected ? LIGHT.text : 'rgba(255,255,255,0.85)',
                  textTransform: 'uppercase',
                }}
              >
                {p.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Tile
          label="Income"
          value={show(bucket?.incomeMinor)}
          loading={summary.isLoading}
          tone={incomeTone}
        />
        <Tile
          label="Expense"
          value={show(bucket?.expenseMinor)}
          loading={summary.isLoading}
          tone={expenseTone}
        />
        <Tile
          label="Net"
          value={show(bucket?.netMinor)}
          loading={summary.isLoading}
          tone={netTone}
        />
      </View>
    </View>
  );
}

function Tile({
  label,
  value,
  loading,
  tone = '#fff',
}: {
  label: string;
  value: string;
  loading?: boolean;
  tone?: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.14)',
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 8,
      }}
    >
      <Text
        style={{
          fontSize: 9,
          fontFamily: 'Geist Mono',
          color: 'rgba(255,255,255,0.8)',
          letterSpacing: 0.6,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          marginTop: 2,
          fontSize: 13,
          fontWeight: '700',
          color: tone,
          opacity: loading ? 0.5 : 1,
          fontFamily: 'Geist Mono',
        }}
      >
        {loading ? '—' : value}
      </Text>
    </View>
  );
}
