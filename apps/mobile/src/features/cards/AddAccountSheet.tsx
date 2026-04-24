// Bottom-sheet form to create an Account.
// Snap points: 90% only (spec). React Hook Form + Zod resolver from
// `packages/core/accounts/schemas` (CreateAccountInput).

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View, Text, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { BottomSheetModal, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateAccountInput, type CreateAccountInputType } from '@nayanam/core';
import { ACCENTS, DEFAULT_ACCOUNT_COLOR, DEFAULT_ACCOUNT_ICON, LIGHT } from '@nayanam/ui-tokens';
import { useCreateAccount } from '../../lib/hooks';
import { hapticError, hapticSuccess } from '../../lib/haptics';
import {
  ColorChipRow,
  IconChipRow,
  InputField,
  LabeledField,
  TypeSegmented,
} from './AccountFormFields';
import { CurrencyPicker } from './CurrencyPicker';
import { ChevRIcon } from './icons';

export type AddAccountSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

type Props = {
  defaultCurrencyCode?: string;
  onCreated?: (accountId: string) => void;
};

export const AddAccountSheet = forwardRef<AddAccountSheetHandle, Props>(
  function AddAccountSheet({ defaultCurrencyCode = 'USD', onCreated }, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const [currencyOpen, setCurrencyOpen] = useState(false);
    const createAccount = useCreateAccount();
    const snapPoints = useMemo(() => ['90%'], []);

    useImperativeHandle(ref, () => ({
      present: () => sheetRef.current?.present(),
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const { control, handleSubmit, reset, formState, setValue, watch } =
      useForm<CreateAccountInputType>({
        resolver: zodResolver(CreateAccountInput),
        defaultValues: {
          nickname: '',
          type: 'DEBIT',
          currencyCode: defaultCurrencyCode,
          institution: '',
          last4: null,
          colorToken: DEFAULT_ACCOUNT_COLOR,
          iconToken: DEFAULT_ACCOUNT_ICON,
          openingBalanceMinor: '0',
          openingBalanceAt: new Date().toISOString(),
        },
      });

    const currencyCode = watch('currencyCode');
    const colorToken = watch('colorToken') ?? DEFAULT_ACCOUNT_COLOR;
    const iconToken = watch('iconToken') ?? DEFAULT_ACCOUNT_ICON;

    const onSubmit = handleSubmit(async (values) => {
      try {
        const payload: CreateAccountInputType = {
          ...values,
          institution: values.institution?.trim() || null,
          last4: values.last4?.trim() || null,
        };
        const created = await createAccount.mutateAsync(payload);
        hapticSuccess();
        reset();
        sheetRef.current?.dismiss();
        onCreated?.(created.id);
      } catch (err) {
        hapticError();
        // Surface the API error code via the form via `openingBalanceMinor` field
        // for v1; a dedicated toast system lands in a later phase.
        console.warn('Create account failed', err);
      }
    });

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.35}
        />
      ),
      [],
    );

    return (
      <>
        <BottomSheetModal
          ref={sheetRef}
          snapPoints={snapPoints}
          enablePanDownToClose
          backdropComponent={renderBackdrop}
          backgroundStyle={{ backgroundColor: LIGHT.bg }}
          handleIndicatorStyle={{ backgroundColor: LIGHT.border }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <View
              style={{
                paddingHorizontal: 20,
                paddingBottom: 8,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: '700', color: LIGHT.text }}>
                New account
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                onPress={() => sheetRef.current?.dismiss()}
              >
                <Text style={{ color: LIGHT.textDim, fontSize: 15 }}>Cancel</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
              <LabeledField label="Nickname">
                <Controller
                  control={control}
                  name="nickname"
                  render={({ field }) => (
                    <InputField
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      placeholder="Chase Checking"
                      autoCapitalize="words"
                    />
                  )}
                />
                {formState.errors.nickname && (
                  <Text style={{ color: LIGHT.negative, fontSize: 11, marginTop: 4 }}>
                    {formState.errors.nickname.message}
                  </Text>
                )}
              </LabeledField>

              <LabeledField label="Type">
                <Controller
                  control={control}
                  name="type"
                  render={({ field }) => (
                    <TypeSegmented
                      value={field.value}
                      onChange={(v) => field.onChange(v)}
                    />
                  )}
                />
              </LabeledField>

              <LabeledField label="Currency">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Currency ${currencyCode}. Tap to change.`}
                  onPress={() => setCurrencyOpen(true)}
                  style={{
                    borderWidth: 1,
                    borderColor: LIGHT.border,
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    backgroundColor: LIGHT.surface,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text style={{ fontSize: 15, color: LIGHT.text, fontFamily: 'Geist Mono' }}>
                    {currencyCode}
                  </Text>
                  <ChevRIcon size={16} color={LIGHT.textFaint} />
                </Pressable>
              </LabeledField>

              <LabeledField label="Institution (optional)">
                <Controller
                  control={control}
                  name="institution"
                  render={({ field }) => (
                    <InputField
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      placeholder="Chase Bank"
                      autoCapitalize="words"
                    />
                  )}
                />
              </LabeledField>

              <LabeledField label="Last 4 (optional)">
                <Controller
                  control={control}
                  name="last4"
                  render={({ field }) => (
                    <InputField
                      value={field.value ?? ''}
                      onChange={(t) => field.onChange(t.replace(/[^0-9]/g, '').slice(0, 4))}
                      placeholder="4242"
                      keyboardType="number-pad"
                      maxLength={4}
                    />
                  )}
                />
              </LabeledField>

              <LabeledField label="Opening balance" helper="Use a negative sign for credit-card balances.">
                <Controller
                  control={control}
                  name="openingBalanceMinor"
                  render={({ field }) => (
                    <MinorAmountInput
                      value={field.value ?? '0'}
                      onChange={field.onChange}
                      currencyCode={currencyCode ?? 'USD'}
                    />
                  )}
                />
              </LabeledField>

              <LabeledField label="Color">
                <ColorChipRow
                  value={colorToken}
                  onChange={(t) => setValue('colorToken', t, { shouldDirty: true })}
                />
              </LabeledField>

              <LabeledField label="Icon">
                <IconChipRow
                  value={iconToken}
                  onChange={(t) => setValue('iconToken', t, { shouldDirty: true })}
                />
              </LabeledField>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create account"
                disabled={createAccount.isPending}
                onPress={onSubmit}
                style={({ pressed }) => ({
                  marginTop: 10,
                  backgroundColor: ACCENTS.indigo.hex,
                  paddingVertical: 14,
                  borderRadius: 14,
                  alignItems: 'center',
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                  {createAccount.isPending ? 'Creating…' : 'Create account'}
                </Text>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </BottomSheetModal>

        <CurrencyPicker
          visible={currencyOpen}
          value={currencyCode ?? 'USD'}
          onChange={(c) => setValue('currencyCode', c, { shouldDirty: true })}
          onClose={() => setCurrencyOpen(false)}
        />
      </>
    );
  },
);

// Small helper: renders a major-unit decimal input and writes the signed minor
// amount as a string (matches `openingBalanceMinor`).
function MinorAmountInput({
  value,
  onChange,
  currencyCode,
}: {
  value: string;
  onChange: (v: string) => void;
  currencyCode: string;
}) {
  // Keep a separate display string so users can type "-", ".", and trailing zeros.
  const [display, setDisplay] = useState(() => minorToDisplay(value, currencyCode));

  const handle = (t: string) => {
    const cleaned = t.replace(/[^0-9.-]/g, '');
    setDisplay(cleaned);
    const minor = displayToMinor(cleaned, currencyCode);
    onChange(minor);
  };

  return (
    <InputField
      value={display}
      onChange={handle}
      placeholder="0.00"
      keyboardType="decimal-pad"
    />
  );
}

function minorDigits(code: string): number {
  // Lightweight mirror of the core helper; avoids importing in the form file.
  if (['JPY', 'KRW', 'VND', 'IDR', 'CLP'].includes(code)) return 0;
  return 2;
}

function minorToDisplay(minor: string, code: string): string {
  if (!minor) return '';
  const d = minorDigits(code);
  const n = Number(minor) / 10 ** d;
  if (!Number.isFinite(n)) return '';
  return d === 0 ? `${Math.trunc(n)}` : n.toFixed(d);
}

function displayToMinor(display: string, code: string): string {
  if (!display || display === '-' || display === '.') return '0';
  const n = Number(display);
  if (!Number.isFinite(n)) return '0';
  const d = minorDigits(code);
  return Math.round(n * 10 ** d).toString();
}
