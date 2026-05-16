// Bottom sheet to edit an existing Transaction.
// - type and currency are immutable (spec §Transaction update)
// - transfer-paired rows show a banner and lock all fields (spec §TRANSACTION_BELONGS_TO_TRANSFER)
// - a deleted row swaps the Save button for Restore (spec §Transaction restore)

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
  UpdateTransactionInput,
  type UpdateTransactionInputType,
  type Account,
  type Attachment,
  type Category,
  type Transaction,
} from '@nayanam/core';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { AttachmentStrip } from '../attachments/AttachmentStrip';
import { ACCENTS, LIGHT } from '@nayanam/ui-tokens';
import {
  useAccounts,
  useCategory,
  useRestoreTransaction,
  useUpdateTransaction,
} from '../../lib/hooks';
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

export type EditTransactionSheetHandle = {
  present: (transaction: Transaction) => void;
  dismiss: () => void;
};

export const EditTransactionSheet = forwardRef<EditTransactionSheetHandle>(
  function EditTransactionSheet(_props, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const accountSheetRef = useRef<AccountPickerSheetHandle>(null);
    const categorySheetRef = useRef<CategoryPickerSheetHandle>(null);
    const snapPoints = useMemo(() => ['92%'], []);
    const router = useRouter();

    const onPreviewAttachment = useCallback(
      (a: Attachment) => {
        if (a.mime === 'application/pdf') {
          if (a.downloadUrl) {
            void WebBrowser.openBrowserAsync(a.downloadUrl);
          }
          return;
        }
        if (!a.downloadUrl) return;
        router.push({
          pathname: '/attachments/preview',
          params: {
            url: a.downloadUrl,
            filename: a.originalFilename,
            mime: a.mime,
          },
        });
      },
      [router],
    );

    const [tx, setTx] = useState<Transaction | null>(null);
    const [account, setAccount] = useState<Account | null>(null);
    const [category, setCategory] = useState<Category | null>(null);
    const accountsQuery = useAccounts({ includeArchived: true });
    const accounts = accountsQuery.data?.pages.flatMap((p) => p.items) ?? [];

    // Resolve the current category for display when the sheet is opened.
    const categoryQuery = useCategory(tx?.categoryId ?? null);
    if (categoryQuery.data && (!category || category.id !== categoryQuery.data.id)) {
      setCategory(categoryQuery.data);
    }

    const updateMut = useUpdateTransaction(tx?.id ?? '');
    const restoreMut = useRestoreTransaction(tx?.id ?? '');

    const { control, handleSubmit, reset, setValue, watch } =
      useForm<UpdateTransactionInputType>({
        resolver: zodResolver(UpdateTransactionInput),
        defaultValues: {
          accountId: undefined,
          categoryId: undefined,
          amountMinor: undefined,
          occurredAt: undefined,
          note: undefined,
        },
      });

    const isTransfer = Boolean(tx?.transferId);
    const isDeleted = Boolean(tx?.deletedAt);
    const lockedMsg = isTransfer
      ? "This row belongs to a transfer. Transfers are immutable — delete the transfer and create a new one to change it."
      : null;

    useImperativeHandle(ref, () => ({
      present: (t) => {
        setTx(t);
        setAccount(accounts.find((a) => a.id === t.accountId) ?? null);
        setCategory(null); // will be re-resolved via useCategory
        reset({
          accountId: t.accountId,
          categoryId: t.categoryId,
          amountMinor: t.amountMinor,
          occurredAt: t.occurredAt,
          note: t.note ?? '',
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

    const pickAccount = useCallback(
      (a: Account) => {
        setAccount(a);
        setValue('accountId', a.id, { shouldDirty: true });
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

    const onSave = handleSubmit(async (values) => {
      if (!tx) return;
      try {
        const patch: UpdateTransactionInputType = {};
        if (values.accountId && values.accountId !== tx.accountId)
          patch.accountId = values.accountId;
        if (values.categoryId && values.categoryId !== tx.categoryId)
          patch.categoryId = values.categoryId;
        if (values.amountMinor && values.amountMinor !== tx.amountMinor)
          patch.amountMinor = values.amountMinor;
        if (values.occurredAt && values.occurredAt !== tx.occurredAt)
          patch.occurredAt = values.occurredAt;
        if ((values.note ?? '') !== (tx.note ?? '')) {
          const trimmed = (values.note ?? '').trim();
          patch.note = trimmed.length ? trimmed : null;
        }
        if (Object.keys(patch).length === 0) {
          sheetRef.current?.dismiss();
          return;
        }
        await updateMut.mutateAsync(patch);
        hapticSuccess();
        sheetRef.current?.dismiss();
      } catch (err) {
        hapticError();
        logWarn('Update transaction failed', err);
      }
    });

    const onRestore = async () => {
      if (!tx) return;
      try {
        await restoreMut.mutateAsync({});
        hapticSuccess();
        sheetRef.current?.dismiss();
      } catch (err) {
        hapticError();
        logWarn('Restore failed', err);
      }
    };

    const amountValue = watch('amountMinor');

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
                Edit transaction
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
              {lockedMsg ? (
                <View
                  style={{
                    marginBottom: 12,
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: LIGHT.chipBg,
                  }}
                >
                  <Text style={{ color: LIGHT.textDim, fontSize: 12 }}>{lockedMsg}</Text>
                </View>
              ) : null}

              <LockedField label="Type" value={tx?.type ?? ''} />
              <LockedField label="Currency" value={tx?.currencyCode ?? ''} />

              <Field label="Account">
                <Pressable
                  disabled={isTransfer}
                  accessibilityRole="button"
                  accessibilityLabel={account ? `Account ${account.nickname}` : 'Account'}
                  onPress={() => accountSheetRef.current?.present()}
                  style={[pickerStyle, isTransfer ? { opacity: 0.5 } : null]}
                >
                  <Text style={{ color: LIGHT.text, fontSize: 15 }}>
                    {account?.nickname ?? '—'}
                  </Text>
                </Pressable>
              </Field>

              <Field label="Category">
                <Pressable
                  disabled={isTransfer}
                  accessibilityRole="button"
                  accessibilityLabel={category ? `Category ${category.label}` : 'Category'}
                  onPress={() => categorySheetRef.current?.present()}
                  style={[pickerStyle, isTransfer ? { opacity: 0.5 } : null]}
                >
                  <Text style={{ color: LIGHT.text, fontSize: 15 }}>
                    {category?.label ?? '—'}
                  </Text>
                </Pressable>
              </Field>

              <Field label="Amount">
                <Controller
                  control={control}
                  name="amountMinor"
                  render={({ field }) => (
                    <View style={isTransfer ? { opacity: 0.5 } : undefined} pointerEvents={isTransfer ? 'none' : 'auto'}>
                      <MinorAmountInput
                        value={(field.value) ?? amountValue ?? '0'}
                        onChange={field.onChange}
                        currencyCode={tx?.currencyCode ?? 'USD'}
                      />
                    </View>
                  )}
                />
              </Field>

              <Field label="Note">
                <Controller
                  control={control}
                  name="note"
                  render={({ field }) => (
                    <TextInput
                      editable={!isTransfer}
                      value={(field.value) ?? ''}
                      onChangeText={field.onChange}
                      placeholder="Note"
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
                        opacity: isTransfer ? 0.5 : 1,
                      }}
                    />
                  )}
                />
              </Field>

              {tx && !isTransfer ? (
                <View style={{ marginTop: 14 }}>
                  <AttachmentStrip
                    mode="live"
                    ownerType="transaction"
                    ownerId={tx.id}
                    canMutate={!isDeleted}
                    onPreview={onPreviewAttachment}
                  />
                </View>
              ) : null}

              {isDeleted ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Restore transaction"
                  disabled={restoreMut.isPending}
                  onPress={onRestore}
                  style={({ pressed }) => ({
                    marginTop: 12,
                    backgroundColor: LIGHT.positive,
                    paddingVertical: 14,
                    borderRadius: 14,
                    alignItems: 'center',
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {restoreMut.isPending ? 'Restoring…' : 'Restore'}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  testID="edit-transaction-submit"
                  accessibilityRole="button"
                  accessibilityLabel="Save changes"
                  disabled={updateMut.isPending || isTransfer}
                  onPress={onSave}
                  style={({ pressed }) => ({
                    marginTop: 12,
                    backgroundColor: isTransfer ? LIGHT.borderStrong : ACCENTS.indigo.hex,
                    paddingVertical: 14,
                    borderRadius: 14,
                    alignItems: 'center',
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                    {updateMut.isPending ? 'Saving…' : 'Save'}
                  </Text>
                </Pressable>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </BottomSheetModal>

        <AccountPickerSheet
          ref={accountSheetRef}
          selectedId={account?.id}
          currencyFilter={tx?.currencyCode ?? null}
          onSelect={pickAccount}
        />
        <CategoryPickerSheet
          ref={categorySheetRef}
          typeFilter={tx?.type === 'INCOME' || tx?.type === 'EXPENSE' ? tx.type : undefined}
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

function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <Field label={label}>
      <View
        style={{
          borderWidth: 1,
          borderColor: LIGHT.border,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
          backgroundColor: LIGHT.chipBg,
        }}
      >
        <Text style={{ color: LIGHT.textDim, fontFamily: 'Geist Mono' }}>{value}</Text>
      </View>
    </Field>
  );
}
