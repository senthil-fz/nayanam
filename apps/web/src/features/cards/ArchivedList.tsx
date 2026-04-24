// Dimmed list of archived accounts with a Restore button each.

import type { Account } from '@nayanam/core';
import { formatMoney } from '@nayanam/core';
import { useRestoreAccount } from '../../lib/hooks';

function RestoreButton({ id }: { id: string }) {
  const restore = useRestoreAccount(id);
  return (
    <button
      onClick={() => restore.mutate({})}
      disabled={restore.isPending}
      className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-medium hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-60"
    >
      {restore.isPending ? 'Restoring…' : 'Restore'}
    </button>
  );
}

export function ArchivedList({ accounts }: { accounts: Account[] }) {
  if (!accounts.length) {
    return (
      <p className="mt-4 text-center text-sm text-[var(--color-text-dim)]">
        No archived accounts.
      </p>
    );
  }
  return (
    <ul className="mt-4 space-y-2">
      {accounts.map((a) => (
        <li
          key={a.id}
          className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 opacity-70"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{a.nickname}</div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
              {a.type} · {formatMoney(a.cachedBalanceMinor, a.currencyCode)}
            </div>
          </div>
          <RestoreButton id={a.id} />
        </li>
      ))}
    </ul>
  );
}
