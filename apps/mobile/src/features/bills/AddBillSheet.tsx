// Bottom sheet to create a Bill.

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { useForm } from 'react-hook-form';
import type { Account, Category } from '@nayanam/core';
import { ACCENTS, LIGHT } from '@nayanam/ui-tokens';
import { useCreateBill } from '../../lib/hooks';
import { hapticError, hapticSuccess } from '../../lib/haptics';
import {
  BillFormFields,
  type BillFormValues,
  nowIso,
} from './BillFormFields';

export type AddBillSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

type Props = {
  defaultCurrencyCode?: string;
  defaultAccount?: Account | null;
  defaultCategory?: Category | null;
};

export const AddBillSheet = forwardRef<AddBillSheetHandle, Props>(
  function AddBillSheet(
    { defaultCurrencyCode = 'USD', defaultAccount, defaultCategory },
    ref,
  ) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const snapPoints = useMemo(() => ['95%'], []);
    const createMut = useCreateBill();

    const form = useForm<BillFormValues>({
      defaultValues: {
        name: '',
        accountId: defaultAccount?.id ?? '',
        categoryId: defaultCategory?.id ?? '',
        amountMinor: '0',
        currencyCode: defaultAccount?.currencyCode ?? defaultCurrencyCode,
        cycle: 'MONTHLY',
        customDays: '',
        startAt: nowIso(),
        endAt: '',
        autoLog: false,
        note: '',
      },
    });

    useImperativeHandle(ref, () => ({
      present: () => {
        form.reset({
          name: '',
          accountId: defaultAccount?.id ?? '',
          categoryId: defaultCategory?.id ?? '',
          amountMinor: '0',
          currencyCode: defaultAccount?.currencyCode ?? defaultCurrencyCode,
          cycle: 'MONTHLY',
          customDays: '',
          startAt: nowIso(),
          endAt: '',
          autoLog: false,
          note: '',
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
      try {
        const amount = BigInt(v.amountMinor || '0');
        if (!v.accountId || !v.categoryId || amount <= 0n || !v.name.trim()) {
          hapticError();
          return;
        }
        const customDays =
          v.cycle === 'CUSTOM_DAYS' ? Number(v.customDays) : null;
        if (v.cycle === 'CUSTOM_DAYS') {
          if (!Number.isInteger(customDays) || (customDays ?? 0) < 1 || (customDays ?? 0) > 366) {
            hapticError();
            return;
          }
        }
        await createMut.mutateAsync({
          name: v.name.trim(),
          amountMinor: v.amountMinor,
          accountId: v.accountId,
          categoryId: v.categoryId,
          cycle: v.cycle,
          customDays,
          startAt: v.startAt || undefined,
          endAt: v.endAt || null,
          autoLog: v.autoLog,
          note: v.note.trim() ? v.note.trim() : null,
        });
        hapticSuccess();
        sheetRef.current?.dismiss();
      } catch (err) {
        hapticError();
        console.warn('Create bill failed', err);
      }
    });

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
            <Text style={{ fontSize: 20, fontWeight: '700', color: LIGHT.text }}>
              New bill
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
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          >
            <BillFormFields
              form={form}
              initialAccount={defaultAccount ?? null}
              initialCategory={defaultCategory ?? null}
              isCreate
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save bill"
              disabled={createMut.isPending}
              onPress={onSubmit}
              style={({ pressed }) => ({
                marginTop: 18,
                backgroundColor: ACCENTS.indigo.hex,
                paddingVertical: 14,
                borderRadius: 14,
                alignItems: 'center',
                opacity: pressed || createMut.isPending ? 0.85 : 1,
              })}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                {createMut.isPending ? 'Saving…' : 'Save'}
              </Text>
            </Pressable>
          </BottomSheetScrollView>
        </KeyboardAvoidingView>
      </BottomSheetModal>
    );
  },
);
