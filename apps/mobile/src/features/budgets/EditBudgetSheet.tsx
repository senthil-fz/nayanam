// Bottom sheet to edit a Budget. Only mutable fields are actually sent —
// the form still displays scope / category / currency / period / start
// but the BudgetFormFields component locks those controls via
// `disableImmutable` and the submit handler filters to the allowed set.

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
  View,
} from 'react-native';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { useForm } from 'react-hook-form';
import type {
  Budget,
  Category,
  UpdateBudgetInputType,
} from '@nayanam/core';
import { ACCENTS, LIGHT } from '@nayanam/ui-tokens';
import { useUpdateBudget } from '../../lib/hooks';
import { hapticError, hapticSuccess } from '../../lib/haptics';
import { logWarn } from '../../lib/log';
import {
  BudgetFormFields,
  type BudgetFormValues,
} from './BudgetFormFields';

export type EditBudgetSheetPresentArgs = {
  budget: Budget;
  category: Category | null;
};

export type EditBudgetSheetHandle = {
  present: (args: EditBudgetSheetPresentArgs) => void;
  dismiss: () => void;
};

export const EditBudgetSheet = forwardRef<EditBudgetSheetHandle>(
  function EditBudgetSheet(_props, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const snapPoints = useMemo(() => ['92%'], []);
    const updateMut = useUpdateBudget();

    const budgetRef = useRef<Budget | null>(null);
    const [initialCategory, setInitialCategory] = useState<Category | null>(
      null,
    );

    const form = useForm<BudgetFormValues>({
      defaultValues: {
        scope: 'HOUSEHOLD',
        categoryId: null,
        name: '',
        amountMinor: '0',
        currencyCode: 'USD',
        period: 'MONTHLY',
        rollover: false,
        startAt: '',
        endAt: '',
      },
    });

    useImperativeHandle(ref, () => ({
      present: ({ budget, category }) => {
        budgetRef.current = budget;
        setInitialCategory(category);
        form.reset({
          scope: budget.scope,
          categoryId: budget.categoryId,
          name: budget.name,
          amountMinor: budget.amountMinor,
          currencyCode: budget.currencyCode,
          period: budget.period,
          rollover: budget.rollover,
          startAt: budget.startAt,
          endAt: budget.endAt ?? '',
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
      const target = budgetRef.current;
      if (!target) return;
      try {
        const amount = BigInt(v.amountMinor || '0');
        if (amount <= 0n || !v.name.trim()) {
          hapticError();
          return;
        }
        const patch: UpdateBudgetInputType = {
          name: v.name.trim(),
          amountMinor: v.amountMinor,
          rollover: v.rollover,
          endAt: v.endAt || null,
        };
        await updateMut.mutateAsync({ budgetId: target.id, ...patch });
        hapticSuccess();
        sheetRef.current?.dismiss();
      } catch (err) {
        hapticError();
        logWarn('Update budget failed', err);
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
              Edit budget
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
            <BudgetFormFields
              form={form}
              initialCategory={initialCategory}
              disableImmutable
            />

            <Pressable
              testID="edit-budget-submit"
              accessibilityRole="button"
              accessibilityLabel="Save budget"
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
                {updateMut.isPending ? 'Saving…' : 'Save'}
              </Text>
            </Pressable>
          </BottomSheetScrollView>
        </KeyboardAvoidingView>
      </BottomSheetModal>
    );
  },
);
