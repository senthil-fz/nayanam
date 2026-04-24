// Phase 9 Settings route. Replaces the Phase 4 stub.

import { Stack } from 'expo-router';
import { SettingsScreen } from '../src/features/settings/SettingsScreen';

export default function SettingsRoute() {
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
      <SettingsScreen />
    </>
  );
}
