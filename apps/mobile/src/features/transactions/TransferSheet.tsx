// Bottom sheet to create an atomic Transfer.
// - Source account (any non-archived)
// - Destination account (filtered to same currency, != source)
// - Amount (bound to source currency)
// - Note (optional)

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateTransferInput,
  type CreateTransferInputType,
  type Account,
} from '@nayanam/core';
import { ACCENTS, LIGHT } from '@nayanam/ui-tokens';
import { useCreateTransfer } from '../../lib/hooks';
import { hapticError, hapticSuccess } from '../../lib/haptics';
import { logWarn } from '../../lib/log';
import { MinorAmountInput } from './MinorAmountInput';
import {
  AccountPickerSheet,
  type AccountPickerSheetHandle,
} from './AccountPickerSheet';

export type TransferSheetHandle = {
  present: (preset?: { sourceAccountId?: string }) => void;
  dismiss: () => void;
};

export const TransferSheet = forwardRef<TransferSheetHandle>(function TransferSheet(_p, ref) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const sourceSheetRef = useRef<AccountPickerSheetHandle>(null);
  const destSheetRef = useRef<AccountPickerSheetHandle>(null);
  const snapPoints = useMemo(() => ['92%'], []);
  const createMut = useCreateTransfer();

  const [source, setSource] = useState<Account | null>(null);
  const [dest, setDest] = useState<Account | null>(null);

  const { control, handleSubmit, reset, setValue, watch } =
    useForm<CreateTransferInputType>({
      resolver: zodResolver(CreateTransferInput),
      defaultValues: {
        sourceAccountId: '',
        destinationAccountId: '',
        amountMinor: '0',
        currencyCode: 'USD',
        occurredAt: new Date().toISOString(),
        note: '',
      },
    });
  const currencyCode = watch('currencyCode');

  useImperativeHandle(ref, () => ({
    present: () => {
      reset({
        sourceAccountId: '',
        destinationAccountId: '',
        amountMinor: '0',
        currencyCode: 'USD',
        occurredAt: new Date().toISOString(),
        note: '',
      });
      setSource(null);
      setDest(null);
      sheetRef.current?.present();
    },
    dismiss: () => sheetRef.current?.dismiss(),
  }));

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

  const pickSource = (a: Account) => {
    setSource(a);
    setValue('sourceAccountId', a.id, { shouldDirty: true });
    setValue('currencyCode', a.currencyCode, { shouldDirty: true });
    // Drop destination if currency changes.
    if (dest && dest.currencyCode !== a.currencyCode) {
      setDest(null);
      setValue('destinationAccountId', '', { shouldDirty: true });
    }
  };

  const pickDest = (a: Account) => {
    setDest(a);
    setValue('destinationAccountId', a.id, { shouldDirty: true });
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (!source || !dest) {
        hapticError();
        return;
      }
      await createMut.mutateAsync({
        ...values,
        note: values.note?.trim() ? values.note.trim() : null,
      });
      hapticSuccess();
      reset();
      setSource(null);
      setDest(null);
      sheetRef.current?.dismiss();
    } catch (err) {
      hapticError();
      logWarn('Create transfer failed', err);
    }
  });

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
              New transfer
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
            <Field label="From">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={source ? `Source ${source.nickname}` : 'Pick source account'}
                onPress={() => sourceSheetRef.current?.present()}
                style={pickerStyle}
              >
                <Text style={{ color: source ? LIGHT.text : LIGHT.textDim, fontSize: 15 }}>
                  {source?.nickname ?? 'Pick source'}
                </Text>
                {source ? (
                  <Text
                    style={{
                      fontSize: 11,
                      color: LIGHT.textFaint,
                      fontFamily: 'Geist Mono',
                    }}
                  >
                    {source.currencyCode}
                  </Text>
                ) : null}
              </Pressable>
            </Field>

            <Field label="To">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={dest ? `Destination ${dest.nickname}` : 'Pick destination account'}
                onPress={() => destSheetRef.current?.present()}
                disabled={!source}
                style={[pickerStyle, !source ? { opacity: 0.5 } : null]}
              >
                <Text style={{ color: dest ? LIGHT.text : LIGHT.textDim, fontSize: 15 }}>
                  {dest?.nickname ?? (source ? 'Pick destination' : 'Pick source first')}
                </Text>
              </Pressable>
              {source ? (
                <Text style={{ fontSize: 11, color: LIGHT.textFaint, marginTop: 4 }}>
                  Same currency accounts only ({source.currencyCode}).
                </Text>
              ) : null}
            </Field>

            <Field label="Amount">
              <Controller
                control={control}
                name="amountMinor"
                render={({ field }) => (
                  <MinorAmountInput
                    value={field.value}
                    onChange={field.onChange}
                    currencyCode={currencyCode}
                  />
                )}
              />
            </Field>

            <Field label="Note (optional)">
              <Controller
                control={control}
                name="note"
                render={({ field }) => (
                  <TextInput
                    value={field.value ?? ''}
                    onChangeText={field.onChange}
                    placeholder="Rent transfer"
                    placeholderTextColor={LIGHT.textFaint}
                    multiline
                    style={{
                      borderWidth: 1,
                      borderColor: LIGHT.border,
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      backgroundColor: LIGHT.surface,
                      color: LIGHT.text,
                      minHeight: 44,
                      textAlignVertical: 'top',
                    }}
                  />
                )}
              />
            </Field>

            <Pressable
              testID="transfer-submit"
              accessibilityRole="button"
              accessibilityLabel="Create transfer"
              disabled={createMut.isPending || !source || !dest}
              onPress={onSubmit}
              style={({ pressed }) => ({
                marginTop: 12,
                backgroundColor:
                  !source || !dest ? LIGHT.borderStrong : ACCENTS.indigo.hex,
                paddingVertical: 14,
                borderRadius: 14,
                alignItems: 'center',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                {createMut.isPending ? 'Saving…' : 'Transfer'}
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </BottomSheetModal>

      <AccountPickerSheet
        ref={sourceSheetRef}
        selectedId={source?.id}
        onSelect={pickSource}
      />
      <AccountPickerSheet
        ref={destSheetRef}
        selectedId={dest?.id}
        excludeId={source?.id ?? null}
        currencyFilter={source?.currencyCode ?? null}
        onSelect={pickDest}
      />
    </>
  );
});

const pickerStyle = {
  borderWidth: 1,
  borderColor: LIGHT.border,
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 12,
  backgroundColor: LIGHT.surface,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
} as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text
        style={{
          fontSize: 11,
          color: LIGHT.textDim,
          fontFamily: 'Geist Mono',
          letterSpacing: 0.4,
          marginBottom: 6,
        }}
      >
        {label.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}
