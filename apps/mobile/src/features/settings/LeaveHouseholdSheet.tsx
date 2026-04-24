// Confirm-leave flow. Sole OWNER with other members gets a block message.

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Alert, Text, View } from 'react-native';
import type { ApiHouseholdRole } from '@nayanam/contracts';
import { LIGHT } from '@nayanam/ui-tokens';
import { useLeaveHousehold } from '../../lib/hooks';
import {
  PrimaryButton,
  SecondaryButton,
  SheetShell,
  type SheetHandle,
} from './SheetShell';
import { hapticError, hapticMedium } from '../../lib/haptics';

export type LeaveHouseholdSheetHandle = SheetHandle;

export const LeaveHouseholdSheet = forwardRef<
  LeaveHouseholdSheetHandle,
  {
    householdId: string;
    myRole: ApiHouseholdRole | null;
    ownerCount: number;
    memberCount: number;
  }
>(function LeaveHouseholdSheet(
  { householdId, myRole, ownerCount, memberCount },
  ref,
) {
  const inner = useRef<SheetHandle>(null);
  const leave = useLeaveHousehold();
  const isLastOwner =
    myRole === 'OWNER' && ownerCount <= 1 && memberCount > 1;

  useImperativeHandle(ref, () => ({
    present: () => inner.current?.present(),
    dismiss: () => inner.current?.dismiss(),
  }));

  const onLeave = async () => {
    hapticMedium();
    try {
      await leave.mutateAsync({ householdId });
      inner.current?.dismiss();
    } catch (e) {
      hapticError();
      Alert.alert(
        'Could not leave',
        e instanceof Error ? e.message : 'Try again.',
      );
    }
  };

  return (
    <SheetShell ref={inner} title="Leave household" snapPoints={['40%']}>
      <View style={{ gap: 16 }}>
        {isLastOwner ? (
          <Text style={{ color: LIGHT.text, fontSize: 14, lineHeight: 20 }}>
            You are the last owner. Promote another member to owner before
            leaving or deleting.
          </Text>
        ) : (
          <Text style={{ color: LIGHT.text, fontSize: 14, lineHeight: 20 }}>
            You&rsquo;ll lose access to this household&rsquo;s data. You can
            rejoin via a new invite.
          </Text>
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
            label="Leave household"
            onPress={() => void onLeave()}
            disabled={isLastOwner}
            loading={leave.isPending}
            destructive
          />
        </View>
      </View>
    </SheetShell>
  );
});
