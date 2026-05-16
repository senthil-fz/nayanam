// Minimal wrapper around `@gorhom/bottom-sheet`'s modal with our standard
// backdrop + background/handle tokens. Each Settings sub-sheet composes this
// to avoid reproducing the same 30 lines of boilerplate.

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { Text, View } from 'react-native';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { LIGHT } from '@nayanam/ui-tokens';

export type SheetHandle = {
  present: () => void;
  dismiss: () => void;
};

type Props = {
  title?: string;
  snapPoints?: (string | number)[];
  children: ReactNode;
  /** If true, wraps children in a BottomSheetScrollView. */
  scrollable?: boolean;
};

export const SheetShell = forwardRef<SheetHandle, Props>(function SheetShell(
  { title, snapPoints: snap, children, scrollable = true },
  ref,
) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => snap ?? ['70%'], [snap]);

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

  const body = scrollable ? (
    <BottomSheetScrollView
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
    >
      {title ? <SheetTitle text={title} /> : null}
      {children}
    </BottomSheetScrollView>
  ) : (
    <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: 40 }}>
      {title ? <SheetTitle text={title} /> : null}
      {children}
    </View>
  );

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: LIGHT.bg }}
      handleIndicatorStyle={{ backgroundColor: LIGHT.border }}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
    >
      {body}
    </BottomSheetModal>
  );
});

function SheetTitle({ text }: { text: string }) {
  return (
    <Text
      accessibilityRole="header"
      style={{
        fontSize: 20,
        fontWeight: '700',
        color: LIGHT.text,
        paddingVertical: 8,
      }}
    >
      {text}
    </Text>
  );
}

/**
 * Primary action button. Used across sheets for the main CTA.
 */
export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  destructive,
  accent,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  destructive?: boolean;
  accent?: string;
  testID?: string;
}) {
  const bg = destructive ? LIGHT.negative : accent ?? LIGHT.text;
  return (
    <View
      style={{
        opacity: disabled || loading ? 0.6 : 1,
        borderRadius: 999,
        overflow: 'hidden',
      }}
    >
      <Text
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: Boolean(disabled || loading) }}
        onPress={disabled || loading ? undefined : onPress}
        style={{
          backgroundColor: bg,
          color: '#fff',
          textAlign: 'center',
          paddingVertical: 12,
          paddingHorizontal: 20,
          fontSize: 15,
          fontWeight: '600',
        }}
      >
        {loading ? 'Working…' : label}
      </Text>
    </View>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Text
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPress={disabled ? undefined : onPress}
      style={{
        color: LIGHT.textDim,
        textAlign: 'center',
        paddingVertical: 12,
        paddingHorizontal: 20,
        fontSize: 15,
        fontWeight: '500',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {label}
    </Text>
  );
}

export function FormLabel({ text }: { text: string }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: '600',
        color: LIGHT.textDim,
        marginBottom: 6,
      }}
    >
      {text}
    </Text>
  );
}

export function FormError({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <Text style={{ color: LIGHT.negative, fontSize: 12, marginTop: 4 }}>
      {text}
    </Text>
  );
}
