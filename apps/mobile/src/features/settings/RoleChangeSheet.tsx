// Role picker — 4 role options. Picking fires the mutation, which the
// backend validates (last-owner rule). Errors are surfaced via an alert.

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import type { ApiHouseholdRole } from '@nayanam/contracts';
import { Check } from 'lucide-react-native';
import { LIGHT } from '@nayanam/ui-tokens';
import { useUpdateHouseholdMemberRole } from '../../lib/hooks';
import { SheetShell, type SheetHandle } from './SheetShell';
import { hapticError, hapticSuccess } from '../../lib/haptics';

const ROLES: ApiHouseholdRole[] = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'];

const ROLE_DESCRIPTIONS: Record<ApiHouseholdRole, string> = {
  OWNER: 'Full control — can transfer or delete the household',
  ADMIN: 'Can invite, edit, and manage members',
  MEMBER: 'Can add transactions, budgets, bills',
  VIEWER: 'Read-only access',
};

export type RoleChangeSheetHandle = SheetHandle;

export const RoleChangeSheet = forwardRef<
  RoleChangeSheetHandle,
  { householdId: string; userId: string; currentRole: ApiHouseholdRole }
>(function RoleChangeSheet({ householdId, userId, currentRole }, ref) {
  const inner = useRef<SheetHandle>(null);
  const update = useUpdateHouseholdMemberRole();

  useImperativeHandle(ref, () => ({
    present: () => inner.current?.present(),
    dismiss: () => inner.current?.dismiss(),
  }));

  const onChoose = async (role: ApiHouseholdRole) => {
    if (role === currentRole) {
      inner.current?.dismiss();
      return;
    }
    try {
      await update.mutateAsync({ householdId, userId, role });
      hapticSuccess();
      inner.current?.dismiss();
    } catch (e) {
      hapticError();
      Alert.alert(
        'Could not change role',
        e instanceof Error ? e.message : 'Try again.',
      );
    }
  };

  return (
    <SheetShell ref={inner} title="Change role" snapPoints={['55%']}>
      <View style={{ gap: 8 }}>
        {ROLES.map((role) => {
          const active = role === currentRole;
          return (
            <Pressable
              key={role}
              accessibilityRole="button"
              accessibilityLabel={role}
              accessibilityState={{ selected: active }}
              onPress={() => void onChoose(role)}
              disabled={update.isPending}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 12,
                paddingHorizontal: 12,
                borderRadius: 12,
                backgroundColor:
                  pressed || active ? LIGHT.chipBg : 'transparent',
                opacity: update.isPending ? 0.6 : 1,
              })}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontSize: 15, fontWeight: '600', color: LIGHT.text }}
                >
                  {role}
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    color: LIGHT.textDim,
                    marginTop: 2,
                  }}
                >
                  {ROLE_DESCRIPTIONS[role]}
                </Text>
              </View>
              {active ? <Check size={18} color={LIGHT.text} /> : null}
            </Pressable>
          );
        })}
      </View>
    </SheetShell>
  );
});
