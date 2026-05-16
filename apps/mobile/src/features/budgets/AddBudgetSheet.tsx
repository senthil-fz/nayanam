// Bottom sheet to create a Budget. Prefill via `present({...})` so the
// suggestions row can jump straight into "Groceries · $440/mo" with one tap.

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
import type {
  BudgetPeriod,
  BudgetScope,
  Category,
  CreateBudgetInputType,
} from '@nayanam/core';
import { ACCENTS, LIGHT } from '@nayanam/ui-tokens';
import { useCreateBudget } from '../../lib/hooks';
import { hapticError, hapticSuccess } from '../../lib/haptics';
import { logWarn } from '../../lib/log';
import {
  BudgetFormFields,
  type BudgetFormValues,
} from './BudgetFormFields';

export type AddBudgetSheetPresentArgs = {
  scope?: BudgetScope;
  category?: Category | null;
  name?: string;
  amountMinor?: string;
  currencyCode?: string;
  period?: BudgetPeriod;
};

export type AddBudgetSheetHandle = {
  present: (args?: AddBudgetSheetPresentArgs) => void;
  dismiss: () => void;
};

type Props = {
  defaultCurrencyCode?: string;
  /** Category ids to omit from the inner picker (covered-by-budget). */
  excludeCategoryIds?: readonly string[];
};

export const AddBudgetSheet = forwardRef<AddBudgetSheetHandle, Props>(
  function AddBudgetSheet(
    { defaultCurrencyCode = 'USD', excludeCategoryIds },
    ref,
  ) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const snapPoints = useMemo(() => ['92%'], []);
    const createMut = useCreateBudget();
    const initialCategoryRef = useRef<Category | null>(null);

    const form = useForm<BudgetFormValues>({
      defaultValues: {
        scope: 'HOUSEHOLD',
        categoryId: null,
        name: '',
        amountMinor: '0',
        currencyCode: defaultCurrencyCode,
        period: 'MONTHLY',
        rollover: false,
        startAt: '',
        endAt: '',
      },
    });

    useImperativeHandle(ref, () => ({
      present: (args) => {
        const scope = args?.scope ?? (args?.category ? 'CATEGORY' : 'HOUSEHOLD');
        initialCategoryRef.current = args?.category ?? null;
        form.reset({
          scope,
          categoryId: args?.category?.id ?? null,
          name: args?.name ?? args?.category?.label ?? '',
          amountMinor: args?.amountMinor ?? '0',
          currencyCode: args?.currencyCode ?? defaultCurrencyCode,
          period: args?.period ?? 'MONTHLY',
          rollover: false,
          startAt: '',
          endAt: '',
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
        const trimmedName = v.name.trim();
        const amount = BigInt(v.amountMinor || '0');
        if (!trimmedName || amount <= 0n) {
          hapticError();
          return;
        }
        if (v.scope === 'CATEGORY' && !v.categoryId) {
          hapticError();
          return;
        }
        const body: CreateBudgetInputType = {
          name: trimmedName,
          scope: v.scope,
          categoryId: v.scope === 'CATEGORY' ? v.categoryId : null,
          amountMinor: v.amountMinor,
          currencyCode: v.currencyCode,
          period: v.period,
          rollover: v.rollover,
          startAt: v.startAt || undefined,
          endAt: v.endAt || null,
        };
        await createMut.mutateAsync(body);
        hapticSuccess();
        sheetRef.current?.dismiss();
      } catch (err) {
        hapticError();
        logWarn('Create budget failed', err);
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
              New budget
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
              initialCategory={initialCategoryRef.current}
              excludeCategoryIds={excludeCategoryIds}
            />

            <Pressable
              testID="add-budget-submit"
              accessibilityRole="button"
              accessibilityLabel="Save budget"
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
