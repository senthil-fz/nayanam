// Whole-screen empty state — rendered when the household has zero
// non-transfer transactions in the selected period (overview.byCurrency
// is empty). The CTA routes to the Transactions tab, where the user can
// use the existing add-transaction flow. Matches web copy verbatim.

import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import type { StatsPeriodKind } from '@nayanam/core';
import { LIGHT, ACCENTS } from '@nayanam/ui-tokens';
import { hapticLight } from '../../lib/haptics';
import { periodLabel } from './util';

type Props = {
  period: StatsPeriodKind;
  canMutate: boolean;
};

export function StatsEmptyState({ period, canMutate }: Props) {
  const router = useRouter();

  return (
    <View
      style={{
        marginHorizontal: 20,
        borderRadius: 22,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: LIGHT.border,
        backgroundColor: LIGHT.surface,
        paddingHorizontal: 24,
        paddingVertical: 40,
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 999,
          backgroundColor: ACCENTS.indigo.soft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 14,
        }}
      >
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
          <Path
            d="M4 19V9m6 10V5m6 14v-7m4 7H2"
            stroke={ACCENTS.indigo.hex}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        </Svg>
      </View>
      <Text
        accessibilityRole="header"
        style={{ fontSize: 16, fontWeight: '700', color: LIGHT.text }}
      >
        No activity this {periodLabel(period)}
      </Text>
      <Text
        style={{
          marginTop: 4,
          fontSize: 12,
          color: LIGHT.textDim,
          textAlign: 'center',
        }}
      >
        Add a transaction to start seeing your stats.
      </Text>
      {canMutate ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a transaction"
          onPress={() => {
            hapticLight();
            router.push('/(tabs)/transactions');
          }}
          style={({ pressed }) => ({
            marginTop: 16,
            paddingHorizontal: 18,
            paddingVertical: 10,
            borderRadius: 999,
            backgroundColor: pressed ? LIGHT.text : ACCENTS.indigo.hex,
          })}
        >
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
            Add a transaction
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
