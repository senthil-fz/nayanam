// Lightweight currency picker bottom sheet for the Budget form. Lists
// the shared `SUPPORTED_CURRENCY_CODES`; the selected code is ticked.
//
// Scoped to Budgets for now — the Phase 3 account flow uses an inline
// picker there. If another surface needs this we can promote it to
// `src/components`.

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
} from '@gorhom/bottom-sheet';
import { Check } from 'lucide-react-native';
import { LIGHT } from '@nayanam/ui-tokens';
import { hapticSelection } from '../../lib/haptics';

export type CurrencyPickerSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

type Props = {
  selectedCode: string;
  codes: readonly string[];
  onSelect: (code: string) => void;
};

export const CurrencyPickerSheet = forwardRef<CurrencyPickerSheetHandle, Props>(
  function CurrencyPickerSheet({ selectedCode, codes, onSelect }, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const snapPoints = useMemo(() => ['65%'], []);

    useImperativeHandle(ref, () => ({
      present: () => sheetRef.current?.present(),
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

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: LIGHT.bg }}
        handleIndicatorStyle={{ backgroundColor: LIGHT.border }}
      >
        <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: LIGHT.text }}>
            Choose currency
          </Text>
        </View>
        <FlatList
          data={codes}
          keyExtractor={(c) => c}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40 }}
          renderItem={({ item }) => {
            const selected = item === selectedCode;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Currency ${item}${selected ? ', selected' : ''}`}
                onPress={() => {
                  hapticSelection();
                  onSelect(item);
                  sheetRef.current?.dismiss();
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor:
                    selected || pressed ? LIGHT.chipBg : 'transparent',
                })}
              >
                <Text
                  style={{
                    flex: 1,
                    color: LIGHT.text,
                    fontSize: 15,
                    fontWeight: '600',
                    fontFamily: 'Geist Mono',
                  }}
                >
                  {item}
                </Text>
                {selected ? <Check size={18} color={LIGHT.text} /> : null}
              </Pressable>
            );
          }}
        />
      </BottomSheetModal>
    );
  },
);
