// /cards — stacked-deck Cards screen (Phase 2).

import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { Plus, ArrowUpDown, Archive } from 'lucide-react';
import type { Account } from '@nayanam/core';
import { useAccounts } from '../lib/hooks';
import { useAuthStore } from '../lib/api';
import { AppShell } from '../components/AppShell';
import { CardDeck } from '../features/cards/CardDeck';
import { SelectedCardSummary } from '../features/cards/SelectedCardSummary';
import { QuickActions } from '../features/cards/QuickActions';
import { AddAccountDialog } from '../features/cards/AddAccountDialog';
import { EditAccountDialog } from '../features/cards/EditAccountDialog';
import { EmptyState } from '../features/cards/EmptyState';
import { ArchivedList } from '../features/cards/ArchivedList';
import { ReorderMode } from '../features/cards/ReorderMode';

export const Route = createFileRoute('/cards')({
  component: CardsScreen,
});

function CardsScreen() {
  const activeHouseholdId = useAuthStore((s) => s.activeHouseholdId);
  const households = useAuthStore((s) => s.households);
  const activeHousehold = households.find((h) => h.id === activeHouseholdId);
  const defaultCurrency = activeHousehold?.defaultCurrencyCode ?? 'USD';

  const [showArchived, setShowArchived] = useState(false);
  const query = useAccounts({ includeArchived: showArchived });
  const allAccounts: Account[] = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );
  const active = allAccounts.filter((a) => !a.archivedAt);
  const archived = allAccounts.filter((a) => !!a.archivedAt);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const clampedIndex = Math.min(selectedIndex, Math.max(active.length - 1, 0));
  const selected = active[clampedIndex];

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);

  return (
    <AppShell
      right={
        <button
          onClick={() => setAddOpen(true)}
          aria-label="Add account"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        >
          <Plus size={18} />
        </button>
      }
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cards</h1>
          <p className="text-xs text-[var(--color-text-dim)]">
            {active.length} active{archived.length > 0 ? ` · ${archived.length} archived` : ''}
          </p>
        </div>
        {active.length > 1 && !reorderOpen ? (
          <button
            onClick={() => setReorderOpen(true)}
            aria-label="Reorder cards"
            className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            <ArrowUpDown size={12} />
            Reorder
          </button>
        ) : null}
      </div>

      {query.isLoading ? (
        <DeckSkeleton />
      ) : query.isError ? (
        <p className="text-sm text-[var(--color-negative)]">
          Couldn&apos;t load accounts. Please try again.
        </p>
      ) : active.length === 0 && archived.length === 0 ? (
        <EmptyState onAdd={() => setAddOpen(true)} />
      ) : reorderOpen ? (
        <ReorderMode accounts={active} onExit={() => setReorderOpen(false)} />
      ) : (
        <>
          {active.length > 0 ? (
            <>
              <CardDeck
                accounts={active}
                selectedIndex={clampedIndex}
                onSelect={setSelectedIndex}
              />
              {selected ? <SelectedCardSummary account={selected} /> : null}
              <QuickActions onManage={() => setEditOpen(true)} />
            </>
          ) : (
            <EmptyState onAdd={() => setAddOpen(true)} />
          )}

          <div className="mt-10 flex items-center justify-between">
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            >
              <Archive size={12} />
              {showArchived ? 'Hide archived' : 'Show archived'}
            </button>
          </div>
          {showArchived ? <ArchivedList accounts={archived} /> : null}
        </>
      )}

      <AddAccountDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultCurrencyCode={defaultCurrency}
      />
      {selected ? (
        <EditAccountDialog
          open={editOpen}
          account={selected}
          onClose={() => setEditOpen(false)}
        />
      ) : null}
    </AppShell>
  );
}

function DeckSkeleton() {
  return (
    <div
      aria-hidden
      className="mx-auto h-[210px] w-full max-w-[360px] animate-pulse rounded-[24px] bg-[var(--color-border)]"
    />
  );
}
