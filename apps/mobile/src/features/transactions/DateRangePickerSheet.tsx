// Bottom-sheet date-range picker. V1 implementation: preset buttons + raw
// ISO-date text inputs. A native calendar picker lands in a later phase;
// `@react-native-community/datetimepicker` would pull in a native dep we
// haven't added yet.

import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { ACCENTS, LIGHT } from '@nayanam/ui-tokens';
import { hapticSelection } from '../../lib/haptics';

export type DateRangePickerSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

type Range = { from: string | null; to: string | null };

type Props = {
  value: Range;
  onChange: (r: Range) => void;
};

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function presetRange(days: number): Range {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - days);
  return { from: isoDay(from), to: isoDay(to) };
}

export const DateRangePickerSheet = forwardRef<DateRangePickerSheetHandle, Props>(
  function DateRangePickerSheet({ value, onChange }, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const snapPoints = useMemo(() => ['55%'], []);
    const [draft, setDraft] = useState<Range>(value);

    useImperativeHandle(ref, () => ({
      present: () => {
        setDraft(value);
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

    const apply = (r: Range) => {
      hapticSelection();
      onChange(r);
      sheetRef.current?.dismiss();
    };

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: LIGHT.bg }}
        handleIndicatorStyle={{ backgroundColor: LIGHT.border }}
      >
        <View style={{ paddingHorizontal: 20, paddingBottom: 24, gap: 14 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: LIGHT.text }}>
            Date range
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[
              { label: '7 days', range: presetRange(7) },
              { label: '30 days', range: presetRange(30) },
              { label: '90 days', range: presetRange(90) },
              { label: 'All time', range: { from: null, to: null } },
            ].map((p) => (
              <Pressable
                key={p.label}
                accessibilityRole="button"
                accessibilityLabel={`${p.label} range`}
                onPress={() => apply(p.range)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: LIGHT.chipBg,
                }}
              >
                <Text style={{ color: LIGHT.text, fontSize: 13, fontWeight: '600' }}>
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput
              accessibilityLabel="From date"
              value={draft.from ?? ''}
              onChangeText={(t) => setDraft((d) => ({ ...d, from: t || null }))}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={LIGHT.textFaint}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: LIGHT.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: LIGHT.text,
                fontFamily: 'Geist Mono',
              }}
            />
            <TextInput
              accessibilityLabel="To date"
              value={draft.to ?? ''}
              onChangeText={(t) => setDraft((d) => ({ ...d, to: t || null }))}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={LIGHT.textFaint}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: LIGHT.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: LIGHT.text,
                fontFamily: 'Geist Mono',
              }}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Apply date range"
            onPress={() => apply(draft)}
            style={({ pressed }) => ({
              marginTop: 4,
              backgroundColor: ACCENTS.indigo.hex,
              paddingVertical: 12,
              borderRadius: 12,
              alignItems: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Apply</Text>
          </Pressable>
        </View>
      </BottomSheetModal>
    );
  },
);
