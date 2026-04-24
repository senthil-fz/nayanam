// CardArt — RN translation of `screen-cards.jsx` CardArt().
// The prototype renders an HTML div with a 135° linear gradient, decorative
// SVG curves, chip + contactless glyph, a masked card number, nickname
// bottom-left, and balance bottom-right. We keep the same geometry exactly.

import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle } from 'react-native-svg';
import {
  ACCOUNT_COLORS,
  type AccountColorToken,
  DEFAULT_ACCOUNT_COLOR,
} from '@nayanam/ui-tokens';
import { formatMoney } from '@nayanam/core';

export type CardArtProps = {
  nickname: string;
  type: 'DEBIT' | 'CREDIT' | 'SAVINGS' | 'CASH';
  last4: string | null;
  colorToken: string;
  balanceMinor: string;
  currencyCode: string;
  width?: number;
  height?: number;
  syncing?: boolean;
};

function gradientFor(token: string) {
  const key = (ACCOUNT_COLORS as Record<string, { from: string; to: string }>)[token]
    ? (token as AccountColorToken)
    : DEFAULT_ACCOUNT_COLOR;
  return ACCOUNT_COLORS[key];
}

export function CardArt({
  nickname,
  type,
  last4,
  colorToken,
  balanceMinor,
  currencyCode,
  width,
  height = 210,
  syncing = false,
}: CardArtProps) {
  const g = gradientFor(colorToken);
  const balanceNumber = Number(balanceMinor);
  const negative = balanceNumber < 0;
  const formatted = formatMoney(
    Math.abs(balanceNumber).toString(),
    currencyCode,
  );
  const masked = last4 ? `•••• •••• •••• ${last4}` : '•••• •••• •••• ••••';

  return (
    <View
      style={{
        width: width ?? '100%',
        height,
        borderRadius: 24,
        overflow: 'hidden',
        shadowColor: g.from,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.25,
        shadowRadius: 30,
        elevation: 12,
      }}
      accessibilityRole="summary"
      accessibilityLabel={`${nickname}, ${type} card ending ${last4 ?? 'unknown'}, balance ${formatted}`}
    >
      <LinearGradient
        colors={[g.from, g.to]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, padding: 20 }}
      >
        {/* decorative curves — identical geometry to prototype */}
        <Svg
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.25 }}
          width="100%"
          height="100%"
          viewBox="0 0 362 210"
          preserveAspectRatio="none"
        >
          <Path d="M-20 140 Q 100 80 200 130 T 400 100" stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} fill="none" />
          <Path d="M-20 170 Q 100 110 200 160 T 400 130" stroke="rgba(255,255,255,0.3)" strokeWidth={1.5} fill="none" />
          <Circle cx={320} cy={30} r={70} fill="rgba(255,255,255,0.08)" />
        </Svg>

        {/* brand row */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                backgroundColor: 'rgba(255,255,255,0.22)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: -0.5 }}>N</Text>
            </View>
            <Text
              style={{
                color: '#fff',
                fontSize: 13,
                fontWeight: '600',
                letterSpacing: 0.2,
              }}
              numberOfLines={1}
            >
              Nayanam
            </Text>
          </View>
          <Text
            style={{
              color: '#fff',
              fontSize: 9,
              letterSpacing: 1,
              opacity: 0.8,
              fontFamily: 'Geist Mono',
            }}
          >
            {type}
          </Text>
        </View>

        {/* chip + contactless */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 }}>
          <View
            style={{
              width: 34,
              height: 26,
              borderRadius: 5,
              backgroundColor: 'rgba(255,255,255,0.55)',
            }}
          >
            <View
              style={{
                position: 'absolute',
                top: 3,
                right: 3,
                bottom: 3,
                left: 3,
                borderRadius: 3,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.5)',
              }}
            />
          </View>
          <Svg width={22} height={22} viewBox="0 0 24 24" opacity={0.85}>
            <Path d="M8 8a5 5 0 016 0M5 5a9 9 0 0112 0M11 11a1 1 0 011 0" stroke="#fff" strokeWidth={1.8} fill="none" strokeLinecap="round" />
          </Svg>
        </View>

        {/* masked card number */}
        <Text
          style={{
            marginTop: 20,
            fontSize: 16,
            letterSpacing: 4,
            fontWeight: '500',
            color: '#fff',
            fontFamily: 'Geist Mono',
          }}
        >
          {masked}
        </Text>

        {/* footer: nickname + balance */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginTop: 16,
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ color: '#fff', fontSize: 9, letterSpacing: 1, opacity: 0.7, fontFamily: 'Geist Mono' }}>
              ACCOUNT
            </Text>
            <Text
              style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}
              numberOfLines={1}
            >
              {nickname}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: '#fff', fontSize: 9, letterSpacing: 1, opacity: 0.7, fontFamily: 'Geist Mono' }}>
              BALANCE
            </Text>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', fontFamily: 'Geist Mono' }}>
              {negative ? '–' : ''}
              {formatted}
            </Text>
          </View>
        </View>

        {syncing && (
          <View
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              backgroundColor: 'rgba(255,255,255,0.24)',
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 999,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600', letterSpacing: 0.4 }}>
              Syncing…
            </Text>
          </View>
        )}
      </LinearGradient>
    </View>
  );
}
