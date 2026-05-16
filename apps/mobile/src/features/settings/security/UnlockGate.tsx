// App unlock gate — wraps children and requires biometric or PIN verification
// on cold start and after a configurable idle window (default 5 min).
//
// State machine (summarised):
//   [locked] → (biometric enabled)     → prompt OS biometric
//             success → [unlocked]
//             fallback / disabled      → render <PinEntryScreen/>
//                                       successful PIN → [unlocked]
//   [unlocked] → AppState transitions to background (record timestamp)
//             → AppState returns to active:
//                    delta < LOCK_IDLE_MS → stay unlocked
//                    delta ≥ LOCK_IDLE_MS → [locked]
//
// SECURITY: fail-closed design.
//   - On cold start, `locked = Boolean(refreshToken)` immediately so the gate
//     never shows children before unlock, even during /me/security loading.
//   - While loading or offline, the last-known security flags are read from
//     SecureStore so the gate decision survives offline.
//   - A blocking lock surface is rendered (not children) during loading/error.
//   - `lockedAt` persisted so a kill+reopen always re-prompts (Finding #7).
//
// Pass-through (renders children directly) only when:
//   - No refresh token → auth stack owns the screen.
//   - Both cached AND live security flags confirm neither biometric nor PIN.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuthStore } from '../../../lib/api';
import { useMeSecurity } from '../../../lib/hooks';
import { PinEntryScreen } from './PinEntryScreen';

const LOCK_IDLE_MS = 5 * 60 * 1000; // 5 minutes per spec §UX Mobile.

// SecureStore keys for offline-safe security flag cache.
const SS_BIOMETRIC_ENABLED = 'nayanam-sec-biometric-enabled';
const SS_PIN_SET = 'nayanam-sec-pin-set';
const SS_LOCKED_AT = 'nayanam-sec-locked-at';

const SECURE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

async function readCachedFlags(): Promise<{
  biometricEnabled: boolean;
  pinSet: boolean;
} | null> {
  const [bio, pin] = await Promise.all([
    SecureStore.getItemAsync(SS_BIOMETRIC_ENABLED, SECURE_OPTS),
    SecureStore.getItemAsync(SS_PIN_SET, SECURE_OPTS),
  ]);
  if (bio === null && pin === null) return null;
  return { biometricEnabled: bio === '1', pinSet: pin === '1' };
}

async function writeCachedFlags(
  biometricEnabled: boolean,
  pinSet: boolean,
): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(
      SS_BIOMETRIC_ENABLED,
      biometricEnabled ? '1' : '0',
      SECURE_OPTS,
    ),
    SecureStore.setItemAsync(SS_PIN_SET, pinSet ? '1' : '0', SECURE_OPTS),
  ]);
}

async function writeLockedAt(ts: number | null): Promise<void> {
  if (ts === null) {
    await SecureStore.deleteItemAsync(SS_LOCKED_AT, SECURE_OPTS);
  } else {
    await SecureStore.setItemAsync(SS_LOCKED_AT, String(ts), SECURE_OPTS);
  }
}

