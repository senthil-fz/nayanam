// Selected-card summary row (below the deck): monospace eyebrow + large
// balance on the left, 6-month Sparkline on the right. Mirrors the prototype's
// CardsScreen "Selected summary" block.

import { View, Text } from 'react-native';
import { ACCENTS, LIGHT } from '@nayanam/ui-tokens';
import { formatMoney } from '@nayanam/core';
import { Sparkline } from './Sparkline';
import { useBalanceHistory } from '../../lib/hooks';

type Props = {
  accountId: string;
  type: 'DEBIT' | 'CREDIT' | 'SAVINGS' | 'CASH';
  last4: string | null;
  balanceMinor: string;
  currencyCode: string;
};

export function SelectedCardSummary({
  accountId,
  type,
  last4,
  balanceMinor,
  currencyCode,
}: Props) {
  const history = useBalanceHistory(accountId, 6);
  const values =
    history.data?.points.map((p) => Number(p.balanceMinor)) ?? [];

  const balanceNumber = Number(balanceMinor);
  const negative = balanceNumber < 0;
  const formatted = formatMoney(Math.abs(balanceNumber).toString(), currencyCode);
  const last2 = last4 ? last4.slice(-2) : '——';

  return (
    <View className="mb-3 flex-row items-center justify-between">
      <View className="flex-1 pr-3">
        <Text
          style={{
            fontSize: 11,
            color: LIGHT.textDim,
            letterSpacing: 0.6,
            fontFamily: 'Geist Mono',
          }}
        >
          {type} · •• {last2}
        </Text>
        <Text
          style={{
            fontSize: 22,
            fontWeight: '700',
            color: LIGHT.text,
            marginTop: 2,
            letterSpacing: -0.5,
          }}
          numberOfLines={1}
        >
          {negative ? '–' : ''}
          {formatted}
        </Text>
      </View>
      <Sparkline
        values={values}
        width={96}
        height={34}
        stroke={ACCENTS.indigo.hex}
        fill={ACCENTS.indigo.hex + '22'}
        loading={history.isLoading}
      />
    </View>
  );
}
