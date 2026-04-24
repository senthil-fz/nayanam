// Static monthly-budget placeholder. Real data lands in Phase 6.

import { Text, View } from 'react-native';
import { Target } from 'lucide-react-native';
import { LIGHT } from '@nayanam/ui-tokens';

export function BudgetPlaceholder() {
  return (
    <View
      accessibilityLabel="Monthly budget placeholder"
      style={{
        marginTop: 14,
        marginHorizontal: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        backgroundColor: LIGHT.surface,
        borderWidth: 1,
        borderColor: LIGHT.border,
        borderRadius: 20,
        padding: 14,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: LIGHT.chipBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Target size={20} color={LIGHT.textDim} strokeWidth={1.5} />
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: LIGHT.text }}>
          Monthly budget
        </Text>
        <Text style={{ fontSize: 12, color: LIGHT.textDim, marginTop: 2 }}>
          Budgets arrive in a later release.
        </Text>
      </View>
    </View>
  );
}
