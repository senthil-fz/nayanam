// Five-across quick actions matching the prototype + spec (prototype shipped
// 4; spec raises to 5 and wires Add expense / Add income / Transfer into the
// Phase 3 bottom sheets).

import { Alert, Pressable, Text, View, useWindowDimensions } from 'react-native';
import {
  ArrowRightLeft,
  Minus,
  Plus,
  Receipt,
  ScanLine,
} from 'lucide-react-native';
import { LIGHT, ACCENTS } from '@nayanam/ui-tokens';
import { hapticLight } from '../../lib/haptics';

type Action = {
  key: string;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  disabledReason?: string;
  onPress?: () => void;
};

type Props = {
  canMutate: boolean;
  lockReason?: string;
  onAddExpense: () => void;
  onAddIncome: () => void;
  onTransfer: () => void;
};

export function QuickActionsGrid({
  canMutate,
  lockReason,
  onAddExpense,
  onAddIncome,
  onTransfer,
}: Props) {
  const { width } = useWindowDimensions();
  const labelFontSize = width < 360 ? 10 : 11;
  const mutateDisabled = !canMutate;

  const runWithHaptic = (fn: () => void) => () => {
    hapticLight();
    fn();
  };

  const actions: Action[] = [
    {
      key: 'expense',
      label: 'Add expense',
      icon: <Minus size={18} color={ACCENTS.indigo.hex} />,
      disabled: mutateDisabled,
      disabledReason: lockReason,
      onPress: runWithHaptic(onAddExpense),
    },
    {
      key: 'income',
      label: 'Add income',
      icon: <Plus size={18} color={ACCENTS.indigo.hex} />,
      disabled: mutateDisabled,
      disabledReason: lockReason,
      onPress: runWithHaptic(onAddIncome),
    },
    {
      key: 'transfer',
      label: 'Transfer',
      icon: <ArrowRightLeft size={18} color={ACCENTS.indigo.hex} />,
      disabled: mutateDisabled,
      disabledReason: lockReason,
      onPress: runWithHaptic(onTransfer),
    },
    {
      key: 'scan',
      label: 'Scan',
      icon: <ScanLine size={18} color={ACCENTS.indigo.hex} />,
      disabled: true,
      disabledReason: 'Coming soon',
    },
    {
      key: 'bills',
      label: 'Bills',
      icon: <Receipt size={18} color={ACCENTS.indigo.hex} />,
      onPress: () => {
        hapticLight();
        Alert.alert('Bills', 'Bills arrives in Phase 5.');
      },
    },
  ];

  return (
    <View
      style={{
        paddingHorizontal: 20,
        marginTop: 14,
        flexDirection: 'row',
        gap: 8,
      }}
    >
      {actions.map((a) => (
        <Pressable
          key={a.key}
          accessibilityRole="button"
          accessibilityLabel={
            a.disabled ? `${a.label} (${a.disabledReason ?? 'disabled'})` : a.label
          }
          accessibilityState={{ disabled: Boolean(a.disabled) }}
          disabled={a.disabled}
          onPress={a.onPress}
          style={({ pressed }) => ({
            flex: 1,
            backgroundColor: LIGHT.surface,
            borderWidth: 1,
            borderColor: LIGHT.border,
            borderRadius: 18,
            paddingVertical: 12,
            paddingHorizontal: 4,
            alignItems: 'center',
            gap: 6,
            opacity: a.disabled ? 0.55 : pressed ? 0.85 : 1,
          })}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 11,
              backgroundColor: ACCENTS.indigo.soft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {a.icon}
          </View>
          <Text
            numberOfLines={1}
            style={{
              fontSize: labelFontSize,
              fontWeight: '600',
              color: LIGHT.text,
            }}
          >
            {a.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
