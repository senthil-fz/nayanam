// Forgot-PIN flow: email + OTP to `/auth/otp/verify-for-security` → new PIN.
// Re-uses the Phase 1 OTP pipeline by calling `useRequestOtp` to send the
// code, then exchanges via `useVerifyOtpForSecurity` for a short-lived token
// that `useUpdateMeSecurity({ otpToken, pin })` accepts as a PIN-reset proof.

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { LIGHT } from '@nayanam/ui-tokens';
import {
  useMePhase9,
  useRequestOtp,
  useUpdateMeSecurity,
  useVerifyOtpForSecurity,
} from '../../lib/hooks';
import { useAppearance } from '../../lib/appearance';
import {
  FormLabel,
  PrimaryButton,
  SecondaryButton,
  SheetShell,
  type SheetHandle,
} from './SheetShell';
import { PinKeypad } from './security/PinKeypad';
import { hapticError, hapticSuccess } from '../../lib/haptics';

type Stage = 'request' | 'otp' | 'pin';

export type PinForgotSheetHandle = SheetHandle;

export const PinForgotSheet = forwardRef<PinForgotSheetHandle, object>(
  function PinForgotSheet(_props, ref) {
    const inner = useRef<SheetHandle>(null);
    const me = useMePhase9();
    const request = useRequestOtp();
    const verify = useVerifyOtpForSecurity();
    const update = useUpdateMeSecurity();
    const appearance = useAppearance();

    const [stage, setStage] = useState<Stage>('request');
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [otpToken, setOtpToken] = useState<string | null>(null);
    const [pin, setPin] = useState('');

    useImperativeHandle(ref, () => ({
      present: () => {
        setStage('request');
        setEmail(me.data?.user.email ?? '');
        setOtp('');
        setOtpToken(null);
        setPin('');
        inner.current?.present();
      },
      dismiss: () => inner.current?.dismiss(),
    }));

    const onRequest = async () => {
      if (!email.trim()) return;
      // SECURITY: always use the server-confirmed email from the profile —
      // never send the displayed/client-supplied value. This prevents an
      // attacker who holds the device from resetting the PIN via an email
      // they control (Finding #6).
      const confirmedEmail = me.data?.user.email;
      if (!confirmedEmail) return;
      try {
        await request.mutateAsync(confirmedEmail);
        setStage('otp');
      } catch (e) {
        hapticError();
        Alert.alert(
          'Could not send code',
          e instanceof Error ? e.message : 'Try again.',
        );
      }
    };

    const onVerify = async () => {
      if (otp.length !== 6) return;
      // SECURITY: use the server-confirmed email, not the displayed value.
      const confirmedEmail = me.data?.user.email;
      if (!confirmedEmail) return;
      try {
        const res = await verify.mutateAsync({ email: confirmedEmail, otp });
        setOtpToken(res.otpToken);
        setStage('pin');
      } catch (e) {
        hapticError();
        Alert.alert(
          'Invalid code',
          e instanceof Error ? e.message : 'Try again.',
        );
      }
    };

    const onNewPin = async (v: string) => {
      setPin(v);
      if (v.length !== 6) return;
      if (!otpToken) return;
      try {
        await update.mutateAsync({ otpToken, pin: v });
        hapticSuccess();
        inner.current?.dismiss();
      } catch (e) {
        hapticError();
        Alert.alert(
          'Could not reset PIN',
          e instanceof Error ? e.message : 'Try again.',
        );
        setPin('');
      }
    };

    return (
      <SheetShell ref={inner} title="Reset PIN" snapPoints={['85%']}>
        {stage === 'request' ? (
          <View style={{ gap: 16 }}>
            <Text style={{ color: LIGHT.textDim, fontSize: 13 }}>
              We&rsquo;ll send a 6-digit code to your email to verify it&rsquo;s
              really you.
            </Text>
            <View>
              <FormLabel text="Email" />
              {/* SECURITY: read-only — email is sourced from the authenticated
                  profile and cannot be edited by the user (Finding #6). */}
              <TextInput
                accessibilityLabel="Email (read-only)"
                value={me.data?.user.email ?? email}
                editable={false}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                style={[inputStyle, { color: LIGHT.textDim }]}
              />
            </View>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                gap: 8,
              }}
            >
              <SecondaryButton
                label="Cancel"
                onPress={() => inner.current?.dismiss()}
              />
              <PrimaryButton
                label="Send code"
                onPress={() => void onRequest()}
                loading={request.isPending}
                disabled={email.trim().length === 0}
                accent={appearance.accentHex}
              />
            </View>
          </View>
        ) : stage === 'otp' ? (
          <View style={{ gap: 16 }}>
            <Text style={{ color: LIGHT.textDim, fontSize: 13 }}>
              Enter the code we sent to{' '}
              <Text style={{ color: LIGHT.text, fontWeight: '600' }}>{email}</Text>.
            </Text>
            <TextInput
              accessibilityLabel="6-digit code"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="••••••"
              placeholderTextColor={LIGHT.textFaint}
              style={[
                inputStyle,
                {
                  textAlign: 'center',
                  letterSpacing: 8,
                  fontSize: 18,
                  fontFamily: 'Geist Mono',
                },
              ]}
            />
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                gap: 8,
              }}
            >
              <SecondaryButton
                label="Back"
                onPress={() => setStage('request')}
              />
              <PrimaryButton
                label="Verify"
                onPress={() => void onVerify()}
                loading={verify.isPending}
                disabled={otp.length !== 6}
                accent={appearance.accentHex}
              />
            </View>
          </View>
        ) : (
          <View style={{ paddingTop: 16 }}>
            <PinKeypad
              value={pin}
              onChange={(v) => void onNewPin(v)}
              label="Choose a new 6-digit PIN"
            />
          </View>
        )}
      </SheetShell>
    );
  },
);

const inputStyle = {
  borderWidth: 1,
  borderColor: LIGHT.border,
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 10,
  color: LIGHT.text,
  fontSize: 15,
} as const;
