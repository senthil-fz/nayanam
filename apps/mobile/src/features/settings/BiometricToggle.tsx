// Biometric unlock toggle. Wraps the PATCH /me/security call and gates on
// hardware + enrolment via `expo-local-authentication`.

import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useMeSecurity, useUpdateMeSecurity } from '../../lib/hooks';
import { Toggle } from './primitives';
import { hapticError } from '../../lib/haptics';

export function BiometricToggle() {
  const security = useMeSecurity();
  const update = useUpdateMeSecurity();
  const [hardwareAvailable, setHardwareAvailable] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const hasHw = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (!cancelled) setHardwareAvailable(hasHw && enrolled);
      } catch {
        if (!cancelled) setHardwareAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onToggle = async (next: boolean) => {
    if (next && hardwareAvailable === false) {
      Alert.alert(
        'Biometric not available',
        'Set up Face ID or fingerprint in your device settings first.',
      );
      return;
    }
    try {
      await update.mutateAsync({ biometricEnabled: next });
    } catch (e) {
      hapticError();
      Alert.alert(
        'Could not update biometric',
        e instanceof Error ? e.message : 'Try again.',
      );
    }
  };

  return (
    <Toggle
      label="Biometric unlock"
      value={Boolean(security.data?.biometricEnabled)}
      disabled={
        !security.data || update.isPending || hardwareAvailable === false
      }
      onChange={(next) => void onToggle(next)}
    />
  );
}
