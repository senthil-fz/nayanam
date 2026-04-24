// Chip-style currency switcher backed by a `@gorhom/bottom-sheet` modal
// listing the currencies the household actually transacts in. The
// orchestrator only mounts this when there is more than one currency in
// the window (acceptance criterion 24).

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
import { Check, ChevronDown } from 'lucide-react-native';
import { LIGHT } from '@nayanam/ui-tokens';
import { hapticSelection, hapticLight } from '../../lib/haptics';

export type CurrencySwitcherHandle = {
  present: () => void;
  dismiss: () => void;
};

type Props = {
  value: string;
  currencies: ReadonlyArray<string>;
  onChange: (code: string) => void;
};

// Chip is always tappable; the sheet is imperatively presented.
export function CurrencySwitcher({ value, currencies, onChange }: Props) {
  const sheetRef = useRef<CurrencySwitcherSheetHandle>(null);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Currency ${value}. Tap to change.`}
        onPress={() => {
          hapticLight();
          sheetRef.current?.present();
        }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 999,
          backgroundColor: pressed ? LIGHT.borderStrong : LIGHT.chipBg,
        })}
      >
        <Text
          style={{
            fontFamily: 'Geist Mono',
            fontSize: 11,
            fontWeight: '700',
            color: LIGHT.text,
            letterSpacing: 0.5,
          }}
        >
          {value}
        </Text>
        <ChevronDown size={14} color={LIGHT.textDim} />
      </Pressable>
      <CurrencySwitcherSheet
        ref={sheetRef}
        value={value}
        currencies={currencies}
        onChange={onChange}
      />
    </>
  );
}

type CurrencySwitcherSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

const CurrencySwitcherSheet = forwardRef<CurrencySwitcherSheetHandle, Props>(
  function CurrencySwitcherSheet({ value, currencies, onChange }, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const snapPoints = useMemo(() => ['50%'], []);

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
          data={currencies}
          keyExtractor={(c) => c}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40 }}
          renderItem={({ item }) => {
            const selected = item === value;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Currency ${item}${selected ? ', selected' : ''}`}
                onPress={() => {
                  hapticSelection();
                  onChange(item);
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
