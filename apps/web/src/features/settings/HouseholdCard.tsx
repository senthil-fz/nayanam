// Household card — header info + members list + invite/edit/leave/delete.
// Renders only when an active household is picked. OWNER gets role management
// + delete; OWNER/ADMIN get edit; any role can leave.

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ApiHousehold, ApiHouseholdMember, ApiHouseholdRole } from '@nayanam/contracts';
import { useAuthStore, apiClient } from '../../lib/api';
import { useHouseholdMembers, useMe } from '../../lib/hooks';
import { SectionGroup, SettingsRow, Avatar, relativeTime } from './primitives';
import { EditHouseholdDialog } from './EditHouseholdDialog';
import { InviteMemberDialog } from './InviteMemberDialog';
import { MemberRow } from './MemberRow';
import { LeaveHouseholdDialog } from './LeaveHouseholdDialog';
import { DeleteHouseholdDialog } from './DeleteHouseholdDialog';

export function HouseholdCard() {
  const activeId = useAuthStore((s) => s.activeHouseholdId);
  const me = useMe();
  const householdQ = useQuery<ApiHousehold>({
    queryKey: ['households', activeId],
    enabled: Boolean(activeId),
    queryFn: () => apiClient.getHousehold(activeId!),
  });
  const members = useHouseholdMembers(activeId ?? null);

  const [editOpen, setEditOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const myRole: ApiHouseholdRole | null = useMemo(() => {
    const summaries = me.data?.households ?? [];
    return summaries.find((h) => h.id === activeId)?.role ?? null;
  }, [me.data, activeId]);

  const isOwner = myRole === 'OWNER';
  const canEdit = myRole === 'OWNER' || myRole === 'ADMIN';

  const ownerCount = useMemo(
    () => (members.data ?? []).filter((m) => m.role === 'OWNER').length,
    [members.data],
  );

  if (!activeId) return null;

  const household = householdQ.data ?? null;

  return (
    <>
      <SectionGroup title="Household">
        <div className="flex items-center gap-3 px-4 py-4">
          <Avatar name={household?.name ?? '?'} size={44} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-[var(--color-text)]">
              {household?.name ?? '…'}
            </div>
            <div className="text-xs text-[var(--color-text-dim)]">
              {household?.defaultCurrencyCode ?? ''}
              {myRole ? ` · ${myRole.toLowerCase()}` : ''}
            </div>
          </div>
        </div>
        {canEdit ? (
          <SettingsRow label="Edit household" onClick={() => setEditOpen(true)} />
        ) : null}
        <SettingsRow
          label="Invite member"
          sub="By email"
          onClick={() => setInviteOpen(true)}
        />
        <SettingsRow
          label="Leave household"
          destructive
          onClick={() => setLeaveOpen(true)}
        />
        {isOwner ? (
          <SettingsRow
            label="Delete household"
            destructive
            onClick={() => setDeleteOpen(true)}
          />
        ) : null}
      </SectionGroup>

      <SectionGroup title="Members">
        {members.isLoading ? (
          <div className="px-4 py-6 text-center text-xs text-[var(--color-text-dim)]">
            Loading…
          </div>
        ) : (members.data ?? []).length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-[var(--color-text-dim)]">
            No members yet
          </div>
        ) : (
          (members.data ?? []).map((m: ApiHouseholdMember) => (
            <MemberRow
              key={m.id}
              member={m}
              householdId={activeId}
              isSelf={m.userId === me.data?.user.id}
              canManageRoles={isOwner}
              canRemove={isOwner}
              ownerCount={ownerCount}
              subline={
                m.lastSeenAt ? `Last seen ${relativeTime(m.lastSeenAt)}` : 'Never signed in'
              }
            />
          ))
        )}
      </SectionGroup>

      <EditHouseholdDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        household={household}
      />
      <InviteMemberDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        householdId={activeId}
      />
      <LeaveHouseholdDialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        householdId={activeId}
        myRole={myRole}
        ownerCount={ownerCount}
        memberCount={(members.data ?? []).length}
      />
      <DeleteHouseholdDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        householdId={activeId}
        householdName={household?.name ?? ''}
        memberCount={(members.data ?? []).length}
      />
    </>
  );
}
