// Shared Settings primitives — grouped section + row + toggle + small utils.
// The iOS-style grouped-list look is a direct port of the prototype's
// `Section`/`Row` pattern from `screen-settings.jsx`.

import type { ReactNode } from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { LIGHT } from '@nayanam/ui-tokens';
import { hapticSelection } from '../../lib/haptics';
import { useAppearance } from '../../lib/appearance';

export function Section({
  title,
  children,
  style,
}: {
  title?: string;
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[{ marginBottom: 22 }, style]}>
      {title ? (
        <Text
          accessibilityRole="header"
          style={{
            fontSize: 10,
            color: LIGHT.textDim,
            letterSpacing: 1,
            fontFamily: 'Geist Mono',
            textTransform: 'uppercase',
            fontWeight: '600',
            paddingHorizontal: 20,
            marginBottom: 8,
          }}
        >
          {title}
        </Text>
      ) : null}
      <View
        style={{
          marginHorizontal: 16,
          backgroundColor: LIGHT.surface,
          borderWidth: 1,
          borderColor: LIGHT.border,
          borderRadius: 16,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </View>
  );
}

export function Row({
  icon,
  iconTint,
  label,
  sub,
  right,
  onPress,
  last,
  destructive,
  accessibilityHint,
}: {
  icon?: ReactNode;
  iconTint?: string;
  label: string;
  sub?: string;
  right?: ReactNode;
  onPress?: () => void;
  last?: boolean;
  destructive?: boolean;
  accessibilityHint?: string;
}) {
  const appearance = useAppearance();
  const tint = iconTint ?? appearance.accentHex;

  const inner = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: LIGHT.border,
      }}
    >
      {icon ? (
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            backgroundColor: `${tint}22`,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 14,
            fontWeight: '600',
            color: destructive ? LIGHT.negative : LIGHT.text,
          }}
        >
          {label}
        </Text>
        {sub ? (
          <Text
            numberOfLines={1}
            style={{
              fontSize: 11,
              color: LIGHT.textDim,
              marginTop: 1,
            }}
          >
            {sub}
          </Text>
        ) : null}
      </View>
      <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center' }}>
        {right ??
          (onPress ? <ChevronRight size={16} color={LIGHT.textDim} /> : null)}
      </View>
    </View>
  );

  if (!onPress) {
    return <View>{inner}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      android_ripple={{ color: LIGHT.chipBg }}
      style={({ pressed }) => ({
        backgroundColor: pressed ? LIGHT.chipBg : 'transparent',
      })}
    >
      {inner}
    </Pressable>
  );
}

export function Toggle({
  value,
  onChange,
  label,
  disabled,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  const appearance = useAppearance();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        if (disabled) return;
        hapticSelection();
        onChange(!value);
      }}
      style={{
        width: 36,
        height: 22,
        borderRadius: 11,
        backgroundColor: value ? appearance.accentHex : LIGHT.chipBg,
        opacity: disabled ? 0.5 : 1,
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: 2,
          left: value ? 16 : 2,
          width: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: '#fff',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.2,
          shadowRadius: 2,
          elevation: 2,
        }}
      />
    </Pressable>
  );
}

export function relativeTime(isoInput: string | null | undefined): string {
  if (!isoInput) return '—';
  const then = new Date(isoInput).getTime();
  if (Number.isNaN(then)) return '—';
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return 'just now';
  const mins = Math.round(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.round(days / 365);
  return `${years}y ago`;
}

export function Avatar({
  name,
  size = 40,
}: {
  name?: string | null;
  size?: number;
}) {
  const appearance = useAppearance();
  const initials = (name ?? '?')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `${appearance.accentHex}22`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize: size * 0.38,
          fontWeight: '700',
          color: appearance.accentHex,
        }}
      >
        {initials || '?'}
      </Text>
    </View>
  );
}
