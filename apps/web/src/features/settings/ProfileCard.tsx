// Profile hero card — avatar, display name, email, edit + change-email CTAs.

import { useState } from 'react';
import { useMe } from '../../lib/hooks';
import { Avatar, SectionGroup, SettingsRow } from './primitives';
import { EditProfileDialog } from './EditProfileDialog';
import { ChangeEmailDialog } from './ChangeEmailDialog';
import { AvatarUploader } from './AvatarUploader';

export function ProfileCard() {
  const me = useMe();
  const [editing, setEditing] = useState(false);
  const [changingEmail, setChangingEmail] = useState(false);
  const [changingAvatar, setChangingAvatar] = useState(false);

  const user = me.data?.user;
  const primaryCurrency =
    me.data?.primaryCurrencyCode ?? user?.primaryCurrencyCode ?? '—';

  return (
    <>
      <SectionGroup title="Profile">
        <div className="flex items-center gap-4 px-4 py-4">
          <button
            type="button"
            onClick={() => setChangingAvatar(true)}
            aria-label="Change avatar"
            className="rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          >
            <Avatar name={user?.name ?? user?.email} size={56} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold text-[var(--color-text)]">
              {user?.name ?? user?.email ?? '—'}
            </div>
            {user?.name ? (
              <div className="truncate text-xs text-[var(--color-text-dim)]">
                {user.email}
              </div>
            ) : null}
            <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
              {primaryCurrency}
            </div>
          </div>
        </div>
        <SettingsRow
          label="Edit profile"
          sub="Name and primary currency"
          onClick={() => setEditing(true)}
        />
        <SettingsRow
          label="Change email"
          sub={user?.email ?? undefined}
          onClick={() => setChangingEmail(true)}
        />
      </SectionGroup>

      <EditProfileDialog open={editing} onClose={() => setEditing(false)} />
      <ChangeEmailDialog
        open={changingEmail}
        onClose={() => setChangingEmail(false)}
      />
      {user ? (
        <AvatarUploader
          open={changingAvatar}
          onClose={() => setChangingAvatar(false)}
          userId={user.id}
        />
      ) : null}
    </>
  );
}
