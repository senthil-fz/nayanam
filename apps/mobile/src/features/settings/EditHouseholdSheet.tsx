// Edit household name + default currency + icon/color tokens. OWNER/ADMIN only.

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LinearGradient } from 'expo-linear-gradient';
import type { ApiHousehold } from '@nayanam/contracts';
import {
  ACCOUNT_COLORS,
  ACCOUNT_COLOR_TOKENS,
  ACCOUNT_ICONS,
  ACCOUNT_ICON_TOKENS,
} from '@nayanam/ui-tokens';
import { SUPPORTED_CURRENCY_CODES } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { useUpdateHousehold } from '../../lib/hooks';
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
import { hapticError, hapticSuccess } from '../../lib/haptics';

const Schema = z.object({
  name: z.string().trim().min(1).max(100),
  defaultCurrencyCode: z.string().length(3),
  iconToken: z.string().nullable(),
  colorToken: z.string().nullable(),
});
type FormValues = z.infer<typeof Schema>;

export type EditHouseholdSheetHandle = SheetHandle;

export const EditHouseholdSheet = forwardRef<
  EditHouseholdSheetHandle,
  { household: ApiHousehold | null }
>(function EditHouseholdSheet({ household }, ref) {
  const inner = useRef<SheetHandle>(null);
  const currencyRef = useRef<CurrencyPickerSheetHandle>(null);
  const update = useUpdateHousehold();
  const appearance = useAppearance();
  const [seeded, setSeeded] = useState(false);

  useImperativeHandle(ref, () => ({
    present: () => {
      setSeeded(false);
      inner.current?.present();
    },
    dismiss: () => inner.current?.dismiss(),
  }));

  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      name: '',
      defaultCurrencyCode: 'USD',
      iconToken: null,
      colorToken: null,
    },
  });

  useEffect(() => {
    if (seeded || !household) return;
    form.reset({
      name: household.name,
      defaultCurrencyCode: household.defaultCurrencyCode,
      iconToken: household.iconToken ?? null,
      colorToken: household.colorToken ?? null,
    });
    setSeeded(true);
  }, [household, form, seeded]);

  const onSave = form.handleSubmit(async (values) => {
    if (!household) return;
    try {
      await update.mutateAsync({
        id: household.id,
        patch: {
          name: values.name,
          defaultCurrencyCode: values.defaultCurrencyCode,
          iconToken: values.iconToken,
          colorToken: values.colorToken,
        },
      });
      hapticSuccess();
      inner.current?.dismiss();
    } catch (e) {
      hapticError();
      Alert.alert(
        'Could not update household',
        e instanceof Error ? e.message : 'Try again.',
      );
    }
  });

  const colorToken = form.watch('colorToken');
  const iconToken = form.watch('iconToken');

  return (
    <>
      <SheetShell ref={inner} title="Edit household" snapPoints={['85%']}>
        <View style={{ gap: 16 }}>
          <View>
            <FormLabel text="Name" />
            <Controller
              control={form.control}
              name="name"
              render={({ field }) => (
                <TextInput
                  accessibilityLabel="Household name"
                  value={field.value}
                  onChangeText={field.onChange}
                  placeholder="Household name"
                  placeholderTextColor={LIGHT.textFaint}
                  style={inputStyle}
                />
              )}
            />
            <FormError text={form.formState.errors.name?.message} />
          </View>

          <View>
            <FormLabel text="Default currency" />
            <Controller
              control={form.control}
              name="defaultCurrencyCode"
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
                    label={field.value}
                    onPress={() => currencyRef.current?.present()}
                    last
                  />
                </View>
              )}
            />
          </View>

          <View>
            <FormLabel text="Color" />
            <View
              style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}
            >
              {ACCOUNT_COLOR_TOKENS.map((token) => {
                const color = ACCOUNT_COLORS[token];
                const active = colorToken === token;
                return (
                  <Pressable
                    key={token}
                    accessibilityRole="button"
                    accessibilityLabel={`${color.name} color`}
                    accessibilityState={{ selected: active }}
                    onPress={() => form.setValue('colorToken', token)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      borderWidth: active ? 3 : 0,
                      borderColor: appearance.accentHex,
                      overflow: 'hidden',
                    }}
                  >
                    <LinearGradient
                      colors={[color.from, color.to]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{ flex: 1 }}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View>
            <FormLabel text="Icon" />
            <View
              style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
            >
              {ACCOUNT_ICON_TOKENS.map((token) => {
                const active = iconToken === token;
                return (
                  <Pressable
                    key={token}
                    accessibilityRole="button"
                    accessibilityLabel={ACCOUNT_ICONS[token].name}
                    accessibilityState={{ selected: active }}
                    onPress={() => form.setValue('iconToken', token)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active
                        ? appearance.accentHex
                        : LIGHT.border,
                      backgroundColor: active
                        ? `${appearance.accentHex}22`
                        : 'transparent',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: active ? appearance.accentHex : LIGHT.textDim,
                      }}
                    >
                      {ACCOUNT_ICONS[token].name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
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
        selectedCode={form.watch('defaultCurrencyCode') ?? 'USD'}
        codes={SUPPORTED_CURRENCY_CODES}
        onSelect={(c) => form.setValue('defaultCurrencyCode', c)}
      />
    </>
  );
});

const inputStyle = {
  borderWidth: 1,
  borderColor: LIGHT.border,
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 10,
  color: LIGHT.text,
  fontSize: 15,
} as const;
