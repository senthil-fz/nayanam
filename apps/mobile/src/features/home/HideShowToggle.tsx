// Eye / EyeOff toggle bound to the persisted home store's `balancesHidden`.

import { Pressable } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { useHomeStore } from '../../lib/hooks';
import { hapticLight } from '../../lib/haptics';

export function HideShowToggle() {
  const balancesHidden = useHomeStore((s) => s.balancesHidden);
  const toggle = useHomeStore((s) => s.toggleBalancesHidden);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: balancesHidden }}
      accessibilityLabel={balancesHidden ? 'Show balances' : 'Hide balances'}
      onPress={() => {
        hapticLight();
        toggle();
      }}
      style={({ pressed }) => ({
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.22)',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {balancesHidden ? (
        <EyeOff size={14} color="#fff" />
      ) : (
        <Eye size={14} color="#fff" />
      )}
    </Pressable>
  );
}
