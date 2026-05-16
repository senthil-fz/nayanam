// Bottom sheet to create a household category (INCOME or EXPENSE). The
// TRANSFER system row is server-seeded; user creates are filtered to the
// two allowed types by the shared Zod schema.

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
  CreateCategoryInput,
  type CreateCategoryInputType,
} from '@nayanam/core';
import {
  ACCENTS,
  CATEGORY_COLORS,
  CATEGORY_COLOR_TOKENS,
  CATEGORY_ICON_TOKENS,
  DEFAULT_CATEGORY_COLOR,
  DEFAULT_CATEGORY_ICON,
  LIGHT,
} from '@nayanam/ui-tokens';
import { useCreateCategory } from '../../lib/hooks';
import { hapticError, hapticSelection, hapticSuccess } from '../../lib/haptics';
import { logWarn } from '../../lib/log';
import { CategoryChip } from './CategoryChip';

export type AddCategorySheetHandle = {
  present: (preset?: { type?: 'INCOME' | 'EXPENSE' }) => void;
  dismiss: () => void;
};

export const AddCategorySheet = forwardRef<AddCategorySheetHandle>(
  function AddCategorySheet(_p, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const snapPoints = useMemo(() => ['90%'], []);
    const createMut = useCreateCategory();

    const { control, handleSubmit, reset, setValue, watch, formState } =
      useForm<CreateCategoryInputType>({
        resolver: zodResolver(CreateCategoryInput),
        defaultValues: {
          label: '',
          type: 'EXPENSE',
          iconToken: DEFAULT_CATEGORY_ICON,
          colorToken: DEFAULT_CATEGORY_COLOR,
        },
      });

    const type = watch('type');
    const iconToken = watch('iconToken') ?? DEFAULT_CATEGORY_ICON;
    const colorToken = watch('colorToken') ?? DEFAULT_CATEGORY_COLOR;

    useImperativeHandle(ref, () => ({
      present: (preset) => {
        reset({
          label: '',
          type: preset?.type ?? 'EXPENSE',
          iconToken: DEFAULT_CATEGORY_ICON,
          colorToken: DEFAULT_CATEGORY_COLOR,
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

    const onSubmit = handleSubmit(async (values) => {
      try {
        await createMut.mutateAsync(values);
        hapticSuccess();
        reset();
        sheetRef.current?.dismiss();
      } catch (err) {
        hapticError();
        logWarn('Create category failed', err);
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
              New category
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
                    onPress={() => setValue('type', t, { shouldDirty: true })}
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

            <Field label="Label">
              <Controller
                control={control}
                name="label"
                render={({ field }) => (
                  <TextInput
                    value={field.value ?? ''}
                    onChangeText={field.onChange}
                    placeholder="Lunch"
                    placeholderTextColor={LIGHT.textFaint}
                    autoCapitalize="words"
                    style={{
                      borderWidth: 1,
                      borderColor: LIGHT.border,
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      backgroundColor: LIGHT.surface,
                      color: LIGHT.text,
                      fontSize: 15,
                    }}
                  />
                )}
              />
              {formState.errors.label ? (
                <Text style={{ color: LIGHT.negative, fontSize: 11, marginTop: 4 }}>
                  {formState.errors.label.message}
                </Text>
              ) : null}
            </Field>

            <Field label="Preview">
              <View
                style={{
                  padding: 14,
                  borderRadius: 14,
                  backgroundColor: LIGHT.surface,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <CategoryChip iconToken={iconToken} colorToken={colorToken} />
                <Text style={{ fontSize: 15, fontWeight: '600', color: LIGHT.text }}>
                  {watch('label') || 'New category'}
                </Text>
              </View>
            </Field>

            <Field label="Color">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {CATEGORY_COLOR_TOKENS.map((t) => {
                  const c = CATEGORY_COLORS[t];
                  const selected = t === colorToken;
                  return (
                    <Pressable
                      key={t}
                      accessibilityRole="button"
                      accessibilityLabel={`Color ${c.name}${selected ? ', selected' : ''}`}
                      onPress={() => {
                        hapticSelection();
                        setValue('colorToken', t, {
                          shouldDirty: true,
                        });
                      }}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: c.soft,
                        borderWidth: selected ? 2 : 0,
                        borderColor: c.ink,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <View
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 7,
                          backgroundColor: c.ink,
                        }}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </Field>

            <Field label="Icon">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {CATEGORY_ICON_TOKENS.map((t) => {
                  const selected = t === iconToken;
                  return (
                    <Pressable
                      key={t}
                      accessibilityRole="button"
                      accessibilityLabel={`Icon ${t}${selected ? ', selected' : ''}`}
                      onPress={() => {
                        hapticSelection();
                        setValue('iconToken', t, {
                          shouldDirty: true,
                        });
                      }}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: selected ? LIGHT.text : LIGHT.chipBg,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <CategoryChip
                        iconToken={t}
                        colorToken={selected ? colorToken : 'graphite'}
                        size={selected ? 30 : 28}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </Field>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create category"
              disabled={createMut.isPending}
              onPress={onSubmit}
              style={({ pressed }) => ({
                marginTop: 12,
                backgroundColor: ACCENTS.indigo.hex,
                paddingVertical: 14,
                borderRadius: 14,
                alignItems: 'center',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                {createMut.isPending ? 'Saving…' : 'Create'}
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </BottomSheetModal>
    );
  },
);

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
