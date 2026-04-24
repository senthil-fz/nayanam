import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LIGHT } from '@nayanam/ui-tokens';

export default function StatsTab() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LIGHT.bg }} edges={['top']}>
      <View style={{ padding: 20 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: LIGHT.text, letterSpacing: -0.5 }}>
          Stats
        </Text>
        <Text style={{ color: LIGHT.textDim, marginTop: 8 }}>
          Category breakdowns land in Phase 6.
        </Text>
      </View>
    </SafeAreaView>
  );
}
