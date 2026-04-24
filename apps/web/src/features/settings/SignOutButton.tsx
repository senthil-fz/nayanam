// Sign-out CTA with a confirm step. Upgrades the Phase 4 stub.

import { useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { useLogout } from '../../lib/hooks';

export function SignOutButton() {
  const [open, setOpen] = useState(false);
  const logout = useLogout();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-semibold text-[var(--color-negative)]"
      >
        Sign out
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Sign out" size="sm">
        <p className="text-sm text-[var(--color-text)]">
          You&rsquo;ll need to sign in again on this device.
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full px-4 py-2 text-sm font-medium text-[var(--color-text-dim)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="rounded-full bg-[var(--color-negative)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {logout.isPending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </Dialog>
    </>
  );
}
