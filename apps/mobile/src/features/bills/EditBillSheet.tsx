// Bottom sheet to edit an existing bill. Keyed by billId so a remount
// snaps defaultValues to the current bill when the parent swaps targets.

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
import type { Account, Bill, Category } from '@nayanam/core';
import { ACCENTS, LIGHT } from '@nayanam/ui-tokens';
import { useUpdateBill } from '../../lib/hooks';
import { hapticError, hapticSuccess } from '../../lib/haptics';
import { logWarn } from '../../lib/log';
import { BillFormFields, type BillFormValues } from './BillFormFields';

export type EditBillSheetHandle = {
  present: (args: {
    bill: Bill;
    account: Account | null;
    category: Category | null;
  }) => void;
  dismiss: () => void;
};

export const EditBillSheet = forwardRef<EditBillSheetHandle>(
  function EditBillSheet(_props, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const snapPoints = useMemo(() => ['95%'], []);

    // Shared hook handles idempotency + invalidation. We keep the target
    // billId in a ref because the sheet is mounted once and re-used for
    // every bill the caller presents.
    const billIdRef = useRef<string>('');
    const updateMut = useUpdateBill();

    const form = useForm<BillFormValues>({
      defaultValues: {
        name: '',
        accountId: '',
        categoryId: '',
        amountMinor: '0',
        currencyCode: 'USD',
        cycle: 'MONTHLY',
        customDays: '',
        startAt: '',
        endAt: '',
        autoLog: false,
        note: '',
      },
    });

    const contextRef = useRef<{ account: Account | null; category: Category | null }>(
      { account: null, category: null },
    );

    useImperativeHandle(ref, () => ({
      present: ({ bill, account, category }) => {
        billIdRef.current = bill.id;
        contextRef.current = { account, category };
        form.reset({
          name: bill.name,
          accountId: bill.accountId,
          categoryId: bill.categoryId,
          amountMinor: bill.amountMinor,
          currencyCode: bill.currencyCode,
          cycle: bill.cycle,
          customDays: bill.customDays?.toString() ?? '',
          startAt: bill.startAt ?? '',
          endAt: bill.endAt ?? '',
          autoLog: bill.autoLog,
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
      try {
        if (!billIdRef.current) return;
        const amount = BigInt(v.amountMinor || '0');
        if (!v.accountId || !v.categoryId || amount <= 0n || !v.name.trim()) {
          hapticError();
          return;
        }
        const customDays =
          v.cycle === 'CUSTOM_DAYS' ? Number(v.customDays) : null;
        if (v.cycle === 'CUSTOM_DAYS') {
          if (
            !Number.isInteger(customDays) ||
            (customDays ?? 0) < 1 ||
            (customDays ?? 0) > 366
          ) {
            hapticError();
            return;
          }
        }
        await updateMut.mutateAsync({
          billId: billIdRef.current,
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
        logWarn('Update bill failed', err);
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
              Edit bill
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
              initialAccount={contextRef.current.account}
              initialCategory={contextRef.current.category}
            />

            <Pressable
              testID="edit-bill-submit"
              accessibilityRole="button"
              accessibilityLabel="Save bill changes"
              disabled={updateMut.isPending}
              onPress={onSubmit}
              style={({ pressed }) => ({
                marginTop: 18,
                backgroundColor: ACCENTS.indigo.hex,
                paddingVertical: 14,
                borderRadius: 14,
                alignItems: 'center',
                opacity: pressed || updateMut.isPending ? 0.85 : 1,
              })}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                {updateMut.isPending ? 'Saving…' : 'Save changes'}
              </Text>
            </Pressable>
          </BottomSheetScrollView>
        </KeyboardAvoidingView>
      </BottomSheetModal>
    );
  },
);
