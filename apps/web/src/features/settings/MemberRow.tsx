// Single member row with role dropdown + remove button. Self row never shows
// a remove button; the sole OWNER can't demote themselves.

import { useState } from 'react';
import type { ApiHouseholdMember, ApiHouseholdRole } from '@nayanam/contracts';
import {
  useRemoveHouseholdMember,
  useUpdateHouseholdMemberRole,
} from '../../lib/hooks';
import { Avatar } from './primitives';
import { useToast } from '../../components/Toast';

const ROLES: ApiHouseholdRole[] = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'];

export function MemberRow({
  member,
  householdId,
  isSelf,
  canManageRoles,
  canRemove,
  ownerCount,
  subline,
}: {
  member: ApiHouseholdMember;
  householdId: string;
  isSelf: boolean;
  canManageRoles: boolean;
  canRemove: boolean;
  ownerCount: number;
  subline: string;
}) {
  const updateRole = useUpdateHouseholdMemberRole();
  const remove = useRemoveHouseholdMember();
  const toast = useToast();
  const [confirmRemove, setConfirmRemove] = useState(false);

  const soleOwnerSelf = isSelf && member.role === 'OWNER' && ownerCount === 1;
  const roleDisabled = !canManageRoles || soleOwnerSelf || updateRole.isPending;

  const onChangeRole = async (next: ApiHouseholdRole) => {
    if (next === member.role) return;
    try {
      await updateRole.mutateAsync({
        householdId,
        userId: member.userId,
        role: next,
      });
      toast.show(`Role changed to ${next.toLowerCase()}`);
    } catch (e) {
      toast.show(
        e instanceof Error ? e.message : 'Could not change role',
        { tone: 'negative' },
      );
    }
  };

  const onRemove = async () => {
    try {
      await remove.mutateAsync({ householdId, userId: member.userId });
      toast.show('Member removed');
      setConfirmRemove(false);
    } catch (e) {
      toast.show(
        e instanceof Error ? e.message : 'Could not remove member',
        { tone: 'negative' },
      );
    }
  };

  return (
    <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3 last:border-b-0">
      <Avatar name={member.name ?? member.email} size={36} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-[var(--color-text)]">
          {member.name ?? member.email}
          {isSelf ? (
            <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
              you
            </span>
          ) : null}
        </div>
        <div className="truncate text-xs text-[var(--color-text-dim)]">{subline}</div>
      </div>
      {canManageRoles ? (
        <label className="sr-only" htmlFor={`role-${member.id}`}>
          Role
        </label>
      ) : null}
      {canManageRoles ? (
        <select
          id={`role-${member.id}`}
          value={member.role}
          onChange={(e) => void onChangeRole(e.target.value as ApiHouseholdRole)}
          disabled={roleDisabled}
          className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text)] disabled:opacity-60"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      ) : (
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
          {member.role}
        </span>
      )}
      {canRemove && !isSelf ? (
        confirmRemove ? (
          <button
            type="button"
            onClick={() => void onRemove()}
            disabled={remove.isPending}
            className="rounded-full bg-[var(--color-negative)] px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
          >
            Confirm
          </button>
        ) : (
          <button
            type="button"
            aria-label={`Remove ${member.name ?? member.email}`}
            onClick={() => setConfirmRemove(true)}
            className="rounded-full border border-[var(--color-border)] px-2 py-1 text-[11px] font-semibold text-[var(--color-negative)]"
          >
            Remove
          </button>
        )
      ) : null}
    </div>
  );
}
