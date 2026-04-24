// Single household member row. Self row never shows remove; the sole OWNER
// can't self-demote. Role change + remove open dedicated sheets for clean
// confirmation UX on mobile.

import { useRef } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import type { ApiHouseholdMember } from '@nayanam/contracts';
import { LIGHT } from '@nayanam/ui-tokens';
import { useRemoveHouseholdMember } from '../../lib/hooks';
import { Avatar } from './primitives';
import {
  RoleChangeSheet,
  type RoleChangeSheetHandle,
} from './RoleChangeSheet';
import { hapticError, hapticMedium } from '../../lib/haptics';

export function MemberRow({
  member,
  householdId,
  isSelf,
  canManageRoles,
  canRemove,
  ownerCount,
  subline,
  last,
}: {
  member: ApiHouseholdMember;
  householdId: string;
  isSelf: boolean;
  canManageRoles: boolean;
  canRemove: boolean;
  ownerCount: number;
  subline: string;
  last?: boolean;
}) {
  const remove = useRemoveHouseholdMember();
  const roleRef = useRef<RoleChangeSheetHandle>(null);
  const soleOwnerSelf = isSelf && member.role === 'OWNER' && ownerCount === 1;
  const roleDisabled = !canManageRoles || soleOwnerSelf;

  const onRemove = () => {
    Alert.alert(
      `Remove ${member.name ?? member.email}?`,
      'They will lose access to this household.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            hapticMedium();
            void (async () => {
              try {
                await remove.mutateAsync({
                  householdId,
                  userId: member.userId,
                });
              } catch (e) {
                hapticError();
                Alert.alert(
                  'Could not remove member',
                  e instanceof Error ? e.message : 'Try again.',
                );
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: LIGHT.border,
        }}
      >
        <Avatar name={member.name ?? member.email} size={36} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{ color: LIGHT.text, fontSize: 14, fontWeight: '600' }}
          >
            {member.name ?? member.email}
            {isSelf ? (
              <Text
                style={{
                  color: LIGHT.textDim,
                  fontSize: 10,
                  fontWeight: '600',
                }}
              >
                {'  '}you
              </Text>
            ) : null}
          </Text>
          <Text
            numberOfLines={1}
            style={{ color: LIGHT.textDim, fontSize: 11, marginTop: 1 }}
          >
            {subline}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${member.role} role${roleDisabled ? '' : ', tap to change'}`}
          accessibilityState={{ disabled: roleDisabled }}
          disabled={roleDisabled}
          onPress={() => roleRef.current?.present()}
          style={{
            borderWidth: 1,
            borderColor: LIGHT.border,
            borderRadius: 999,
            paddingHorizontal: 8,
            paddingVertical: 4,
            opacity: roleDisabled ? 0.6 : 1,
          }}
        >
          <Text
            style={{
              color: LIGHT.text,
              fontSize: 10,
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {member.role}
          </Text>
        </Pressable>
        {canRemove && !isSelf ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${member.name ?? member.email}`}
            onPress={onRemove}
            style={{
              borderWidth: 1,
              borderColor: LIGHT.border,
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 4,
            }}
          >
            <Text
              style={{
                color: LIGHT.negative,
                fontSize: 10,
                fontWeight: '700',
                textTransform: 'uppercase',
              }}
            >
              Remove
            </Text>
          </Pressable>
        ) : null}
      </View>

      <RoleChangeSheet
        ref={roleRef}
        householdId={householdId}
        userId={member.userId}
        currentRole={member.role}
      />
    </>
  );
}
