import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LIGHT } from '@nayanam/ui-tokens';

export default function BillsTab() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LIGHT.bg }} edges={['top']}>
      <View style={{ padding: 20 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: LIGHT.text, letterSpacing: -0.5 }}>
          Bills
        </Text>
        <Text style={{ color: LIGHT.textDim, marginTop: 8 }}>
          Recurring bills land in Phase 5.
        </Text>
      </View>
    </SafeAreaView>
  );
}
