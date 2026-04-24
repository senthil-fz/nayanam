// Theme segmented (Light / Dark / System) + 8-swatch accent grid. Purely
// client-side via the shared `createAppearanceStore`. No server call.

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Moon, Smartphone, Sun } from 'lucide-react-native';
import {
  ACCOUNT_COLORS,
  ACCOUNT_COLOR_TOKENS,
} from '@nayanam/ui-tokens';
import type { AppearanceTheme } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { useAppearanceStore } from '../../lib/hooks';
import { useAppearance } from '../../lib/appearance';
import { SheetShell, type SheetHandle } from './SheetShell';
import { hapticSelection } from '../../lib/haptics';

const THEME_OPTIONS: {
  value: AppearanceTheme;
  label: string;
  icon: React.ComponentType<{ size: number; color: string }>;
}[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Smartphone },
];

export type AppearanceSheetHandle = SheetHandle;

export const AppearanceSheet = forwardRef<AppearanceSheetHandle, object>(
  function AppearanceSheet(_props, ref) {
    const inner = useRef<SheetHandle>(null);
    const theme = useAppearanceStore((s) => s.theme);
    const accentToken = useAppearanceStore((s) => s.accentToken);
    const setTheme = useAppearanceStore((s) => s.setTheme);
    const setAccentToken = useAppearanceStore((s) => s.setAccentToken);
    const appearance = useAppearance();

    useImperativeHandle(ref, () => ({
      present: () => inner.current?.present(),
      dismiss: () => inner.current?.dismiss(),
    }));

    return (
      <SheetShell ref={inner} title="Appearance" snapPoints={['60%']}>
        <View style={{ gap: 24 }}>
          <View>
            <Text
              style={{
                fontSize: 11,
                color: LIGHT.textDim,
                fontWeight: '600',
                marginBottom: 10,
              }}
            >
              THEME
            </Text>
            <View
              accessibilityRole="radiogroup"
              style={{
                flexDirection: 'row',
                backgroundColor: LIGHT.chipBg,
                borderRadius: 12,
                padding: 4,
                gap: 4,
              }}
            >
              {THEME_OPTIONS.map((opt) => {
                const active = theme === opt.value;
                const Icon = opt.icon;
                return (
                  <Pressable
                    key={opt.value}
                    accessibilityRole="radio"
                    accessibilityLabel={opt.label}
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      hapticSelection();
                      setTheme(opt.value);
                    }}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 9,
                      backgroundColor: active ? LIGHT.surface : 'transparent',
                      alignItems: 'center',
                      flexDirection: 'row',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <Icon size={14} color={active ? LIGHT.text : LIGHT.textDim} />
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: active ? LIGHT.text : LIGHT.textDim,
                      }}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View>
            <Text
              style={{
                fontSize: 11,
                color: LIGHT.textDim,
                fontWeight: '600',
                marginBottom: 10,
              }}
            >
              ACCENT COLOR
            </Text>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              {ACCOUNT_COLOR_TOKENS.map((token) => {
                const color = ACCOUNT_COLORS[token];
                const active = accentToken === token;
                return (
                  <Pressable
                    key={token}
                    accessibilityRole="button"
                    accessibilityLabel={`${color.name} accent`}
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      hapticSelection();
                      setAccentToken(token);
                    }}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      borderWidth: active ? 3 : 0,
                      borderColor: appearance.accentHex,
                      overflow: 'hidden',
                    }}
                  >
                    <LinearGradient
                      colors={[color.from, color.to]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{ flex: 1 }}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </SheetShell>
    );
  },
);