export function UnlockGate({ children }: { children: React.ReactNode }) {
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const security = useMeSecurity();

  // Derived from live data (may be false while loading).
  const biometricEnabled = Boolean(security.data?.biometricEnabled);
  const pinSet = Boolean(security.data?.pinSet);
  const gateActive = Boolean(refreshToken) && (biometricEnabled || pinSet);

  // SECURITY: Start locked whenever there is a refresh token.
  // This is the fail-closed default — we never show children until we know
  // the security configuration, even while /me/security is loading.
  const [locked, setLocked] = useState<boolean>(Boolean(refreshToken));
  const [showPin, setShowPin] = useState<boolean>(false);
  // Whether we have resolved the security config at least once (live or cache).
  const didInitRef = useRef(false);
  const backgroundedAtRef = useRef<number | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // On boot: read cached flags from SecureStore so offline cold-starts work.
  // If we have a cache and no security is configured, release the lock early
  // rather than waiting for the live /me/security response.
  useEffect(() => {
    if (!refreshToken) return;
    if (didInitRef.current) return;
    void (async () => {
      if (didInitRef.current) return; // Live data beat us.
      const cached = await readCachedFlags();
      if (didInitRef.current) return; // Live data beat us.
      if (cached && !cached.biometricEnabled && !cached.pinSet) {
        // Cache says no security — release the lock before live data arrives.
        setLocked(false);
      }
      // Otherwise stay locked; wait for live data or biometric prompt.
    })();
  }, [refreshToken]);

  // Always keep the SecureStore offline cache fresh whenever live data arrives
  // (no didInitRef guard — this must run on every change so a mid-session
  // enable/disable of PIN or biometric is reflected on the next cold start).
  useEffect(() => {
    if (!security.data) return;
    void writeCachedFlags(security.data.biometricEnabled, security.data.pinSet);
  }, [security.data]);

  // One-time init: when live /me/security data first arrives, commit the
  // definitive locked state. The didInitRef guard ensures this runs exactly
  // once per session — subsequent data changes (e.g. mid-session toggle) must
  // NOT re-run setLocked here or they would re-lock an already-unlocked user.
  useEffect(() => {
    if (!security.data) return;
    if (didInitRef.current) return;
    didInitRef.current = true;
    const liveGateActive =
      security.data.biometricEnabled || security.data.pinSet;
    if (!refreshToken || !liveGateActive) {
      setLocked(false);
    } else {
      setLocked(true);
    }
  }, [security.data, refreshToken]);

  // If the user signs out, release the gate and reset state.
  useEffect(() => {
    if (!refreshToken) {
      setLocked(false);
      setShowPin(false);
      didInitRef.current = false;
      void writeLockedAt(null);
    }
  }, [refreshToken]);

  const runBiometric = useCallback(async (): Promise<boolean> => {
    try {
      const hasHw = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHw || !enrolled) return false;
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Nayanam',
        fallbackLabel: 'Use PIN',
        disableDeviceFallback: false,
      });
      return res.success;
    } catch {
      return false;
    }
  }, []);

  // When `locked` flips true, prompt biometric (from live or cached flags).
  useEffect(() => {
    if (!locked) return;
    let cancelled = false;
    void (async () => {
      // Determine flags: prefer live data; fall back to cache for offline.
      let useBiometric = biometricEnabled;
      let usePin = pinSet;
      if (!security.data) {
        const cached = await readCachedFlags();
        if (cached) {
          useBiometric = cached.biometricEnabled;
          usePin = cached.pinSet;
        }
      }

      if (useBiometric) {
        const ok = await runBiometric();
        if (cancelled) return;
        if (ok) {
          void writeLockedAt(null);
          setLocked(false);
          setShowPin(false);
          return;
        }
        // Biometric failed/cancelled — fall through to PIN if set.
      }
      if (!cancelled) setShowPin(usePin);
    })();
    return () => {
      cancelled = true;
    };
  }, [locked, biometricEnabled, pinSet, security.data, runBiometric]);

  // AppState listener — background → foreground re-lock on idle > threshold.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      if (next === 'background' || next === 'inactive') {
        if (prev === 'active') {
          const now = Date.now();
          backgroundedAtRef.current = now;
          // Persist lockedAt so kill+reopen always re-prompts (Finding #7).
          void writeLockedAt(now);
        }
        return;
      }
      if (next === 'active' && prev.match(/inactive|background/)) {
        const since = backgroundedAtRef.current;
        backgroundedAtRef.current = null;
        // Only re-lock when security is configured.
        const wouldLock =
          Boolean(refreshToken) &&
          didInitRef.current &&
          (biometricEnabled || pinSet);
        if (!wouldLock) return;
        if (since == null) return;
        if (Date.now() - since >= LOCK_IDLE_MS) {
          setLocked(true);
          setShowPin(false);
        }
      }
    });
    return () => sub.remove();
  }, [gateActive, biometricEnabled, pinSet, refreshToken]);

  // --- Render -------------------------------------------------------------------

  // No session — auth stack handles it; gate is transparent.
  if (!refreshToken) {
    return <>{children}</>;
  }

  // Live data resolved with no security, and init committed — no gate needed.
  if (didInitRef.current && !gateActive) {
    return <>{children}</>;
  }

  // Gate is active and locked — do NOT render children.
  if (locked) {
    if (showPin) {
      return (
        <PinEntryScreen
          onUnlock={() => {
            void writeLockedAt(null);
            setLocked(false);
            setShowPin(false);
          }}
          onBiometricFallback={
            biometricEnabled
              ? () => {
                  void (async () => {
                    const ok = await runBiometric();
                    if (ok) {
                      void writeLockedAt(null);
                      setLocked(false);
                      setShowPin(false);
                    }
                  })();
                }
              : undefined
          }
        />
      );
    }
    // Biometric prompt running or loading — render nothing (OS dialog is modal).
    return null;
  }

  return <>{children}</>;
}
