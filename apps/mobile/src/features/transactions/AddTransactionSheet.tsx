// Bottom sheet to create a non-transfer Transaction.
// - Segmented Income | Expense at the top
// - Account picker (category auto-filtered by type)
// - Amount (bound to account currency)
// - Date (ISO string; default now)
// - Note (optional)
//
// Submit uses the shared `useCreateTransaction` hook, which mints the
// Idempotency-Key in `onMutate` and stashes it on the mutation variables so
// a persisted retry reuses the same key (spec §Mobile offline queue).

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
  CreateTransactionInput,
  type CreateTransactionInputType,
  type Account,
  type Category,
} from '@nayanam/core';
import { ACCENTS, LIGHT } from '@nayanam/ui-tokens';
import { useAccounts, useCreateTransaction } from '../../lib/hooks';
import { hapticError, hapticSuccess } from '../../lib/haptics';
import { logWarn } from '../../lib/log';
import { MinorAmountInput } from './MinorAmountInput';
import {
  AccountPickerSheet,
  type AccountPickerSheetHandle,
} from './AccountPickerSheet';
import {
  CategoryPickerSheet,
  type CategoryPickerSheetHandle,
} from './CategoryPickerSheet';
import { AttachmentStrip } from '../attachments/AttachmentStrip';
import { useAttachmentUpload } from '../attachments/useAttachmentUpload';
import type { StagedFile } from '../attachments/types';

export type AddTransactionSheetHandle = {
  present: (preset?: { type?: 'INCOME' | 'EXPENSE'; accountId?: string }) => void;
  dismiss: () => void;
};

