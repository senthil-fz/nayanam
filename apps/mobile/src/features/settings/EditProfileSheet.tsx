// Edit display name + primary currency. RHF + Zod.

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Alert, TextInput, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  SUPPORTED_CURRENCY_CODES,
  UpdateMeInput,
  type UpdateMeInputType,
} from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { useMePhase9, useUpdateMe } from '../../lib/hooks';
import { useAppearance } from '../../lib/appearance';
import {
  FormError,
  FormLabel,
  PrimaryButton,
  SecondaryButton,
  SheetShell,
  type SheetHandle,
} from './SheetShell';
import { Row } from './primitives';
import {
  CurrencyPickerSheet,
  type CurrencyPickerSheetHandle,
} from '../budgets/CurrencyPickerSheet';
import { hapticSuccess, hapticError } from '../../lib/haptics';

export type EditProfileSheetHandle = SheetHandle;

export const EditProfileSheet = forwardRef<EditProfileSheetHandle, object>(
  function EditProfileSheet(_props, ref) {
    const me = useMePhase9();
    const update = useUpdateMe();
    const appearance = useAppearance();
    const inner = useRef<SheetHandle>(null);
    const currencyRef = useRef<CurrencyPickerSheetHandle>(null);

    useImperativeHandle(ref, () => ({
      present: () => inner.current?.present(),
      dismiss: () => inner.current?.dismiss(),
    }));

    const form = useForm<UpdateMeInputType>({
      resolver: zodResolver(UpdateMeInput),
      defaultValues: { name: '', primaryCurrencyCode: 'USD' },
    });

    // Reset form defaults whenever the user data lands.
    const [seeded, setSeeded] = useState(false);
    useEffect(() => {
      if (seeded || !me.data) return;
      form.reset({
        name: me.data.user.name ?? '',
        primaryCurrencyCode:
          me.data.primaryCurrencyCode ?? me.data.user.primaryCurrencyCode ?? 'USD',
      });
      setSeeded(true);
    }, [me.data, form, seeded]);

    const onSave = form.handleSubmit(async (values) => {
      try {
        await update.mutateAsync({
          name: values.name?.trim() ? values.name.trim() : null,
          primaryCurrencyCode: values.primaryCurrencyCode ?? null,
        });
        hapticSuccess();
        inner.current?.dismiss();
      } catch (e) {
        hapticError();
        Alert.alert(
          'Could not update profile',
          e instanceof Error ? e.message : 'Try again.',
        );
      }
    });

    return (
      <>
        <SheetShell ref={inner} title="Edit profile" snapPoints={['55%']}>
          <View style={{ gap: 16 }}>
            <View>
              <FormLabel text="Display name" />
              <Controller
                control={form.control}
                name="name"
                render={({ field }) => (
                  <TextInput
                    accessibilityLabel="Display name"
                    value={field.value ?? ''}
                    onChangeText={field.onChange}
                    placeholder="Your name"
                    placeholderTextColor={LIGHT.textFaint}
                    style={{
                      borderWidth: 1,
                      borderColor: LIGHT.border,
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      color: LIGHT.text,
                      fontSize: 15,
                    }}
                  />
                )}
              />
              <FormError text={form.formState.errors.name?.message} />
            </View>

            <View>
              <FormLabel text="Primary currency" />
              <Controller
                control={form.control}
                name="primaryCurrencyCode"
                render={({ field }) => (
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: LIGHT.border,
                      borderRadius: 12,
                      overflow: 'hidden',
                    }}
                  >
                    <Row
                      label={field.value ?? 'Choose a currency'}
                      onPress={() => currencyRef.current?.present()}
                      last
                    />
                  </View>
                )}
              />
            </View>

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 8,
              }}
            >
              <SecondaryButton
                label="Cancel"
                onPress={() => inner.current?.dismiss()}
              />
              <PrimaryButton
                testID="edit-profile-submit"
                label="Save"
                onPress={() => void onSave()}
                loading={update.isPending}
                accent={appearance.accentHex}
              />
            </View>
          </View>
        </SheetShell>

        <CurrencyPickerSheet
          ref={currencyRef}
          selectedCode={form.watch('primaryCurrencyCode') ?? 'USD'}
          codes={SUPPORTED_CURRENCY_CODES}
          onSelect={(c) => form.setValue('primaryCurrencyCode', c)}
        />
      </>
    );
  },
);
