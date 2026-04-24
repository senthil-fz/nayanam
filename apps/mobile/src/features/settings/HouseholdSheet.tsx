// Household card — renders inline in the Settings scroll (not in a sheet,
// since the row list is long). Keeps the "HouseholdSheet" filename per the
// spec's component map; the outer view is rendered inline but the edit /
// invite / role-change / leave / delete UIs are sheets.

import { useMemo, useRef } from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { ApiHousehold, ApiHouseholdRole } from '@nayanam/contracts';
import { LIGHT } from '@nayanam/ui-tokens';
import { apiClient, useAuthStore } from '../../lib/api';
import { useHouseholdMembers, useMePhase9 } from '../../lib/hooks';
import { Avatar, Row, Section, relativeTime } from './primitives';
import { MemberRow } from './MemberRow';
import {
  EditHouseholdSheet,
  type EditHouseholdSheetHandle,
} from './EditHouseholdSheet';
import {
  InviteMemberSheet,
  type InviteMemberSheetHandle,
} from './InviteMemberSheet';
import {
  LeaveHouseholdSheet,
  type LeaveHouseholdSheetHandle,
} from './LeaveHouseholdSheet';
import {
  DeleteHouseholdSheet,
  type DeleteHouseholdSheetHandle,
} from './DeleteHouseholdSheet';

export function HouseholdSheet() {
  const activeId = useAuthStore((s) => s.activeHouseholdId);
  const me = useMePhase9();
  const householdQ = useQuery<ApiHousehold>({
    queryKey: ['households', activeId],
    enabled: Boolean(activeId),
    queryFn: () => apiClient.getHousehold(activeId!),
  });
  const members = useHouseholdMembers(activeId ?? null);

  const editRef = useRef<EditHouseholdSheetHandle>(null);
  const inviteRef = useRef<InviteMemberSheetHandle>(null);
  const leaveRef = useRef<LeaveHouseholdSheetHandle>(null);
  const deleteRef = useRef<DeleteHouseholdSheetHandle>(null);

  const myRole: ApiHouseholdRole | null = useMemo(() => {
    const summaries = me.data?.households ?? [];
    return summaries.find((h) => h.id === activeId)?.role ?? null;
  }, [me.data, activeId]);

  const ownerCount = useMemo(
    () => (members.data ?? []).filter((m) => m.role === 'OWNER').length,
    [members.data],
  );

  if (!activeId) return null;
  const household = householdQ.data ?? null;
  const memberList = members.data ?? [];
  const isOwner = myRole === 'OWNER';
  const canEdit = isOwner || myRole === 'ADMIN';

  return (
    <>
      <Section title="Household">
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 14,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: LIGHT.border,
          }}
        >
          <Avatar name={household?.name ?? '?'} size={40} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{ fontSize: 14, fontWeight: '600', color: LIGHT.text }}
            >
              {household?.name ?? '…'}
            </Text>
            <Text style={{ fontSize: 11, color: LIGHT.textDim, marginTop: 1 }}>
              {household?.defaultCurrencyCode ?? ''}
              {myRole ? ` · ${myRole.toLowerCase()}` : ''}
            </Text>
          </View>
        </View>
        {canEdit ? (
          <Row
            label="Edit household"
            onPress={() => editRef.current?.present()}
          />
        ) : null}
        <Row
          label="Invite member"
          sub="By email"
          onPress={() => inviteRef.current?.present()}
        />
        <Row
          label="Leave household"
          destructive
          onPress={() => leaveRef.current?.present()}
          last={!isOwner}
        />
        {isOwner ? (
          <Row
            label="Delete household"
            destructive
            onPress={() => deleteRef.current?.present()}
            last
          />
        ) : null}
      </Section>

      <Section title="Members">
        {members.isLoading ? (
          <Text
            style={{
              paddingVertical: 20,
              textAlign: 'center',
              color: LIGHT.textDim,
              fontSize: 12,
            }}
          >
            Loading…
          </Text>
        ) : memberList.length === 0 ? (
          <Text
            style={{
              paddingVertical: 20,
              textAlign: 'center',
              color: LIGHT.textDim,
              fontSize: 12,
            }}
          >
            No members yet
          </Text>
        ) : (
          memberList.map((m, idx) => (
            <MemberRow
              key={m.id}
              member={m}
              householdId={activeId}
              isSelf={m.userId === me.data?.user.id}
              canManageRoles={isOwner}
              canRemove={isOwner}
              ownerCount={ownerCount}
              subline={
                m.lastSeenAt
                  ? `Last seen ${relativeTime(m.lastSeenAt)}`
                  : 'Never signed in'
              }
              last={idx === memberList.length - 1}
            />
          ))
        )}
      </Section>

      <EditHouseholdSheet ref={editRef} household={household} />
      <InviteMemberSheet ref={inviteRef} householdId={activeId} />
      <LeaveHouseholdSheet
        ref={leaveRef}
        householdId={activeId}
        myRole={myRole}
        ownerCount={ownerCount}
        memberCount={memberList.length}
      />
      <DeleteHouseholdSheet
        ref={deleteRef}
        householdId={activeId}
        householdName={household?.name ?? ''}
        memberCount={memberList.length}
      />
    </>
  );
}
