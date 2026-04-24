// Bills totals card — matches prototype screen-bills.jsx: two columns
// (Monthly cost · Due soon) with a vertical divider. Multi-currency: the
// primary bucket is the hero; additional currencies stack as compact rows
// beneath a separator, parallel to BalanceHero.

import { useMemo } from 'react';
import { View, Text } from 'react-native';
import { formatMoney, type BillsSummaryResponseType } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';

type Props = {
  summary: BillsSummaryResponseType | undefined;
  isLoading: boolean;
  isError: boolean;
  primaryCurrencyCode?: string;
  balancesHidden: boolean;
};

const REDACT = '••••••';

export function BillsTotalsCard({
  summary,
  isLoading,
  isError,
  primaryCurrencyCode,
  balancesHidden,
}: Props) {
  const sorted = useMemo(
    () =>
      summary
        ? [...summary.byCurrency].sort((a, b) => {
            const av = BigInt(a.monthlyCostMinor);
            const bv = BigInt(b.monthlyCostMinor);
            if (av === bv) return 0;
            return av > bv ? -1 : 1;
          })
        : [],
    [summary],
  );

  if (isError) {
    return (
      <View
        style={{
          marginHorizontal: 20,
          marginTop: 4,
          padding: 18,
          borderRadius: 22,
          backgroundColor: LIGHT.surface,
          borderWidth: 1,
          borderColor: LIGHT.border,
        }}
      >
        <Text style={{ color: LIGHT.negative, fontSize: 13 }}>
          Couldn&apos;t load totals.
        </Text>
      </View>
    );
  }

  if (isLoading || !summary) {
    return (
      <View
        accessibilityLabel="Loading bills totals"
        style={{
          marginHorizontal: 20,
          marginTop: 4,
          height: 118,
          borderRadius: 22,
          backgroundColor: LIGHT.surfaceAlt,
          opacity: 0.7,
        }}
      />
    );
  }

  if (sorted.length === 0) {
    return (
      <View
        style={{
          marginHorizontal: 20,
          marginTop: 4,
          padding: 18,
          borderRadius: 22,
          backgroundColor: LIGHT.surface,
          borderWidth: 1,
          borderColor: LIGHT.border,
        }}
      >
        <Text style={{ color: LIGHT.textDim, fontSize: 13 }}>
          No active bills yet.
        </Text>
      </View>
    );
  }

  const primary =
    (primaryCurrencyCode
      ? sorted.find((b) => b.currencyCode === primaryCurrencyCode)
      : undefined) ?? sorted[0];
  if (!primary) return null;
  const rest = sorted.filter((b) => b.currencyCode !== primary.currencyCode);

  return (
    <View
      style={{
        marginHorizontal: 20,
        marginTop: 4,
        padding: 18,
        borderRadius: 22,
        backgroundColor: LIGHT.surface,
        borderWidth: 1,
        borderColor: LIGHT.border,
      }}
    >
      <HeroRow
        currencyCode={primary.currencyCode}
        monthlyCostMinor={primary.monthlyCostMinor}
        dueSoonMinor={primary.dueSoonMinor}
        activeCount={primary.activeCount}
        pausedCount={primary.pausedCount}
        balancesHidden={balancesHidden}
      />
      {rest.length > 0 ? (
        <View
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: LIGHT.border,
            gap: 8,
          }}
        >
          {rest.map((b) => (
            <HeroRow
              key={b.currencyCode}
              currencyCode={b.currencyCode}
              monthlyCostMinor={b.monthlyCostMinor}
              dueSoonMinor={b.dueSoonMinor}
              activeCount={b.activeCount}
              pausedCount={b.pausedCount}
              balancesHidden={balancesHidden}
              compact
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

type RowProps = {
  currencyCode: string;
  monthlyCostMinor: string;
  dueSoonMinor: string;
  activeCount: number;
  pausedCount: number;
  compact?: boolean;
  balancesHidden: boolean;
};

function HeroRow({
  currencyCode,
  monthlyCostMinor,
  dueSoonMinor,
  activeCount,
  pausedCount,
  compact = false,
  balancesHidden,
}: RowProps) {
  const amountSize = compact ? 17 : 26;
  const amountWeight: '600' | '700' = compact ? '600' : '700';
  return (
    <View style={{ flexDirection: 'row', gap: 16 }}>
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
          Monthly cost
        </Text>
        <Text
          style={{
            fontSize: amountSize,
            fontWeight: amountWeight,
            color: LIGHT.text,
            letterSpacing: -0.5,
            marginTop: 2,
          }}
          accessibilityLabel={
            balancesHidden ? 'Monthly cost hidden' : undefined
          }
        >
          {balancesHidden
            ? REDACT
            : formatMoney(monthlyCostMinor, currencyCode)}
        </Text>
        <Text
          style={{
            fontSize: 11,
            color: LIGHT.textDim,
            marginTop: 2,
            fontFamily: 'Geist Mono',
          }}
        >
          {activeCount} active · {pausedCount} paused
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
          Due soon
        </Text>
        <Text
          style={{
            fontSize: amountSize,
            fontWeight: amountWeight,
            color: LIGHT.negative,
            letterSpacing: -0.5,
            marginTop: 2,
          }}
        >
          {balancesHidden ? REDACT : formatMoney(dueSoonMinor, currencyCode)}
        </Text>
        <Text
          style={{
            fontSize: 11,
            color: LIGHT.textDim,
            marginTop: 2,
            fontFamily: 'Geist Mono',
          }}
        >
          in next 7 days
        </Text>
      </View>
    </View>
  );
}
