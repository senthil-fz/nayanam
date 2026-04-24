// /transactions — full list with filters, add, edit, transfer, delete.

import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import type { Account, Category, Transaction } from '@nayanam/core';
import { AppShell } from '../components/AppShell';
import { useAccounts, useCategories, useTransactions } from '../lib/hooks';
import { TransactionList } from '../features/transactions/TransactionList';
import { FiltersBar, type Filters } from '../features/transactions/FiltersBar';
import { AddTransactionDialog } from '../features/transactions/AddTransactionDialog';
import { EditTransactionDialog } from '../features/transactions/EditTransactionDialog';
import { TransferDialog } from '../features/transactions/TransferDialog';
import { DeleteTransactionConfirm } from '../features/transactions/DeleteTransactionConfirm';
import { minorStringToMajor } from '../features/cards/AccountForm';

export const Route = createFileRoute('/transactions')({
  component: TransactionsScreen,
});

function toIsoStartOfDay(date?: string): string | undefined {
  if (!date) return undefined;
  return new Date(`${date}T00:00:00`).toISOString();
}

function toIsoEndOfDay(date?: string): string | undefined {
  if (!date) return undefined;
  return new Date(`${date}T23:59:59.999`).toISOString();
}

function TransactionsScreen() {
  const accountsQuery = useAccounts({ includeArchived: true });
  const categoriesQuery = useCategories({ includeArchived: false });

  const accounts: Account[] = useMemo(
    () => accountsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [accountsQuery.data],
  );
  const categories: Category[] = useMemo(
    () => categoriesQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [categoriesQuery.data],
  );

  const [filters, setFilters] = useState<Filters>({
    type: 'ALL',
    accountIds: [],
    categoryIds: [],
    q: '',
  });

  const txQuery = useTransactions({
    accountId: filters.accountIds.length > 0 ? filters.accountIds : undefined,
    categoryId: filters.categoryIds.length > 0 ? filters.categoryIds : undefined,
    type: filters.type === 'ALL' ? undefined : filters.type,
    from: toIsoStartOfDay(filters.from),
    to: toIsoEndOfDay(filters.to),
    q: filters.q.trim() || undefined,
  });

  const transactions: Transaction[] = useMemo(
    () => txQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [txQuery.data],
  );

  const accountsById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );
  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const [addOpen, setAddOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addPrefill, setAddPrefill] = useState<
    { type?: 'INCOME' | 'EXPENSE' } | undefined
  >();
  const [transferOpen, setTransferOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Transaction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);

  const openAdd = (type?: 'INCOME' | 'EXPENSE') => {
    setAddPrefill(type ? { type } : undefined);
    setAddMenuOpen(false);
    setAddOpen(true);
  };

  const onDuplicate = (t: Transaction) => {
    if (t.type === 'TRANSFER') return;
    setAddPrefill({ type: t.type });
    // Use full prefill via a keyed remount: open dialog with the prefill
    setDuplicatePrefill({
      type: t.type,
      accountId: t.accountId,
      categoryId: t.categoryId,
      amountMajor: minorStringToMajor(t.amountMinor, t.currencyCode),
      note: t.note,
    });
    setAddOpen(true);
  };

  const [duplicatePrefill, setDuplicatePrefill] = useState<
    | {
        type?: 'INCOME' | 'EXPENSE';
        accountId?: string;
        categoryId?: string;
        amountMajor?: string;
        note?: string | null;
      }
    | undefined
  >();

  const isLoading =
    txQuery.isLoading || accountsQuery.isLoading || categoriesQuery.isLoading;
  const isError = txQuery.isError || accountsQuery.isError || categoriesQuery.isError;

  return (
    <AppShell
      right={
        <div className="relative">
          <button
            onClick={() => setAddMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={addMenuOpen}
            className="flex h-9 items-center gap-1 rounded-full bg-[var(--color-accent)] px-3 text-sm font-medium text-white"
          >
            <Plus size={14} />
            Add
            <ChevronDown size={12} />
          </button>
          {addMenuOpen ? (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-1 w-44 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-lg"
            >
              <MenuItem label="Add expense" onClick={() => openAdd('EXPENSE')} />
              <MenuItem label="Add income" onClick={() => openAdd('INCOME')} />
              <MenuItem
                label="Add transfer"
                onClick={() => {
                  setAddMenuOpen(false);
                  setTransferOpen(true);
                }}
              />
            </div>
          ) : null}
        </div>
      }
    >
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
        <p className="text-xs text-[var(--color-text-dim)]">
          {transactions.length} loaded
        </p>
      </div>

      <FiltersBar
        value={filters}
        onChange={setFilters}
        accounts={accounts}
        categories={categories}
      />

      <div className="mt-4">
        {isError ? (
          <p className="text-sm text-[var(--color-negative)]">
            Couldn&apos;t load transactions. Please try again.
          </p>
        ) : (
          <>
            <TransactionList
              transactions={transactions}
              accountsById={accountsById}
              categoriesById={categoriesById}
              onLoadMore={() => {
                if (txQuery.hasNextPage && !txQuery.isFetchingNextPage) {
                  void txQuery.fetchNextPage();
                }
              }}
              hasMore={txQuery.hasNextPage}
              isFetchingMore={txQuery.isFetchingNextPage}
              isLoading={isLoading}
              onEdit={(t) => setEditTarget(t)}
              onDuplicate={onDuplicate}
              onDelete={(t) => setDeleteTarget(t)}
            />
            {!isLoading && transactions.length === 0 ? (
              <EmptyState onAdd={() => openAdd('EXPENSE')} />
            ) : null}
          </>
        )}
      </div>

      <AddTransactionDialog
        key={duplicatePrefill ? 'duplicate' : addPrefill?.type ?? 'add'}
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setDuplicatePrefill(undefined);
        }}
        accounts={accounts}
        categories={categories}
        prefill={duplicatePrefill ?? addPrefill}
      />

      <TransferDialog
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        accounts={accounts}
      />

      {editTarget ? (
        <EditTransactionDialog
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          transaction={editTarget}
          accounts={accounts}
          categories={categories}
        />
      ) : null}

      <DeleteTransactionConfirm
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        transaction={deleteTarget}
      />
    </AppShell>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-alt)]"
    >
      {label}
    </button>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-8 text-center">
      <div className="text-base font-medium">No transactions yet</div>
      <p className="max-w-xs text-sm text-[var(--color-text-dim)]">
        Start by recording your first expense. You can filter, edit, and transfer
        between accounts from here.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-1 rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white"
      >
        Add your first transaction
      </button>
    </div>
  );
}
