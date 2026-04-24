// Settings — stack route (NOT a tab). Aligns with web where Settings is
// reached from the header avatar rather than primary navigation. Frees a
// bottom-tab slot for future primary surfaces (Bills / Stats).

import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { LIGHT } from '@nayanam/ui-tokens';
import { useLogout } from '../src/lib/hooks';

export default function SettingsScreen() {
  const logout = useLogout();
  const router = useRouter();
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Settings',
          headerShown: true,
          presentation: 'card',
          headerBackTitle: 'Back',
        }}
      />
      <SafeAreaView style={{ flex: 1, backgroundColor: LIGHT.bg }} edges={['bottom']}>
        <View style={{ padding: 20 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Manage categories"
            onPress={() => router.push('/categories')}
            style={({ pressed }) => ({
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
            accessibilityLabel="Manage budgets"
            onPress={() => router.push('/budgets')}
            style={({ pressed }) => ({
              marginTop: 10,
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
              Budgets
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
    </>
  );
}
