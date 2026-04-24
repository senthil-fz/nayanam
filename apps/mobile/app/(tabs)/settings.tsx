import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LIGHT } from '@nayanam/ui-tokens';
import { useLogout } from '../../src/lib/hooks';

export default function SettingsTab() {
  const logout = useLogout();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LIGHT.bg }} edges={['top']}>
      <View style={{ padding: 20 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: LIGHT.text, letterSpacing: -0.5 }}>
          Settings
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => logout.mutate()}
          style={{
            marginTop: 20,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: 12,
            backgroundColor: LIGHT.chipBg,
            alignSelf: 'flex-start',
          }}
        >
          <Text style={{ color: LIGHT.text, fontWeight: '600' }}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
