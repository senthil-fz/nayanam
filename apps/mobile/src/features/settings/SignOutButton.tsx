// Destructive sign-out button with a confirm alert.

import { Alert, Pressable, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { LIGHT } from '@nayanam/ui-tokens';
import { useLogout } from '../../lib/hooks';
import { hapticMedium } from '../../lib/haptics';

export function SignOutButton() {
  const logout = useLogout();

  const onPress = () => {
    Alert.alert(
      'Sign out?',
      'You will need to sign in again on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => {
            hapticMedium();
            logout.mutate();
          },
        },
      ],
    );
  };

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 20 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        onPress={onPress}
        disabled={logout.isPending}
        style={({ pressed }) => ({
          borderWidth: 1,
          borderColor: LIGHT.border,
          backgroundColor: pressed ? LIGHT.chipBg : LIGHT.surface,
          borderRadius: 14,
          paddingVertical: 14,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: logout.isPending ? 0.6 : 1,
        })}
      >
        <X size={16} color={LIGHT.negative} />
        <Text style={{ color: LIGHT.negative, fontSize: 14, fontWeight: '600' }}>
          {logout.isPending ? 'Signing out…' : 'Sign out'}
        </Text>
      </Pressable>
    </View>
  );
}
