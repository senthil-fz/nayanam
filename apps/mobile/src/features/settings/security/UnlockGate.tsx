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
// The gate is a pass-through when:
//   - User is not authenticated (no refresh token) → auth-stack owns their
//     screen.
//   - /me/security indicates neither biometric nor PIN is configured.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuthStore } from '../../../lib/api';
import { useMeSecurity } from '../../../lib/hooks';
import { PinEntryScreen } from './PinEntryScreen';

const LOCK_IDLE_MS = 5 * 60 * 1000; // 5 minutes per spec §UX Mobile.

export function UnlockGate({ children }: { children: React.ReactNode }) {
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const security = useMeSecurity();

  const biometricEnabled = Boolean(security.data?.biometricEnabled);
  const pinSet = Boolean(security.data?.pinSet);
  const gateActive = Boolean(refreshToken) && (biometricEnabled || pinSet);

  // Gate-locked = we WANT unlock interaction but biometric hasn't run yet.
  const [locked, setLocked] = useState<boolean>(gateActive);
  const [showPin, setShowPin] = useState<boolean>(false);
  const backgroundedAtRef = useRef<number | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const didInitRef = useRef(false);

  // When security data arrives and the gate becomes active (or irrelevant),
  // seed `locked` appropriately. We only transition once on boot —
  // subsequent locks are driven by the AppState listener below.
  useEffect(() => {
    if (!security.data || didInitRef.current) return;
    didInitRef.current = true;
    setLocked(gateActive);
  }, [security.data, gateActive]);

  // If the user signs out while locked, release the gate. If they sign in
  // on an account that has biometric/PIN configured, lock immediately.
  useEffect(() => {
    if (!refreshToken) {
      setLocked(false);
      setShowPin(false);
      didInitRef.current = false;
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

  // When `locked` flips true, kick off the biometric prompt (if enabled).
  useEffect(() => {
    if (!locked || !gateActive) return;
    let cancelled = false;
    void (async () => {
      if (biometricEnabled) {
        const ok = await runBiometric();
        if (cancelled) return;
        if (ok) {
          setLocked(false);
          setShowPin(false);
          return;
        }
        // Biometric failed / cancelled — fall through to PIN if set.
      }
      if (!cancelled) setShowPin(pinSet);
    })();
    return () => {
      cancelled = true;
    };
  }, [locked, gateActive, biometricEnabled, pinSet, runBiometric]);

  // AppState listener — background → foreground re-lock on idle > threshold.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      if (next === 'background' || next === 'inactive') {
        if (prev === 'active') backgroundedAtRef.current = Date.now();
        return;
      }
      if (next === 'active' && prev.match(/inactive|background/)) {
        const since = backgroundedAtRef.current;
        backgroundedAtRef.current = null;
        if (!gateActive) return;
        if (since == null) return;
        if (Date.now() - since >= LOCK_IDLE_MS) {
          setLocked(true);
          setShowPin(false);
        }
      }
    });
    return () => sub.remove();
  }, [gateActive]);

  if (!gateActive || !locked) {
    return <>{children}</>;
  }

  if (showPin && pinSet) {
    return (
      <PinEntryScreen
        onUnlock={() => {
          setLocked(false);
          setShowPin(false);
        }}
        onBiometricFallback={
          biometricEnabled
            ? () => {
                void (async () => {
                  const ok = await runBiometric();
                  if (ok) {
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

  // While biometric prompt is running, render nothing (OS dialog is modal).
  return null;
}
