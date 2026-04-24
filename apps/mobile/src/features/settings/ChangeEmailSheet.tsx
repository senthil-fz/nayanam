// Two-step OTP email change. Step 1 → request OTP to new address. Step 2 →
// verify. Resend is disabled until `nextAllowedAt`.

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ChangeEmailRequestInput,
  ChangeEmailVerifyInput,
  type ChangeEmailRequestInputType,
  type ChangeEmailVerifyInputType,
} from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import {
  useRequestChangeEmail,
  useVerifyChangeEmail,
} from '../../lib/hooks';
import { useAppearance } from '../../lib/appearance';
import {
  FormError,
  FormLabel,
  PrimaryButton,
  SecondaryButton,
  SheetShell,
  type SheetHandle,
} from './SheetShell';
import { hapticError, hapticSuccess } from '../../lib/haptics';

type Stage = 'request' | 'verify';

export type ChangeEmailSheetHandle = SheetHandle;

export const ChangeEmailSheet = forwardRef<ChangeEmailSheetHandle, object>(
  function ChangeEmailSheet(_props, ref) {
    const inner = useRef<SheetHandle>(null);
    const [stage, setStage] = useState<Stage>('request');
    const [pendingEmail, setPendingEmail] = useState('');
    const [nextAllowedAt, setNextAllowedAt] = useState<string | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const appearance = useAppearance();

    const requestMut = useRequestChangeEmail();
    const verifyMut = useVerifyChangeEmail();

    useImperativeHandle(ref, () => ({
      present: () => {
        setStage('request');
        setPendingEmail('');
        setNextAllowedAt(null);
        inner.current?.present();
      },
      dismiss: () => inner.current?.dismiss(),
    }));

    useEffect(() => {
      if (!nextAllowedAt) return;
      const i = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(i);
    }, [nextAllowedAt]);

    const cooldownSec = useMemo(() => {
      if (!nextAllowedAt) return 0;
      const diff = Math.round((new Date(nextAllowedAt).getTime() - now) / 1000);
      return diff > 0 ? diff : 0;
    }, [nextAllowedAt, now]);

    const requestForm = useForm<ChangeEmailRequestInputType>({
      resolver: zodResolver(ChangeEmailRequestInput),
      defaultValues: { newEmail: '' },
    });
    const verifyForm = useForm<ChangeEmailVerifyInputType>({
      resolver: zodResolver(ChangeEmailVerifyInput),
      defaultValues: { otp: '' },
    });

    const onRequest = requestForm.handleSubmit(async (values) => {
      try {
        const res = await requestMut.mutateAsync({ newEmail: values.newEmail });
        setPendingEmail(values.newEmail);
        setNextAllowedAt(res.nextAllowedAt);
        setStage('verify');
      } catch (e) {
        hapticError();
        Alert.alert(
          'Could not send code',
          e instanceof Error ? e.message : 'Try again.',
        );
      }
    });

    const onResend = async () => {
      if (cooldownSec > 0 || !pendingEmail) return;
      try {
        const res = await requestMut.mutateAsync({ newEmail: pendingEmail });
        setNextAllowedAt(res.nextAllowedAt);
      } catch (e) {
        hapticError();
        Alert.alert(
          'Could not resend',
          e instanceof Error ? e.message : 'Try again.',
        );
      }
    };

    const onVerify = verifyForm.handleSubmit(async (values) => {
      try {
        await verifyMut.mutateAsync({ otp: values.otp });
        hapticSuccess();
        inner.current?.dismiss();
      } catch (e) {
        hapticError();
        Alert.alert(
          'Invalid code',
          e instanceof Error ? e.message : 'Try again.',
        );
      }
    });

    return (
      <SheetShell
        ref={inner}
        title={stage === 'request' ? 'Change email' : 'Verify email'}
        snapPoints={['55%']}
      >
        {stage === 'request' ? (
          <View style={{ gap: 16 }}>
            <View>
              <FormLabel text="New email" />
              <Controller
                control={requestForm.control}
                name="newEmail"
                render={({ field }) => (
                  <TextInput
                    accessibilityLabel="New email"
                    value={field.value}
                    onChangeText={field.onChange}
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    placeholder="you@example.com"
                    placeholderTextColor={LIGHT.textFaint}
                    style={inputStyle}
                  />
                )}
              />
              <FormError text={requestForm.formState.errors.newEmail?.message} />
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
                loading={requestMut.isPending}
                accent={appearance.accentHex}
              />
            </View>
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            <Text style={{ color: LIGHT.textDim, fontSize: 13 }}>
              Enter the 6-digit code we sent to{' '}
              <Text style={{ color: LIGHT.text, fontWeight: '600' }}>
                {pendingEmail}
              </Text>
              .
            </Text>
            <View>
              <FormLabel text="6-digit code" />
              <Controller
                control={verifyForm.control}
                name="otp"
                render={({ field }) => (
                  <TextInput
                    accessibilityLabel="Verification code"
                    value={field.value}
                    onChangeText={field.onChange}
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholder="••••••"
                    placeholderTextColor={LIGHT.textFaint}
                    style={[
                      inputStyle,
                      {
                        textAlign: 'center',
                        fontFamily: 'Geist Mono',
                        letterSpacing: 8,
                        fontSize: 18,
                      },
                    ]}
                  />
                )}
              />
              <FormError text={verifyForm.formState.errors.otp?.message} />
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text
                accessibilityRole="button"
                accessibilityLabel="Resend code"
                accessibilityState={{
                  disabled: cooldownSec > 0 || requestMut.isPending,
                }}
                onPress={
                  cooldownSec > 0 || requestMut.isPending
                    ? undefined
                    : () => void onResend()
                }
                style={{
                  color:
                    cooldownSec > 0 ? LIGHT.textDim : appearance.accentHex,
                  fontSize: 13,
                  fontWeight: '600',
                }}
              >
                {cooldownSec > 0
                  ? `Send again in ${String(cooldownSec)}s`
                  : 'Send again'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <SecondaryButton
                  label="Back"
                  onPress={() => setStage('request')}
                />
                <PrimaryButton
                  label="Verify"
                  onPress={() => void onVerify()}
                  loading={verifyMut.isPending}
                  accent={appearance.accentHex}
                />
              </View>
            </View>
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
