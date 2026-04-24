// Bottom sheet to mark a bill as paid. Prefilled with the bill's current
// amount and now() for occurredAt. On submit the server creates a backing
// Transaction + BillPayment and advances nextDueAt.

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
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { Controller, useForm } from 'react-hook-form';
import type { Account, Bill, Category } from '@nayanam/core';
import { formatMoney } from '@nayanam/core';
import { ACCENTS, LIGHT } from '@nayanam/ui-tokens';
import { useMarkBillPaid } from '../../lib/hooks';
import { hapticError, hapticSuccess } from '../../lib/haptics';
import { DateTimeField } from '../../components/DateTimeField';
import { MinorAmountInput } from '../transactions/MinorAmountInput';
import { Field, nowIso } from './BillFormFields';

export type MarkPaidSheetHandle = {
  present: (args: {
    bill: Bill;
    account: Account | null;
    category: Category | null;
  }) => void;
  dismiss: () => void;
};

type FormValues = {
  amountMinor: string;
  occurredAt: string; // ISO-8601
  note: string;
};

export const MarkPaidSheet = forwardRef<MarkPaidSheetHandle>(
  function MarkPaidSheet(_props, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const snapPoints = useMemo(() => ['55%'], []);
    const markPaidMut = useMarkBillPaid();

    const [target, setTarget] = useState<{
      bill: Bill;
      account: Account | null;
      category: Category | null;
    } | null>(null);

    const form = useForm<FormValues>({
      defaultValues: {
        amountMinor: '0',
        occurredAt: nowIso(),
        note: '',
      },
    });

    useImperativeHandle(ref, () => ({
      present: ({ bill, account, category }) => {
        setTarget({ bill, account, category });
        form.reset({
          amountMinor: bill.amountMinor,
          occurredAt: bill.nextDueAt ?? nowIso(),
          note: bill.note ?? '',
        });
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

    const onSubmit = form.handleSubmit(async (v) => {
      if (!target) return;
      try {
        const amt = BigInt(v.amountMinor || '0');
        if (amt <= 0n) {
          hapticError();
          return;
        }
        await markPaidMut.mutateAsync({
          billId: target.bill.id,
          amountMinor: v.amountMinor,
          occurredAt: v.occurredAt || undefined,
          note: v.note.trim() ? v.note.trim() : null,
        });
        hapticSuccess();
        sheetRef.current?.dismiss();
      } catch (err) {
        hapticError();
        console.warn('Mark paid failed', err);
      }
    });

    const currencyCode = target?.bill.currencyCode ?? 'USD';
    const pending = markPaidMut.isPending;

    return (
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
            <Text
              style={{ fontSize: 20, fontWeight: '700', color: LIGHT.text }}
              numberOfLines={1}
            >
              Mark {target?.bill.name ?? 'bill'} paid
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={() => sheetRef.current?.dismiss()}
            >
              <Text style={{ color: LIGHT.textDim, fontSize: 15 }}>Cancel</Text>
            </Pressable>
          </View>

          <BottomSheetScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          >
            <Field label="Amount">
              <Controller
                control={form.control}
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

            <Field label="Date & time">
              <Controller
                control={form.control}
                name="occurredAt"
                render={({ field }) => (
                  <DateTimeField
                    mode="datetime"
                    accessibilityLabel="Paid at date and time"
                    value={field.value || null}
                    onChange={(iso) => field.onChange(iso ?? '')}
                    placeholder="Pick a date"
                  />
                )}
              />
            </Field>

            <Field label="Note (optional)">
              <Controller
                control={form.control}
                name="note"
                render={({ field }) => (
                  <TextInput
                    accessibilityLabel="Note"
                    value={field.value}
                    onChangeText={field.onChange}
                    placeholder=""
                    placeholderTextColor={LIGHT.textFaint}
                    multiline
                    maxLength={500}
                    style={{
                      borderWidth: 1,
                      borderColor: LIGHT.border,
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      backgroundColor: LIGHT.surface,
                      color: LIGHT.text,
                      minHeight: 56,
                      textAlignVertical: 'top',
                    }}
                  />
                )}
              />
            </Field>

            {target ? (
              <View
                style={{
                  marginTop: 14,
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: LIGHT.surfaceAlt,
                }}
              >
                <Text style={{ fontSize: 12, color: LIGHT.textDim }}>
                  Creates a transaction of{' '}
                  <Text style={{ color: LIGHT.text, fontWeight: '700' }}>
                    {formatMoney(
                      target.bill.amountMinor,
                      target.bill.currencyCode,
                    )}
                  </Text>{' '}
                  on{' '}
                  <Text style={{ color: LIGHT.text, fontWeight: '700' }}>
                    {target.account?.nickname ?? 'this account'}
                  </Text>{' '}
                  under{' '}
                  <Text style={{ color: LIGHT.text, fontWeight: '700' }}>
                    {target.category?.label ?? 'this category'}
                  </Text>
                  .
                </Text>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mark paid"
              disabled={pending}
              onPress={onSubmit}
              style={({ pressed }) => ({
                marginTop: 18,
                backgroundColor: ACCENTS.indigo.hex,
                paddingVertical: 14,
                borderRadius: 14,
                alignItems: 'center',
                opacity: pressed || pending ? 0.85 : 1,
              })}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                {pending ? 'Saving…' : 'Mark paid'}
              </Text>
            </Pressable>
          </BottomSheetScrollView>
        </KeyboardAvoidingView>
      </BottomSheetModal>
    );
  },
);
