// Action sheet shown on long-press or from the detail sheet footer.
// Lists Edit / Pause (or Resume) / Archive (ADMIN+). Each option
// dispatches the appropriate shared hook and plays a haptic on success.

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
} from '@gorhom/bottom-sheet';
import { Archive, Pause, Pencil, Play, RotateCcw } from 'lucide-react-native';
import type { Budget } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import {
  useArchiveBudget,
  usePauseBudget,
  useRestoreBudget,
  useResumeBudget,
} from '../../lib/hooks';
import {
  hapticError,
  hapticSelection,
  hapticSuccess,
} from '../../lib/haptics';

export type BudgetActionsSheetPresentArgs = {
  budget: Budget;
};

export type BudgetActionsSheetHandle = {
  present: (args: BudgetActionsSheetPresentArgs) => void;
  dismiss: () => void;
};

type Props = {
  canArchive: boolean;
  onEdit: (budget: Budget) => void;
};

export const BudgetActionsSheet = forwardRef<BudgetActionsSheetHandle, Props>(
  function BudgetActionsSheet({ canArchive, onEdit }, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const snapPoints = useMemo(() => ['45%'], []);
    const [budget, setBudget] = useState<Budget | null>(null);

    const pauseMut = usePauseBudget();
    const resumeMut = useResumeBudget();
    const archiveMut = useArchiveBudget();
    const restoreMut = useRestoreBudget();

    useImperativeHandle(ref, () => ({
      present: ({ budget: b }) => {
        setBudget(b);
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

    const run = useCallback(
      async (fn: () => Promise<unknown>) => {
        try {
          await fn();
          hapticSuccess();
          sheetRef.current?.dismiss();
        } catch (err) {
          hapticError();
          Alert.alert('Something went wrong', (err as Error).message ?? '');
        }
      },
      [],
    );

    if (!budget) {
      return (
        <BottomSheetModal
          ref={sheetRef}
          snapPoints={snapPoints}
          enablePanDownToClose
          backdropComponent={renderBackdrop}
          backgroundStyle={{ backgroundColor: LIGHT.bg }}
          handleIndicatorStyle={{ backgroundColor: LIGHT.border }}
        >
          <View style={{ padding: 20 }} />
        </BottomSheetModal>
      );
    }

    const paused = budget.status === 'PAUSED';
    const archived = Boolean(budget.archivedAt);

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: LIGHT.bg }}
        handleIndicatorStyle={{ backgroundColor: LIGHT.border }}
      >
        <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: LIGHT.text }}>
            {budget.name}
          </Text>
          <Text style={{ fontSize: 12, color: LIGHT.textDim, marginTop: 2 }}>
            Pick an action.
          </Text>

          <View style={{ marginTop: 16, gap: 8 }}>
            <ActionRow
              icon={Pencil}
              label="Edit"
              onPress={() => {
                hapticSelection();
                sheetRef.current?.dismiss();
                // Defer to avoid double-sheet present race.
                setTimeout(() => onEdit(budget), 80);
              }}
            />

            {!archived ? (
              paused ? (
                <ActionRow
                  icon={Play}
                  label="Resume"
                  onPress={() =>
                    void run(() =>
                      resumeMut.mutateAsync({ budgetId: budget.id }),
                    )
                  }
                />
              ) : (
                <ActionRow
                  icon={Pause}
                  label="Pause"
                  onPress={() =>
                    void run(() =>
                      pauseMut.mutateAsync({ budgetId: budget.id }),
                    )
                  }
                />
              )
            ) : null}

            {canArchive && !archived ? (
              <ActionRow
                icon={Archive}
                label="Archive"
                tone="danger"
                onPress={() =>
                  void run(() =>
                    archiveMut.mutateAsync({ budgetId: budget.id }),
                  )
                }
              />
            ) : null}

            {canArchive && archived ? (
              <ActionRow
                icon={RotateCcw}
                label="Restore"
                onPress={() =>
                  void run(() =>
                    restoreMut.mutateAsync({ budgetId: budget.id }),
                  )
                }
              />
            ) : null}
          </View>
        </View>
      </BottomSheetModal>
    );
  },
);

function ActionRow({
  icon: Icon,
  label,
  onPress,
  tone,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  onPress: () => void;
  tone?: 'danger';
}) {
  const color = tone === 'danger' ? LIGHT.negative : LIGHT.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 14,
        borderRadius: 14,
        backgroundColor: pressed ? LIGHT.chipBg : LIGHT.surface,
        borderWidth: 1,
        borderColor: LIGHT.border,
      })}
    >
      <Icon size={18} color={color} />
      <Text style={{ color, fontSize: 15, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}
