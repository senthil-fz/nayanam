import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LIGHT } from '@nayanam/ui-tokens';
import { useLogout } from '../../src/lib/hooks';

export default function SettingsTab() {
  const logout = useLogout();
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LIGHT.bg }} edges={['top']}>
      <View style={{ padding: 20 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: LIGHT.text, letterSpacing: -0.5 }}>
          Settings
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Manage categories"
          onPress={() => router.push('/categories')}
          style={({ pressed }) => ({
            marginTop: 20,
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: 14,
            backgroundColor: pressed ? LIGHT.chipBg : LIGHT.surface,
            borderWidth: 1,
            borderColor: LIGHT.border,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          })}
        >
          <Text style={{ color: LIGHT.text, fontWeight: '600', fontSize: 15 }}>
            Manage categories
          </Text>
          <Text style={{ color: LIGHT.textFaint, fontSize: 17 }}>›</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out"
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
