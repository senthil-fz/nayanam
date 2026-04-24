// Balance hero — gradient card + hide/show eye, primary-currency total,
// secondary currency rows, embedded 14-day sparkline + period tiles.

import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { ApiHouseholdSummary } from '@nayanam/contracts';
import { formatMoney, type AccountsSummaryType } from '@nayanam/core';
import { ACCENTS } from '@nayanam/ui-tokens';
import {
  useAccountsSummary,
  useBalanceHistoryAll,
  useHomeStore,
} from '../../lib/hooks';
import { HideShowToggle } from './HideShowToggle';
import { HomeSparkline } from './HomeSparkline';
import { PeriodTiles } from './PeriodTiles';

function resolvePrimaryCurrency(
  summary: AccountsSummaryType | undefined,
  household: ApiHouseholdSummary | undefined,
): string | undefined {
  const hhCur = household?.defaultCurrencyCode;
  if (summary && summary.byCurrency.length > 0) {
    if (hhCur && summary.byCurrency.some((b) => b.currencyCode === hhCur)) {
      return hhCur;
    }
    return [...summary.byCurrency].sort(
      (a, b) => Number(b.totalMinor) - Number(a.totalMinor),
    )[0]?.currencyCode;
  }
  return hhCur;
}

type Props = {
  activeHousehold: ApiHouseholdSummary | undefined;
};

export function BalanceHero({ activeHousehold }: Props) {
  const balancesHidden = useHomeStore((s) => s.balancesHidden);
  const summary = useAccountsSummary();
  const history = useBalanceHistoryAll(14);

  const primaryCurrency = resolvePrimaryCurrency(summary.data, activeHousehold);
  const buckets = summary.data?.byCurrency ?? [];
  const primaryBucket = primaryCurrency
    ? buckets.find((b) => b.currencyCode === primaryCurrency)
    : undefined;
  const otherBuckets = buckets.filter(
    (b) => b.currencyCode !== primaryBucket?.currencyCode,
  );

  const sparklinePoints = primaryCurrency
    ? history.data?.byCurrency.find((c) => c.currencyCode === primaryCurrency)
        ?.points
    : history.data?.byCurrency[0]?.points;

  const hasAccounts = (summary.data?.totalAccounts ?? 0) > 0;
  const accent = ACCENTS.indigo.hex;

  return (
    <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
      <LinearGradient
        colors={[accent, accent + 'dd']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: 24,
          paddingHorizontal: 22,
          paddingTop: 18,
          paddingBottom: 18,
          overflow: 'hidden',
        }}
      >
        {/* Decorative blobs */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            right: -30,
            top: -40,
            width: 140,
            height: 140,
            borderRadius: 70,
            backgroundColor: 'rgba(255,255,255,0.10)',
          }}
        />
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            right: -50,
            bottom: -50,
            width: 100,
            height: 100,
            borderRadius: 50,
            backgroundColor: 'rgba(255,255,255,0.08)',
          }}
        />

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text
            style={{
              fontSize: 11,
              letterSpacing: 1,
              color: 'rgba(255,255,255,0.8)',
              fontFamily: 'Geist Mono',
              textTransform: 'uppercase',
            }}
          >
            Total balance
          </Text>
          <HideShowToggle />
        </View>

        {summary.isLoading ? (
          <View
            style={{
              marginTop: 8,
              height: 38,
              width: 180,
              borderRadius: 10,
              backgroundColor: 'rgba(255,255,255,0.25)',
            }}
          />
        ) : !hasAccounts ? (
          <Text
            style={{
              color: '#fff',
              fontSize: 22,
              fontWeight: '600',
              marginTop: 8,
              letterSpacing: -0.5,
            }}
          >
            Add your first account
          </Text>
        ) : (
          <>
            <Text
              numberOfLines={1}
              style={{
                color: '#fff',
                fontSize: 34,
                fontWeight: '700',
                marginTop: 4,
                letterSpacing: -0.8,
                fontVariant: ['tabular-nums'],
              }}
            >
              {balancesHidden
                ? '••••••'
                : primaryBucket
                  ? formatMoney(primaryBucket.totalMinor, primaryBucket.currencyCode)
                  : '—'}
            </Text>

            {otherBuckets.length > 0 ? (
              <View
                style={{
                  marginTop: 4,
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {otherBuckets.slice(0, 3).map((b) => (
                  <Text
                    key={b.currencyCode}
                    style={{
                      color: 'rgba(255,255,255,0.88)',
                      fontSize: 13,
                      fontFamily: 'Geist Mono',
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {balancesHidden ? '••••••' : formatMoney(b.totalMinor, b.currencyCode)}
                  </Text>
                ))}
                {otherBuckets.length > 3 ? (
                  <Text
                    style={{
                      color: 'rgba(255,255,255,0.72)',
                      fontSize: 12,
                    }}
                  >
                    +{otherBuckets.length - 3} more
                  </Text>
                ) : null}
              </View>
            ) : null}

            <View
              style={{
                marginTop: 14,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.75)',
                  fontFamily: 'Geist Mono',
                  letterSpacing: 0.4,
                }}
              >
                {primaryCurrency ? `${primaryCurrency} · 14 days` : ''}
              </Text>
              <HomeSparkline
                points={sparklinePoints}
                isLoading={history.isLoading}
              />
            </View>

            <View style={{ marginTop: 14 }}>
              <PeriodTiles currencyCode={primaryCurrency} />
            </View>
          </>
        )}
      </LinearGradient>
    </View>
  );
}

