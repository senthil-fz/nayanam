// Confirm-style bottom sheet for undoing the last bill payment. Soft-
// deletes the payment + its transaction and rolls nextDueAt back one
// cycle. Gated to ADMIN+ by the caller (parent hides the entry point).

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
} from '@gorhom/bottom-sheet';
import type { Bill, BillPayment } from '@nayanam/core';
import { formatMoney } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { useUndoBillPayment } from '../../lib/hooks';
import { hapticError, hapticSuccess } from '../../lib/haptics';

export type UndoPaymentSheetHandle = {
  present: (args: { bill: Bill; payment: BillPayment }) => void;
  dismiss: () => void;
};

export const UndoPaymentSheet = forwardRef<UndoPaymentSheetHandle>(
  function UndoPaymentSheet(_props, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const snapPoints = useMemo(() => ['35%'], []);
    const undoMut = useUndoBillPayment();
    const [target, setTarget] = useState<{ bill: Bill; payment: BillPayment } | null>(
      null,
    );

    useImperativeHandle(ref, () => ({
      present: (args) => {
        setTarget(args);
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

    const confirm = async () => {
      if (!target) return;
      try {
        await undoMut.mutateAsync({
          billId: target.bill.id,
          paymentId: target.payment.id,
        });
        hapticSuccess();
        sheetRef.current?.dismiss();
      } catch (err) {
        hapticError();
        console.warn('Undo payment failed', err);
      }
    };

    const pending = undoMut.isPending;

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: LIGHT.bg }}
        handleIndicatorStyle={{ backgroundColor: LIGHT.border }}
      >
        <View style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
          <Text
            style={{
              fontSize: 20,
              fontWeight: '700',
              color: LIGHT.text,
              marginBottom: 12,
            }}
          >
            Undo last payment
          </Text>
          {target ? (
            <Text style={{ fontSize: 13, color: LIGHT.textDim, lineHeight: 18 }}>
              This reverses the{' '}
              <Text style={{ color: LIGHT.text, fontWeight: '700' }}>
                {formatMoney(
                  target.payment.amountMinor,
                  target.bill.currencyCode,
                )}
              </Text>{' '}
              payment recorded on{' '}
              {new Date(target.payment.paidAt).toLocaleDateString()} and rolls
              the next-due date back one cycle. The backing transaction is
              soft-deleted and the account balance is restored.
            </Text>
          ) : null}
          <View
            style={{
              flexDirection: 'row',
              gap: 10,
              marginTop: 20,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={() => sheetRef.current?.dismiss()}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: LIGHT.border,
                alignItems: 'center',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ fontWeight: '600', color: LIGHT.text }}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Undo payment"
              disabled={pending}
              onPress={() => void confirm()}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: LIGHT.negative,
                alignItems: 'center',
                opacity: pressed || pending ? 0.85 : 1,
              })}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {pending ? 'Undoing…' : 'Undo payment'}
              </Text>
            </Pressable>
          </View>
        </View>
      </BottomSheetModal>
    );
  },
);
