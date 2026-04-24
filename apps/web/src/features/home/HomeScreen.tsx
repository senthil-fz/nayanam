// Home orchestrator — composes header, hero, quick actions, budget placeholder,
// and recent activity. Owns the open/close state for the Phase 3 dialogs.

import { useMemo, useState } from 'react';
import type { Account, Category } from '@nayanam/core';
import { useAccounts, useCategories, useHouseholds, useMe } from '../../lib/hooks';
import { useAuthStore } from '../../lib/api';
import { AddTransactionDialog } from '../transactions/AddTransactionDialog';
import { TransferDialog } from '../transactions/TransferDialog';
import { AddAccountDialog } from '../cards/AddAccountDialog';
import { HomeHeader } from './HomeHeader';
import { BalanceHero } from './BalanceHero';
import { QuickActionsGrid } from './QuickActionsGrid';
import { BudgetsWidget } from './BudgetsWidget';
import { RecentActivity } from './RecentActivity';

export function HomeScreen() {
  const me = useMe();
  const { data: householdsData } = useHouseholds();
  const activeId = useAuthStore((s) => s.activeHouseholdId);
  const accountsQuery = useAccounts({ includeArchived: true });
  const categoriesQuery = useCategories({ includeArchived: true });

  const accounts: Account[] = useMemo(
    () => accountsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [accountsQuery.data],
  );
  const categories: Category[] = useMemo(
    () => categoriesQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [categoriesQuery.data],
  );

  const households = householdsData ?? me.data?.households ?? [];
  const activeHousehold =
    households.find((h) => h.id === activeId) ?? households[0];

  const role = activeHousehold?.role;
  const canMutate = role !== 'VIEWER';
  const hasAccounts = accounts.some((a) => !a.archivedAt);
  const lockReason = !canMutate
    ? 'Viewers cannot create transactions.'
    : !hasAccounts
      ? 'Add an account first.'
      : undefined;
  const canOpenTransactionDialogs = canMutate && hasAccounts;

  const [addOpen, setAddOpen] = useState(false);
  const [addPrefillType, setAddPrefillType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [transferOpen, setTransferOpen] = useState(false);
  const [addAccountOpen, setAddAccountOpen] = useState(false);

  const openAdd = (type: 'EXPENSE' | 'INCOME') => {
    if (!canOpenTransactionDialogs) return;
    setAddPrefillType(type);
    setAddOpen(true);
  };

  const openTransfer = () => {
    if (!canOpenTransactionDialogs) return;
    setTransferOpen(true);
  };

  return (
    <div className="flex flex-col gap-5">
      <HomeHeader me={me.data} />
      <BalanceHero activeHousehold={activeHousehold} />

      {!hasAccounts && canMutate ? (
        <button
          type="button"
          onClick={() => setAddAccountOpen(true)}
          className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white"
        >
          Add your first account
        </button>
      ) : null}

      <QuickActionsGrid
        canMutate={canOpenTransactionDialogs}
        lockReason={lockReason}
        onAddExpense={() => openAdd('EXPENSE')}
        onAddIncome={() => openAdd('INCOME')}
        onTransfer={openTransfer}
      />

      <BudgetsWidget activeHousehold={activeHousehold} canMutate={canMutate} />

      <RecentActivity
        accounts={accounts}
        categories={categories}
        onAddFirst={() => openAdd('EXPENSE')}
      />

      <AddTransactionDialog
        key={`home-add-${addPrefillType}`}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        accounts={accounts}
        categories={categories}
        prefill={{ type: addPrefillType }}
      />
      <TransferDialog
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        accounts={accounts}
      />
      <AddAccountDialog
        open={addAccountOpen}
        onClose={() => setAddAccountOpen(false)}
        defaultCurrencyCode={
          activeHousehold?.defaultCurrencyCode ?? me.data?.user.primaryCurrencyCode ?? 'USD'
        }
      />
    </div>
  );
}
