// QuickActions — 4-button grid matching prototype CardsScreen quick-actions row.
// v1: only "Manage" is wired; Send/Top-up/Freeze show a disabled state with a
// "Coming soon" affordance (spec §Non-goals).

import { View, Pressable, Text } from 'react-native';
import { LIGHT } from '@nayanam/ui-tokens';
import { SendIcon, TopupIcon, FlashIcon, SettingsIcon } from './icons';
import { hapticLight } from '../../lib/haptics';

type Action = {
  key: 'send' | 'topup' | 'freeze' | 'manage';
  label: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  disabled: boolean;
};

const actions: Action[] = [
  { key: 'send',   label: 'Send',   Icon: SendIcon,     disabled: true },
  { key: 'topup',  label: 'Top-up', Icon: TopupIcon,    disabled: true },
  { key: 'freeze', label: 'Freeze', Icon: FlashIcon,    disabled: true },
  { key: 'manage', label: 'Manage', Icon: SettingsIcon, disabled: false },
];

export function QuickActions({ onManage }: { onManage: () => void }) {
  return (
    <View className="mb-4 flex-row" style={{ gap: 8 }}>
      {actions.map((a) => {
        const enabled = !a.disabled;
        const color = enabled ? LIGHT.text : LIGHT.textFaint;
        return (
          <Pressable
            key={a.key}
            accessibilityRole="button"
            accessibilityLabel={enabled ? a.label : `${a.label} (coming soon)`}
            accessibilityState={{ disabled: !enabled }}
            disabled={!enabled}
            onPress={() => {
              hapticLight();
              if (a.key === 'manage') onManage();
            }}
            style={({ pressed }) => ({
              flex: 1,
              backgroundColor: LIGHT.surface,
              borderWidth: 1,
              borderColor: LIGHT.border,
              borderRadius: 16,
              paddingVertical: 12,
              paddingHorizontal: 4,
              alignItems: 'center',
              opacity: pressed && enabled ? 0.75 : enabled ? 1 : 0.55,
            })}
          >
            <a.Icon size={18} color={color} />
            <Text
              style={{
                fontSize: 10,
                fontWeight: '600',
                letterSpacing: 0.2,
                color,
                marginTop: 6,
              }}
              numberOfLines={1}
            >
              {a.label}
            </Text>
            {!enabled && (
              <Text
                style={{
                  fontSize: 8,
                  color: LIGHT.textFaint,
                  marginTop: 2,
                  letterSpacing: 0.3,
                }}
              >
                Soon
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
