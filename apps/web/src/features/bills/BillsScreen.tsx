// /bills — orchestrator. Matches prototype screen-bills.jsx layout:
//   header → totals card → 14-day timeline → filter chips → list.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type {
  Account,
  Bill,
  BillPayment,
  BillsListFilter,
  Category,
} from '@nayanam/core';
import {
  useAccounts,
  useBills,
  useBillsSummary,
  useBillsUpcoming,
  useCategories,
  useHouseholds,
  useMe,
  usePauseBill,
  useResumeBill,
  useArchiveBill,
} from '../../lib/hooks';
import { useAuthStore } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { BillsTotalsCard } from './BillsTotalsCard';
import { UpcomingTimeline } from './UpcomingTimeline';
import { BillsFilterChips } from './BillsFilterChips';
import { BillRow } from './BillRow';
import { AddBillDialog } from './AddBillDialog';
import { EditBillDialog } from './EditBillDialog';
import { MarkPaidDialog } from './MarkPaidDialog';
import { UndoPaymentDialog } from './UndoPaymentDialog';
import { BillDetailSheet } from './BillDetailSheet';

export function BillsScreen() {
  const me = useMe();
  const { data: householdsData } = useHouseholds();
  const activeId = useAuthStore((s) => s.activeHouseholdId);
  const households = householdsData ?? me.data?.households ?? [];
  const activeHousehold =
    households.find((h) => h.id === activeId) ?? households[0];

  const role = activeHousehold?.role;
  const canMutate = role === 'OWNER' || role === 'ADMIN' || role === 'MEMBER';
  const canArchive = role === 'OWNER' || role === 'ADMIN';

  const [filter, setFilter] = useState<BillsListFilter>('all');
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Bill | null>(null);
  const [markPaidTarget, setMarkPaidTarget] = useState<Bill | null>(null);
  const [detailTarget, setDetailTarget] = useState<Bill | null>(null);
  const [undoTarget, setUndoTarget] = useState<
    { bill: Bill; payment: BillPayment } | null
  >(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  const accountsQuery = useAccounts({ includeArchived: true });
  const categoriesQuery = useCategories({ includeArchived: true });
  const summaryQuery = useBillsSummary();
  const upcomingQuery = useBillsUpcoming(14);
  const billsQuery = useBills({ filter });

  const pauseBill = usePauseBill();
  const resumeBill = useResumeBill();
  const archiveBill = useArchiveBill();

  const accounts: Account[] = useMemo(
    () => accountsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [accountsQuery.data],
  );
  const categories: Category[] = useMemo(
    () => categoriesQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [categoriesQuery.data],
  );
  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const accountsById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  const bills: Bill[] = useMemo(
    () => billsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [billsQuery.data],
  );

  const filteredBills = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bills;
    return bills.filter((b) => b.name.toLowerCase().includes(q));
  }, [bills, query]);

  // Row refs for scrolling from timeline dot clicks.
  const rowRefs = useRef(new Map<string, HTMLElement | null>());
  const registerRow = (id: string) => (el: HTMLElement | null) => {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  };

  useEffect(() => {
    if (!flashId) return;
    const t = setTimeout(() => setFlashId(null), 1500);
    return () => clearTimeout(t);
  }, [flashId]);

  const handleTimelineDot = (billId: string) => {
    const el = rowRefs.current.get(billId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFlashId(billId);
    }
  };

  const handlePauseResume = (bill: Bill) => {
    if (bill.status === 'PAUSED') resumeBill.mutate({ billId: bill.id });
    else pauseBill.mutate({ billId: bill.id });
  };

  const handleArchive = (bill: Bill) => {
    archiveBill.mutate(
      { billId: bill.id },
      {
        onSuccess: () => {
          if (detailTarget?.id === bill.id) setDetailTarget(null);
        },
      },
    );
  };

  const primaryCurrencyCode =
    activeHousehold?.defaultCurrencyCode ??
    me.data?.user.primaryCurrencyCode ??
    undefined;

  const isLoadingList =
    billsQuery.isLoading || accountsQuery.isLoading || categoriesQuery.isLoading;

  return (
    <AppShell
      right={
        canMutate ? (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            aria-label="Add bill"
            className="flex h-9 items-center gap-1 rounded-full bg-[var(--color-accent)] px-3 text-sm font-medium text-white"
          >
            <Plus size={14} />
            Add
          </button>
        ) : null
      }
    >
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Bills &amp; subs</h1>
        <p className="text-xs text-[var(--color-text-dim)]">
          Track your recurring charges in one place.
        </p>
      </div>

      <div className="mb-4 flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
        <Search size={14} aria-hidden className="text-[var(--color-text-dim)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search bills"
          aria-label="Search bills"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-text-dim)]"
        />
      </div>

      <div className="space-y-3">
        <BillsTotalsCard
          summary={summaryQuery.data}
          isLoading={summaryQuery.isLoading}
          isError={summaryQuery.isError}
          primaryCurrencyCode={primaryCurrencyCode}
        />

        <UpcomingTimeline
          data={upcomingQuery.data}
          isLoading={upcomingQuery.isLoading}
          isError={upcomingQuery.isError}
          onDotClick={handleTimelineDot}
        />

        <BillsFilterChips value={filter} onChange={setFilter} />

        {billsQuery.isError ? (
          <p className="text-sm text-[var(--color-negative)]">
            Couldn&apos;t load bills. Please try again.
          </p>
        ) : isLoadingList ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                aria-busy="true"
                className="h-[72px] animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface-alt)]"
              />
            ))}
          </div>
        ) : filteredBills.length === 0 ? (
          <EmptyState
            hasQuery={query.trim().length > 0}
            canMutate={canMutate}
            onAdd={() => setAddOpen(true)}
          />
        ) : (
          <div className="space-y-2">
            {filteredBills.map((b) => (
              <BillRow
                key={b.id}
                bill={b}
                category={categoriesById.get(b.categoryId)}
                canMutate={canMutate}
                canArchive={canArchive}
                flash={flashId === b.id}
                registerRef={registerRow(b.id)}
                onOpen={setDetailTarget}
                onEdit={setEditTarget}
                onMarkPaid={setMarkPaidTarget}
                onPauseResume={handlePauseResume}
                onArchive={handleArchive}
              />
            ))}
            {billsQuery.hasNextPage ? (
              <button
                type="button"
                onClick={() => void billsQuery.fetchNextPage()}
                disabled={billsQuery.isFetchingNextPage}
                className="w-full rounded-full border border-[var(--color-border)] py-2 text-sm font-medium text-[var(--color-text-dim)] hover:bg-[var(--color-surface-alt)]"
              >
                {billsQuery.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            ) : null}
          </div>
        )}
      </div>

      <AddBillDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        accounts={accounts}
        categories={categories}
      />

      {editTarget ? (
        <EditBillDialog
          key={editTarget.id}
          open
          onClose={() => setEditTarget(null)}
          bill={editTarget}
          accounts={accounts}
          categories={categories}
        />
      ) : null}

      {markPaidTarget ? (
        <MarkPaidDialog
          key={markPaidTarget.id}
          open
          onClose={() => setMarkPaidTarget(null)}
          bill={markPaidTarget}
          accounts={accounts}
          categories={categories}
        />
      ) : null}

      {undoTarget ? (
        <UndoPaymentDialog
          key={undoTarget.payment.id}
          open
          onClose={() => setUndoTarget(null)}
          bill={undoTarget.bill}
          payment={undoTarget.payment}
        />
      ) : null}

      {detailTarget ? (
        <BillDetailSheet
          key={detailTarget.id}
          open
          onClose={() => setDetailTarget(null)}
          bill={detailTarget}
          account={accountsById.get(detailTarget.accountId)}
          category={categoriesById.get(detailTarget.categoryId)}
          canEdit={canMutate}
          canArchive={canArchive}
          onEdit={() => setEditTarget(detailTarget)}
          onPauseResume={() => handlePauseResume(detailTarget)}
          onArchive={() => handleArchive(detailTarget)}
          onMarkPaid={() => setMarkPaidTarget(detailTarget)}
          onUndoLastPayment={(payment) =>
            setUndoTarget({ bill: detailTarget, payment })
          }
        />
      ) : null}
    </AppShell>
  );
}

function EmptyState({
  hasQuery,
  canMutate,
  onAdd,
}: {
  hasQuery: boolean;
  canMutate: boolean;
  onAdd: () => void;
}) {
  if (hasQuery) {
    return (
      <div className="mt-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-6 text-center">
        <p className="text-sm text-[var(--color-text-dim)]">
          No bills match your search.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-4 flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-8 text-center">
      <div className="text-base font-medium">No bills yet</div>
      <p className="max-w-xs text-sm text-[var(--color-text-dim)]">
        Track your subscriptions in one place.
      </p>
      {canMutate ? (
        <button
          type="button"
          onClick={onAdd}
          className="mt-1 rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white"
        >
          Add your first bill
        </button>
      ) : null}
    </div>
  );
}
