// Bottom sheet to edit a household category. System rows cannot be edited
// (spec §CATEGORY_SYSTEM_READONLY) and are never passed into this sheet.

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
  UpdateCategoryInput,
  type UpdateCategoryInputType,
  type Category,
} from '@nayanam/core';
import {
  ACCENTS,
  CATEGORY_COLORS,
  CATEGORY_COLOR_TOKENS,
  CATEGORY_ICON_TOKENS,
  LIGHT,
} from '@nayanam/ui-tokens';
import { useUpdateCategory } from '../../lib/hooks';
import { hapticError, hapticSelection, hapticSuccess } from '../../lib/haptics';
import { logWarn } from '../../lib/log';
import { CategoryChip } from './CategoryChip';

export type EditCategorySheetHandle = {
  present: (category: Category) => void;
  dismiss: () => void;
};

export const EditCategorySheet = forwardRef<EditCategorySheetHandle>(
  function EditCategorySheet(_p, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const snapPoints = useMemo(() => ['90%'], []);
    const [cat, setCat] = useState<Category | null>(null);
    const updateMut = useUpdateCategory(cat?.id ?? '');

    const { control, handleSubmit, reset, setValue, watch } =
      useForm<UpdateCategoryInputType>({
        resolver: zodResolver(UpdateCategoryInput),
        defaultValues: {
          label: '',
          iconToken: 'tag',
          colorToken: 'graphite',
        },
      });

    const iconToken = watch('iconToken') ?? 'tag';
    const colorToken = watch('colorToken') ?? 'graphite';

    useImperativeHandle(ref, () => ({
      present: (c) => {
        setCat(c);
        reset({
          label: c.label,
          iconToken: c.iconToken,
          colorToken: c.colorToken,
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
      if (!cat) return;
      try {
        const patch: UpdateCategoryInputType = {};
        if (values.label !== undefined && values.label !== cat.label)
          patch.label = values.label;
        if (values.iconToken && values.iconToken !== cat.iconToken)
          patch.iconToken = values.iconToken;
        if (values.colorToken && values.colorToken !== cat.colorToken)
          patch.colorToken = values.colorToken;
        if (Object.keys(patch).length === 0) {
          sheetRef.current?.dismiss();
          return;
        }
        await updateMut.mutateAsync(patch);
        hapticSuccess();
        sheetRef.current?.dismiss();
      } catch (err) {
        hapticError();
        logWarn('Update category failed', err);
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
              Edit category
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
            <Field label="Label">
              <Controller
                control={control}
                name="label"
                render={({ field }) => (
                  <TextInput
                    value={(field.value) ?? ''}
                    onChangeText={field.onChange}
                    placeholder="Label"
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
                  {(watch('label')) ?? cat?.label ?? ''}
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
              testID="edit-category-submit"
              accessibilityRole="button"
              accessibilityLabel="Save changes"
              disabled={updateMut.isPending}
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
                {updateMut.isPending ? 'Saving…' : 'Save'}
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
