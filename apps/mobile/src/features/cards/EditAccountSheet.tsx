// Bottom-sheet form to edit an existing Account.
// Differences from AddAccountSheet:
//  - `type` and `currencyCode` disabled with a lock icon + helper text.
//  - Opening balance locked when `cachedBalanceAt > openingBalanceAt` (i.e.
//    transactions have landed against this account).
//  - Footer destructive "Archive" button with a confirm Alert; success shows
//    an inline "Account archived — Undo" banner that calls restore.

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { BottomSheetBackdrop, BottomSheetModal } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UpdateAccountInput, type UpdateAccountInputType } from '@nayanam/core';
import type { components } from '@nayanam/contracts';
import { ACCENTS, LIGHT } from '@nayanam/ui-tokens';
import {
  useArchiveAccount,
  useRestoreAccount,
  useUpdateAccount,
} from '../../lib/hooks';
import { hapticError, hapticSuccess } from '../../lib/haptics';
import { logWarn } from '../../lib/log';
import {
  ColorChipRow,
  IconChipRow,
  InputField,
  LabeledField,
  TypeSegmented,
} from './AccountFormFields';
import { TrashIcon } from './icons';

type Account = components['schemas']['Account'];

export type EditAccountSheetHandle = {
  present: (account: Account) => void;
  dismiss: () => void;
};