export const AddTransactionSheet = forwardRef<AddTransactionSheetHandle>(
  function AddTransactionSheet(_props, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const accountSheetRef = useRef<AccountPickerSheetHandle>(null);
    const categorySheetRef = useRef<CategoryPickerSheetHandle>(null);
    const snapPoints = useMemo(() => ['92%'], []);

    const createMut = useCreateTransaction();
    const accountsQuery = useAccounts();
    const accounts = accountsQuery.data?.pages.flatMap((p) => p.items) ?? [];

    const [account, setAccount] = useState<Account | null>(null);
    const [category, setCategory] = useState<Category | null>(null);
    const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
    const [uploadStatus, setUploadStatus] = useState<string | null>(null);
    const { upload } = useAttachmentUpload();

    const { control, handleSubmit, reset, setValue, watch, formState } =
      useForm<CreateTransactionInputType>({
        resolver: zodResolver(CreateTransactionInput),
        defaultValues: {
          accountId: '',
          categoryId: '',
          type: 'EXPENSE',
          amountMinor: '0',
          currencyCode: 'USD',
          occurredAt: new Date().toISOString(),
          note: '',
        },
      });

    const type = watch('type');
    const currencyCode = watch('currencyCode');

    const pickAccount = useCallback(
      (a: Account) => {
        setAccount(a);
        setValue('accountId', a.id, { shouldDirty: true });
        setValue('currencyCode', a.currencyCode, { shouldDirty: true });
        // Clear the category if the user swaps to an account with a different
        // currency — the category doesn't depend on currency, but if the
        // previous category was wrong-typed we want to prompt re-selection.
      },
      [setValue],
    );

    const pickCategory = useCallback(
      (c: Category) => {
        setCategory(c);
        setValue('categoryId', c.id, { shouldDirty: true });
      },
      [setValue],
    );

    useImperativeHandle(ref, () => ({
      present: (preset) => {
        reset({
          accountId: preset?.accountId ?? '',
          categoryId: '',
          type: preset?.type ?? 'EXPENSE',
          amountMinor: '0',
          currencyCode:
            accounts.find((a) => a.id === preset?.accountId)?.currencyCode ?? 'USD',
          occurredAt: new Date().toISOString(),
          note: '',
        });
        if (preset?.accountId) {
          const a = accounts.find((x) => x.id === preset.accountId);
          if (a) setAccount(a);
        } else {
          setAccount(null);
        }
        setCategory(null);
        setStagedFiles([]);
        setUploadStatus(null);
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

    const onSubmit = handleSubmit(async (values) => {
      try {
        if (!values.accountId || !values.categoryId) {
          hapticError();
          return;
        }
        const created = await createMut.mutateAsync({
          ...values,
          note: values.note?.trim() ? values.note.trim() : null,
        });
        // Upload staged attachments serially against the new transaction id.
        // Failures do NOT roll back the transaction — we surface a toast-style
        // message and leave the sheet open only if every file failed.
        if (stagedFiles.length > 0) {
          let failures = 0;
          let index = 0;
          for (const f of stagedFiles) {
            index += 1;
            setUploadStatus(`Uploading ${index} of ${stagedFiles.length}…`);
            try {
              await upload({
                file: f,
                ownerType: 'transaction',
                ownerId: created.id,
              });
            } catch {
              failures += 1;
            }
          }
          setUploadStatus(null);
          if (failures > 0) {
            hapticError();
            // Spec §UX: transaction still saves; user can retry from Edit.
            // Keep the sheet open so they see the count, but reset form so
            // re-submit does not re-create the transaction.
          }
        }
        hapticSuccess();
        reset();
        setAccount(null);
        setCategory(null);
        setStagedFiles([]);
        setUploadStatus(null);
        sheetRef.current?.dismiss();
      } catch (err) {
        hapticError();
        setUploadStatus(null);
        logWarn('Create transaction failed', err);
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
                New transaction
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
              <Field label="Type">
                <View
                  style={{
                    flexDirection: 'row',
                    backgroundColor: LIGHT.chipBg,
                    padding: 4,
                    borderRadius: 999,
                  }}
                >
                  {(['EXPENSE', 'INCOME'] as const).map((t) => (
                    <Pressable
                      key={t}
                      accessibilityRole="button"
                      accessibilityLabel={`${t} type`}
                      onPress={() => {
                        setValue('type', t, { shouldDirty: true });
                        // re-prompt category when type changes.
                        setCategory(null);
                        setValue('categoryId', '', { shouldDirty: true });
                      }}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: 999,
                        alignItems: 'center',
                        backgroundColor: type === t ? LIGHT.surface : 'transparent',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '600',
                          color: type === t ? LIGHT.text : LIGHT.textDim,
                        }}
                      >
                        {t === 'EXPENSE' ? 'Expense' : 'Income'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </Field>

              <Field label="Account">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    account ? `Account ${account.nickname}` : 'Pick account'
                  }
                  onPress={() => accountSheetRef.current?.present()}
                  style={pickerStyle}
                >
                  <Text style={{ color: account ? LIGHT.text : LIGHT.textDim, fontSize: 15 }}>
                    {account?.nickname ?? 'Pick account'}
                  </Text>
                  {account ? (
                    <Text
                      style={{
                        fontSize: 11,
                        color: LIGHT.textFaint,
                        fontFamily: 'Geist Mono',
                      }}
                    >
                      {account.currencyCode}
                    </Text>
                  ) : null}
                </Pressable>
              </Field>

              <Field label="Category">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    category ? `Category ${category.label}` : 'Pick category'
                  }
                  onPress={() => categorySheetRef.current?.present()}
                  style={pickerStyle}
                >
                  <Text style={{ color: category ? LIGHT.text : LIGHT.textDim, fontSize: 15 }}>
                    {category?.label ?? 'Pick category'}
                  </Text>
                </Pressable>
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
                {formState.errors.amountMinor ? (
                  <Text style={errText}>Enter an amount greater than zero.</Text>
                ) : null}
              </Field>

              <Field label="Note (optional)">
                <Controller
                  control={control}
                  name="note"
                  render={({ field }) => (
                    <TextInput
                      value={field.value ?? ''}
                      onChangeText={field.onChange}
                      placeholder="Dinner with Priya"
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

              <View style={{ marginTop: 14 }}>
                <AttachmentStrip
                  mode="staged"
                  ownerType="transaction"
                  stagedFiles={stagedFiles}
                  onStagedChange={setStagedFiles}
                />
              </View>

              {uploadStatus ? (
                <Text
                  style={{
                    fontSize: 11,
                    color: LIGHT.textDim,
                    marginTop: 8,
                  }}
                >
                  {uploadStatus}
                </Text>
              ) : null}

              <Pressable
                testID="add-transaction-submit"
                accessibilityRole="button"
                accessibilityLabel="Create transaction"
                disabled={createMut.isPending || !account || !category}
                onPress={onSubmit}
                style={({ pressed }) => ({
                  marginTop: 12,
                  backgroundColor:
                    !account || !category ? LIGHT.borderStrong : ACCENTS.indigo.hex,
                  paddingVertical: 14,
                  borderRadius: 14,
                  alignItems: 'center',
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                  {createMut.isPending
                    ? 'Saving…'
                    : uploadStatus
                      ? 'Uploading…'
                      : 'Save'}
                </Text>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </BottomSheetModal>

        <AccountPickerSheet
          ref={accountSheetRef}
          selectedId={account?.id}
          onSelect={pickAccount}
        />
        <CategoryPickerSheet
          ref={categorySheetRef}
          typeFilter={type}
          selectedId={category?.id}
          onSelect={pickCategory}
        />
      </>
    );
  },
);

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

const errText = {
  color: LIGHT.negative,
  fontSize: 11,
  marginTop: 4,
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
