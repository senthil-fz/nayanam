import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const BIOMETRIC_FLAG_KEY = 'nayanam-biometric-enabled';

export async function isBiometricAvailable(): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return false;
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return enrolled;
}

export async function getBiometricEnabled(): Promise<boolean> {
  const v = await SecureStore.getItemAsync(BIOMETRIC_FLAG_KEY);
  return v === '1';
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await SecureStore.setItemAsync(BIOMETRIC_FLAG_KEY, '1');
  } else {
    await SecureStore.deleteItemAsync(BIOMETRIC_FLAG_KEY);
  }
}

/** Tri-state result of a biometric prompt. */
export type BiometricResult =
  | 'authenticated' // Hardware present, enrolled, user verified.
  | 'not_available' // No hardware or no enrolled biometrics — NOT authenticated.
  | 'failed'; // Hardware present but prompt was denied/cancelled/error.

/**
 * Prompt for biometric authentication and return a tri-state result.
 * Returns `'not_available'` when no hardware or enrolment exists — callers
 * MUST NOT treat this as a successful authentication (it is NOT).
 */
export async function promptBiometric(
  reason = 'Unlock Nayanam',
): Promise<BiometricResult> {
  const ok = await isBiometricAvailable();
  if (!ok) return 'not_available';
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    disableDeviceFallback: false,
  });
  return result.success ? 'authenticated' : 'failed';
}
