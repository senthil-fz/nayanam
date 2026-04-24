// Full-screen PIN unlock surface. Renders on top of the Stack when the
// UnlockGate decides the app is locked. Submits `verifyMePin` on 6 digits;
// shows "too many attempts" copy once server returns PIN_LOCKED; offers
// Forgot PIN affordance that opens PinForgotSheet.

import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiRequestError } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { useVerifyMePin } from '../../../lib/hooks';
import { useAppearance } from '../../../lib/appearance';
import { hapticError, hapticSuccess } from '../../../lib/haptics';
import { PinKeypad } from './PinKeypad';
import {
  PinForgotSheet,
  type PinForgotSheetHandle,
} from '../PinForgotSheet';

export function PinEntryScreen({
  onUnlock,
  onBiometricFallback,
}: {
  onUnlock: () => void;
  onBiometricFallback?: () => void;
}) {
  const verify = useVerifyMePin();
  const appearance = useAppearance();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [locked, setLocked] = useState(false);
  const forgotRef = useRef<PinForgotSheetHandle>(null);

  useEffect(() => {
    if (pin.length !== 6 || locked) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await verify.mutateAsync({ pin });
        if (cancelled) return;
        if (res.ok) {
          hapticSuccess();
          onUnlock();
        } else {
          hapticError();
          setError('Incorrect PIN.');
          setPin('');
        }
      } catch (e) {
        if (cancelled) return;
        hapticError();
        if (e instanceof ApiRequestError && e.code === 'PIN_LOCKED') {
          setLocked(true);
          setError('Too many attempts. Try again later or reset your PIN.');
          setPin('');
          return;
        }
        setError(
          e instanceof ApiRequestError && e.code === 'PIN_INVALID'
            ? 'Incorrect PIN.'
            : e instanceof Error
              ? e.message
              : 'Try again.',
        );
        setPin('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pin, locked, verify, onUnlock]);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: LIGHT.bg, justifyContent: 'center' }}
    >
      <View style={{ paddingHorizontal: 20, gap: 24 }}>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text
            style={{ fontSize: 22, fontWeight: '700', color: LIGHT.text }}
          >
            Unlock Nayanam
          </Text>
          <Text style={{ fontSize: 13, color: LIGHT.textDim }}>
            Enter your 6-digit PIN to continue
          </Text>
        </View>
        <PinKeypad
          value={pin}
          onChange={setPin}
          error={error}
          accentHexOverride={appearance.accentHex}
        />
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 20,
          }}
        >
          {onBiometricFallback ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Use biometric"
              onPress={onBiometricFallback}
            >
              <Text
                style={{
                  color: appearance.accentHex,
                  fontSize: 13,
                  fontWeight: '600',
                }}
              >
                Use biometric
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Forgot PIN"
            onPress={() => forgotRef.current?.present()}
          >
            <Text
              style={{
                color: appearance.accentHex,
                fontSize: 13,
                fontWeight: '600',
              }}
            >
              Forgot PIN
            </Text>
          </Pressable>
        </View>
      </View>
      <PinForgotSheet ref={forgotRef} />
    </SafeAreaView>
  );
}
