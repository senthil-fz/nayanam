// Hero card: eyebrow + big net number + vs-previous delta pill on the
// left; income / expense rows on the right. Sourced from /stats/overview
// for the resolved currency. Redacted to `••••••` when the user has
// tapped the global hide-balances toggle (Phase 4 pattern) so Stats
// respects the same privacy gesture as Home.

import { Text, View } from 'react-native';
import type {
  PeriodDeltaState,
  StatsOverviewCurrencyBucketType,
  StatsPeriodKind,
} from '@nayanam/core';
import { formatMoney } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { useHomeStore } from '../../lib/hooks';
import { formatDelta, periodEyebrow, periodLabel, ACCENT_HEX } from './util';

type Props = {
  period: StatsPeriodKind;
  bucket: StatsOverviewCurrencyBucketType | null;
  loading: boolean;
  errored: boolean;
};

export function PeriodHeroCard({ period, bucket, loading, errored }: Props) {
  const balancesHidden = useHomeStore((s) => s.balancesHidden);

  if (loading) {
    return (
      <Card>
        <View
          style={{
            height: 12,
            width: 140,
            borderRadius: 6,
            backgroundColor: LIGHT.border,
          }}
        />
        <View
          style={{
            marginTop: 12,
            height: 34,
            width: 200,
            borderRadius: 8,
            backgroundColor: LIGHT.border,
          }}
        />
        <View
          style={{
            marginTop: 14,
            height: 12,
            width: 180,
            borderRadius: 6,
            backgroundColor: LIGHT.border,
          }}
        />
      </Card>
    );
  }

  if (errored) {
    return (
      <Card>
        <Text style={{ color: LIGHT.textDim, fontSize: 13 }}>
          Could not load overview.
        </Text>
      </Card>
    );
  }

  if (!bucket) {
    return (
      <Card>
        <Eyebrow>{periodEyebrow(period)}</Eyebrow>
        <Text
          style={{
            marginTop: 4,
            fontSize: 28,
            fontWeight: '700',
            color: LIGHT.text,
            letterSpacing: -0.8,
          }}
        >
          —
        </Text>
        <Text style={{ marginTop: 8, fontSize: 12, color: LIGHT.textDim }}>
          No activity this {periodLabel(period)}.
        </Text>
      </Card>
    );
  }

  const {
    netMinor,
    incomeMinor,
    expenseMinor,
    currencyCode,
    netDeltaPercent,
    deltaState,
  } = bucket;
  const delta = formatDelta(netDeltaPercent, deltaState);

  const redact = (s: string) => (balancesHidden ? '••••••' : s);
  const netFmt = redact(formatMoney(netMinor, currencyCode));

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Eyebrow>{periodEyebrow(period)}</Eyebrow>
          <Text
            accessibilityLabel={`Net this ${periodLabel(period)} ${netFmt}`}
            numberOfLines={1}
            style={{
              marginTop: 4,
              fontSize: 28,
              fontWeight: '700',
              color: LIGHT.text,
              letterSpacing: -0.8,
            }}
          >
            {netFmt}
          </Text>
          <DeltaPill delta={delta} state={deltaState} period={period} />
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <SideStat
            label="Income"
            dotColor={ACCENT_HEX}
            value={redact(formatMoney(incomeMinor, currencyCode))}
          />
          <View style={{ height: 8 }} />
          <SideStat
            label="Expense"
            dotColor={LIGHT.textFaint}
            value={redact(formatMoney(expenseMinor, currencyCode))}
          />
        </View>
      </View>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        marginHorizontal: 20,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: LIGHT.border,
        backgroundColor: LIGHT.surface,
        padding: 18,
      }}
    >
      {children}
    </View>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontSize: 10,
        letterSpacing: 0.8,
        color: LIGHT.textFaint,
        fontFamily: 'Geist Mono',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </Text>
  );
}

function DeltaPill({
  delta,
  state,
  period,
}: {
  delta: ReturnType<typeof formatDelta>;
  state: PeriodDeltaState;
  period: StatsPeriodKind;
}) {
  const bg =
    delta.sign === 'pos'
      ? 'rgba(14,159,110,0.15)'
      : delta.sign === 'neg'
        ? 'rgba(232,90,60,0.15)'
        : LIGHT.chipBg;
  const fg =
    delta.sign === 'pos'
      ? LIGHT.positive
      : delta.sign === 'neg'
        ? LIGHT.negative
        : LIGHT.textDim;

  return (
    <View
      accessibilityLabel={`${delta.text} vs last ${periodLabel(period)} (${state})`}
      style={{
        marginTop: 8,
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: bg,
      }}
    >
      <Text
        style={{
          fontFamily: 'Geist Mono',
          fontSize: 10,
          fontWeight: '700',
          color: fg,
        }}
      >
        {delta.text}
      </Text>
      <Text
        style={{
          fontFamily: 'Geist Mono',
          fontSize: 10,
          fontWeight: '600',
          color: fg,
          opacity: 0.7,
        }}
      >
        vs last {periodLabel(period)}
      </Text>
    </View>
  );
}

function SideStat({
  label,
  dotColor,
  value,
}: {
  label: string;
  dotColor: string;
  value: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 2,
          backgroundColor: dotColor,
        }}
      />
      <Text
        style={{
          fontFamily: 'Geist Mono',
          fontSize: 10,
          color: LIGHT.textDim,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: 'Geist Mono',
          fontSize: 12,
          fontWeight: '700',
          color: LIGHT.text,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
    </View>
  );
}
