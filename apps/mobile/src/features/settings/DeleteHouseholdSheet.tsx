// Delete (archive) household. OWNER only. Blocks on member count > 1 per
// spec; name-match confirmation gates the destructive button.

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { ApiRequestError } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { useDeleteHousehold } from '../../lib/hooks';
import {
  PrimaryButton,
  SecondaryButton,
  SheetShell,
  type SheetHandle,
} from './SheetShell';
import { hapticError, hapticMedium } from '../../lib/haptics';

export type DeleteHouseholdSheetHandle = SheetHandle;

export const DeleteHouseholdSheet = forwardRef<
  DeleteHouseholdSheetHandle,
  {
    householdId: string;
    householdName: string;
    memberCount: number;
  }
>(function DeleteHouseholdSheet(
  { householdId, householdName, memberCount },
  ref,
) {
  const inner = useRef<SheetHandle>(null);
  const [confirmText, setConfirmText] = useState('');
  const deleteMut = useDeleteHousehold();
  const notEmpty = memberCount > 1;
  const matches = confirmText.trim() === householdName.trim();

  useImperativeHandle(ref, () => ({
    present: () => {
      setConfirmText('');
      inner.current?.present();
    },
    dismiss: () => inner.current?.dismiss(),
  }));

  const onDelete = async () => {
    hapticMedium();
    try {
      await deleteMut.mutateAsync({ householdId });
      inner.current?.dismiss();
    } catch (e) {
      hapticError();
      if (e instanceof ApiRequestError && e.code === 'HOUSEHOLD_NOT_EMPTY') {
        Alert.alert(
          'Cannot delete household',
          'Remove or have all other members leave first.',
        );
        return;
      }
      Alert.alert(
        'Could not delete household',
        e instanceof Error ? e.message : 'Try again.',
      );
    }
  };

  return (
    <SheetShell ref={inner} title="Delete household" snapPoints={['55%']}>
      <View style={{ gap: 16 }}>
        {notEmpty ? (
          <Text style={{ color: LIGHT.text, fontSize: 14, lineHeight: 20 }}>
            Remove or have all other members leave first. Only the owner of an
            empty household can delete it.
          </Text>
        ) : (
          <>
            <Text style={{ color: LIGHT.text, fontSize: 14, lineHeight: 20 }}>
              This archives the household. Type{' '}
              <Text style={{ fontWeight: '700' }}>{householdName}</Text> to
              confirm.
            </Text>
            <TextInput
              accessibilityLabel="Household name confirmation"
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder={householdName}
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
          </>
        )}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <SecondaryButton
            label="Cancel"
            onPress={() => inner.current?.dismiss()}
          />
          <PrimaryButton
            label="Delete household"
            onPress={() => void onDelete()}
            disabled={notEmpty || !matches}
            loading={deleteMut.isPending}
            destructive
          />
        </View>
      </View>
    </SheetShell>
  );
});
