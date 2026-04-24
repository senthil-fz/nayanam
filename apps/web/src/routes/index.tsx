import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useAuthStore } from '../lib/api';
import {
  useAccounts,
  useAccountsSummary,
  useCategories,
  useCreateHousehold,
  useHouseholds,
  useLogout,
  useMe,
  useTransactions,
} from '../lib/hooks';
import { formatMoney, type Account, type Category, type Transaction } from '@nayanam/core';
import { AppShell } from '../components/AppShell';
import { TransactionList } from '../features/transactions/TransactionList';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  const me = useMe();
  const { data: households } = useHouseholds();
  const activeId = useAuthStore((s) => s.activeHouseholdId);
  const setActive = useAuthStore((s) => s.setActiveHousehold);
  const logout = useLogout();
  const createHousehold = useCreateHousehold();
  const summary = useAccountsSummary();
  const accountsQuery = useAccounts({ includeArchived: true });
  const categoriesQuery = useCategories({ includeArchived: true });
  const recentQuery = useTransactions({ limit: 8 });
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  const recent: Transaction[] = useMemo(
    () => recentQuery.data?.pages[0]?.items.slice(0, 8) ?? [],
    [recentQuery.data],
  );
  const accounts: Account[] = useMemo(
    () => accountsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [accountsQuery.data],
  );
  const categories: Category[] = useMemo(
    () => categoriesQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [categoriesQuery.data],
  );
  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const activeHousehold =
    (households ?? me.data?.households ?? []).find((h) => h.id === activeId) ??
    (households ?? me.data?.households ?? [])[0];

  return (
    <AppShell
      right={
        <button
          onClick={() => logout.mutate()}
          className="text-sm opacity-70 hover:opacity-100"
        >
          Sign out
        </button>
      }
    >
      {/* Balance hero — summed across active accounts per currency */}
      <section className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
          Total balance
        </div>
        {summary.isLoading ? (
          <div className="mt-2 h-8 w-48 animate-pulse rounded-md bg-[var(--color-border)]" />
        ) : summary.isError ? (
          <div className="mt-2 text-sm text-[var(--color-negative)]">
            Couldn&apos;t load balances.
          </div>
        ) : !summary.data || summary.data.byCurrency.length === 0 ? (
          <div className="mt-2">
            <div className="text-3xl font-semibold tracking-tight">—</div>
            <p className="mt-2 text-sm text-[var(--color-text-dim)]">
              Add an account to see your balance here.
            </p>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {summary.data.byCurrency.map((b, i) => (
              <span key={b.currencyCode} className="flex items-baseline gap-3">
                {i > 0 ? (
                  <span className="text-[var(--color-text-faint)]">·</span>
                ) : null}
                <span className="text-3xl font-semibold tracking-tight">
                  {formatMoney(b.totalMinor, b.currencyCode).replace('-', '–')}
                </span>
              </span>
            ))}
          </div>
        )}
        <p className="mt-3 text-sm text-[var(--color-text-dim)]">
          {summary.data?.totalAccounts
            ? `Across ${summary.data.totalAccounts} account${summary.data.totalAccounts > 1 ? 's' : ''}.`
            : me.data?.user?.name
              ? `Welcome back, ${me.data.user.name}.`
              : `Welcome, ${me.data?.user?.email ?? '...'}.`}
        </p>
      </section>

      {/* Household switcher — kept minimal; Settings will host the full UI later */}
      <section className="mt-6 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
          Active household
        </div>
        <div className="flex flex-wrap gap-2">
          {(households ?? []).map((h) => (
            <button
              key={h.id}
              onClick={() => setActive(h.id)}
              className={
                'rounded-full px-3 py-1 text-sm border ' +
                (h.id === activeHousehold?.id
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                  : 'border-[var(--color-border)] opacity-80 hover:opacity-100')
              }
            >
              {h.name}
              <span className="ml-2 font-mono text-[10px] opacity-60">{h.role}</span>
            </button>
          ))}
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="rounded-full border border-dashed border-[var(--color-border)] px-3 py-1 text-sm opacity-70 hover:opacity-100"
          >
            + New household
          </button>
        </div>
        {showCreate && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newName.trim()) return;
              createHousehold.mutate(
                { name: newName.trim() },
                {
                  onSuccess: (hh) => {
                    setActive(hh.id);
                    setNewName('');
                    setShowCreate(false);
                  },
                },
              );
            }}
            className="mt-3 flex gap-2"
          >
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Household name"
              className="flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
            />
            <button
              type="submit"
              disabled={createHousehold.isPending}
              className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              Create
            </button>
          </form>
        )}
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
            Recent activity
          </div>
          <Link
            to="/transactions"
            className="text-xs font-medium text-[var(--color-accent)] hover:underline"
          >
            See all
          </Link>
        </div>
        {recentQuery.isError ? (
          <p className="text-sm text-[var(--color-negative)]">
            Couldn&apos;t load recent activity.
          </p>
        ) : recent.length === 0 && !recentQuery.isLoading ? (
          <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-text-dim)]">
            No transactions yet. <Link to="/transactions" className="underline">Record one</Link> to see it here.
          </p>
        ) : (
          <TransactionList
            transactions={recent}
            accountsById={accountsById}
            categoriesById={categoriesById}
            isLoading={recentQuery.isLoading}
            compact
          />
        )}
      </section>
    </AppShell>
  );
}
