// Empty state shown when the household has zero accounts.

import { Wallet } from 'lucide-react';

type Props = { onAdd: () => void };

export function EmptyState({ onAdd }: Props) {
  return (
    <div className="mx-auto mt-12 flex max-w-xs flex-col items-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
        <Wallet size={28} />
      </div>
      <h3 className="mt-4 text-lg font-semibold tracking-tight">No accounts yet</h3>
      <p className="mt-1 text-sm text-[var(--color-text-dim)]">
        Add your first account to start tracking your balance.
      </p>
      <button
        onClick={onAdd}
        className="mt-6 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-5 py-2 text-sm font-medium text-white"
      >
        Add account
      </button>
    </div>
  );
}