export const EditAccountSheet = forwardRef<EditAccountSheetHandle>(
  function EditAccountSheet(_, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const [account, setAccount] = useState<Account | null>(null);
    const [archivedBanner, setArchivedBanner] = useState<Account | null>(null);
    const snapPoints = useMemo(() => ['90%'], []);

    const updateAccount = useUpdateAccount(account?.id ?? '');
    const archiveAccount = useArchiveAccount(account?.id ?? '');
    const restoreAccount = useRestoreAccount(archivedBanner?.id ?? '');

    const { control, handleSubmit, reset, setValue, watch, formState } =
      useForm<UpdateAccountInputType>({
        resolver: zodResolver(UpdateAccountInput),
        defaultValues: {
          nickname: '',
          institution: '',
          last4: null,
          colorToken: 'indigo',
          iconToken: 'wallet',
        },
      });

    useEffect(() => {
      if (!account) return;
      reset({
        nickname: account.nickname,
        institution: account.institution ?? '',
        last4: account.last4,
        colorToken: account.colorToken,
        iconToken: account.iconToken,
        openingBalanceMinor: account.openingBalanceMinor,
        openingBalanceAt: account.openingBalanceAt,
      });
    }, [account, reset]);

    useImperativeHandle(ref, () => ({
      present: (a) => {
        setAccount(a);
        sheetRef.current?.present();
      },
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const openingLocked = account
      ? new Date(account.cachedBalanceAt) > new Date(account.openingBalanceAt)
      : true;
    const colorToken = watch('colorToken') ?? 'indigo';
    const iconToken = watch('iconToken') ?? 'wallet';

    const onSubmit = handleSubmit(async (values) => {
      if (!account) return;
      try {
        const payload: UpdateAccountInputType = {
          ...values,
          institution: values.institution?.trim() || null,
          last4: values.last4?.trim() || null,
        };
        // Strip locked fields client-side so we don't trigger server errors.
        if (openingLocked) {
          delete payload.openingBalanceMinor;
          delete payload.openingBalanceAt;
        }
        await updateAccount.mutateAsync(payload);
        hapticSuccess();
        sheetRef.current?.dismiss();
      } catch (err) {
        hapticError();
        logWarn('Update account failed', err);
      }
    });

    const onArchive = () => {
      if (!account) return;
      Alert.alert(
        `Archive ${account.nickname}?`,
        'It will be hidden from lists. Transactions remain.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Archive',
            style: 'destructive',
            onPress: () => {
              void (async () => {
              try {
                const archived = await archiveAccount.mutateAsync({});
                hapticSuccess();
                setArchivedBanner(archived);
                sheetRef.current?.dismiss();
                // Auto-hide the banner after 6s.
                setTimeout(() => setArchivedBanner(null), 6000);
              } catch (err) {
                hapticError();
                logWarn('Archive failed', err);
              }
              })();
            },
          },
        ],
      );
    };

    const onUndo = async () => {
      if (!archivedBanner) return;
      try {
        await restoreAccount.mutateAsync({});
        hapticSuccess();
        setArchivedBanner(null);
      } catch (err) {
        hapticError();
        logWarn('Restore failed', err);
      }
    };

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
                Edit account
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
                    <InputField value={field.value ?? ''} onChange={field.onChange} autoCapitalize="words" />
                  )}
                />
                {formState.errors.nickname && (
                  <Text style={{ color: LIGHT.negative, fontSize: 11, marginTop: 4 }}>
                    {formState.errors.nickname.message}
                  </Text>
                )}
              </LabeledField>

              <LabeledField label="Type" locked helper="Set at creation.">
                <TypeSegmented
                  value={(account?.type ?? 'DEBIT')}
                  onChange={() => {}}
                  disabled
                />
              </LabeledField>

              <LabeledField label="Currency" locked helper="Set at creation.">
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
                  <Text style={{ fontSize: 15, color: LIGHT.textDim, fontFamily: 'Geist Mono' }}>
                    {account?.currencyCode}
                  </Text>
                </View>
              </LabeledField>

              <LabeledField label="Institution (optional)">
                <Controller
                  control={control}
                  name="institution"
                  render={({ field }) => (
                    <InputField value={field.value ?? ''} onChange={field.onChange} autoCapitalize="words" />
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
                      keyboardType="number-pad"
                      maxLength={4}
                    />
                  )}
                />
              </LabeledField>

              <LabeledField
                label="Opening balance"
                locked={openingLocked}
                helper={openingLocked ? 'Locked once transactions are recorded.' : undefined}
              >
                <Controller
                  control={control}
                  name="openingBalanceMinor"
                  render={({ field }) => (
                    <InputField
                      value={displayOpening(field.value, account?.currencyCode ?? 'USD')}
                      onChange={(t) => {
                        const cleaned = t.replace(/[^0-9.-]/g, '');
                        field.onChange(openingToMinor(cleaned, account?.currencyCode ?? 'USD'));
                      }}
                      keyboardType="decimal-pad"
                      disabled={openingLocked}
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
                testID="edit-account-submit"
                accessibilityRole="button"
                accessibilityLabel="Save changes"
                disabled={updateAccount.isPending}
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
                  {updateAccount.isPending ? 'Saving…' : 'Save changes'}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Archive account"
                onPress={onArchive}
                style={({ pressed }) => ({
                  marginTop: 14,
                  paddingVertical: 12,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: LIGHT.negative,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 8,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <TrashIcon size={14} color={LIGHT.negative} />
                <Text style={{ color: LIGHT.negative, fontWeight: '600', fontSize: 14 }}>
                  Archive account
                </Text>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </BottomSheetModal>

        {archivedBanner && (
          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: 100,
            }}
          >
            <View
              style={{
                backgroundColor: LIGHT.text,
                borderRadius: 14,
                paddingHorizontal: 16,
                paddingVertical: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text style={{ color: '#fff', fontSize: 14, flex: 1 }}>Account archived</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Undo archive"
                onPress={onUndo}
                style={{ paddingHorizontal: 10 }}
              >
                <Text style={{ color: ACCENTS.indigo.soft, fontWeight: '700', fontSize: 14 }}>
                  Undo
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </>
    );
  },
);

function minorDigits(code: string): number {
  if (['JPY', 'KRW', 'VND', 'IDR', 'CLP'].includes(code)) return 0;
  return 2;
}
function displayOpening(minor: string | undefined, code: string): string {
  if (minor == null) return '';
  const d = minorDigits(code);
  const n = Number(minor) / 10 ** d;
  if (!Number.isFinite(n)) return '';
  return d === 0 ? `${Math.trunc(n)}` : n.toFixed(d);
}
function openingToMinor(display: string, code: string): string {
  if (!display || display === '-' || display === '.') return '0';
  const n = Number(display);
  if (!Number.isFinite(n)) return '0';
  const d = minorDigits(code);
  return Math.round(n * 10 ** d).toString();
}
