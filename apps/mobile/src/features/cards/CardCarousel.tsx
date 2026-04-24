// CardCarousel — horizontal swipe deck with snap-to-card physics.
//
// Visual model (ported from screen-cards.jsx):
//   - Promoted card is centered, full size, full opacity.
//   - Cards behind (at +1, +2) show a subtle `translateY: 12px, scale: 0.96`
//     stack effect. Anything beyond order 2 is faded to opacity 0.
//   - Dragging past the ends rubber-bands (overshoot clamped by 1/3 decel).
//
// On selection change we fire Haptics.impactAsync(Light).
//
// We use reanimated's `useSharedValue` + Gesture.Pan for snappy physics and
// native-driven transforms. react-native-reanimated-carousel was considered
// but the stack metaphor is non-linear in opacity/y and cleaner to own.

import { View, Pressable, useWindowDimensions } from 'react-native';
import { useCallback, useEffect } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import type { components } from '@nayanam/contracts';
import { CardArt } from './CardArt';
import { hapticLight } from '../../lib/haptics';

type Account = components['schemas']['Account'];

export type CardCarouselProps = {
  accounts: Account[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onOpenDetail?: (account: Account) => void;
  cardWidth?: number;
  cardHeight?: number;
  /** Tag a specific account as "Syncing…" while an offline create is pending. */
  syncingAccountIds?: Set<string>;
};

export function CardCarousel({
  accounts,
  selectedIndex,
  onSelect,
  onOpenDetail,
  cardWidth,
  cardHeight = 210,
  syncingAccountIds,
}: CardCarouselProps) {
  const { width: screenWidth } = useWindowDimensions();
  const effectiveWidth = cardWidth ?? screenWidth - 40; // 20px side padding
  const translateX = useSharedValue(0);

  // keep shared value in sync when external `selectedIndex` changes.
  useEffect(() => {
    translateX.value = withSpring(-selectedIndex * effectiveWidth, {
      damping: 22,
      stiffness: 160,
      mass: 0.7,
    });
  }, [selectedIndex, effectiveWidth, translateX]);

  const commitSelect = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(accounts.length - 1, idx));
      if (clamped !== selectedIndex) {
        hapticLight();
        onSelect(clamped);
      } else {
        translateX.value = withSpring(-clamped * effectiveWidth, {
          damping: 22,
          stiffness: 160,
          mass: 0.7,
        });
      }
    },
    [accounts.length, effectiveWidth, onSelect, selectedIndex, translateX],
  );

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((e) => {
      // Rubber-band at the ends
      const minX = -(accounts.length - 1) * effectiveWidth;
      const maxX = 0;
      const base = -selectedIndex * effectiveWidth;
      let next = base + e.translationX;
      if (next > maxX) next = maxX + (next - maxX) / 3;
      if (next < minX) next = minX + (next - minX) / 3;
      translateX.value = next;
    })
    .onEnd((e) => {
      const velocity = e.velocityX;
      let target = selectedIndex;
      // Fling detection
      if (velocity < -500) target = selectedIndex + 1;
      else if (velocity > 500) target = selectedIndex - 1;
      else {
        const offset = e.translationX;
        if (offset < -effectiveWidth / 3) target = selectedIndex + 1;
        else if (offset > effectiveWidth / 3) target = selectedIndex - 1;
      }
      runOnJS(commitSelect)(target);
    });

  return (
    <View
      style={{
        height: cardHeight + 60, // leave room for stack offset below
        paddingHorizontal: 20,
      }}
    >
      <GestureDetector gesture={pan}>
        <View style={{ flex: 1 }}>
          {accounts.map((account, i) => (
            <CarouselCard
              key={account.id}
              index={i}
              selectedIndex={selectedIndex}
              translateX={translateX}
              width={effectiveWidth - 0}
              height={cardHeight}
              count={accounts.length}
              onTap={() => {
                if (i === selectedIndex) {
                  onOpenDetail?.(account);
                } else {
                  hapticLight();
                  onSelect(i);
                }
              }}
            >
              <CardArt
                nickname={account.nickname}
                type={account.type}
                last4={account.last4}
                colorToken={account.colorToken}
                balanceMinor={account.cachedBalanceMinor}
                currencyCode={account.currencyCode}
                height={cardHeight}
                syncing={syncingAccountIds?.has(account.id)}
              />
            </CarouselCard>
          ))}
        </View>
      </GestureDetector>
    </View>
  );
}

type CarouselCardProps = {
  index: number;
  selectedIndex: number;
  translateX: SharedValue<number>;
  width: number;
  height: number;
  count: number;
  onTap: () => void;
  children: React.ReactNode;
};

function CarouselCard({
  index,
  translateX,
  width,
  height,
  count,
  onTap,
  children,
}: CarouselCardProps) {
  const animatedStyle = useAnimatedStyle(() => {
    // Distance from this card to "center". 0 = promoted.
    const position = translateX.value / width + index;
    const absPos = Math.abs(position);

    // Cards to the right (position < 0) sit behind with stack effect.
    // Cards to the left (position > 0) have already swiped away — fade.
    const translateYStack = interpolate(
      position,
      [-2, -1, 0, 1],
      [24, 12, 0, 0],
      Extrapolation.CLAMP,
    );
    const scaleStack = interpolate(
      position,
      [-2, -1, 0, 1],
      [0.92, 0.96, 1, 1],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      absPos,
      [0, 1, 2, 3],
      [1, 0.88, 0.35, 0],
      Extrapolation.CLAMP,
    );

    return {
      transform: [
        { translateX: translateX.value + index * width },
        { translateY: translateYStack },
        { scale: scaleStack },
      ],
      opacity,
      zIndex: count - Math.round(absPos),
    };
  }, [width, count]);

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height,
        },
        animatedStyle,
      ]}
    >
      <Pressable
        onPress={onTap}
        accessibilityRole="button"
        style={{ flex: 1 }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
