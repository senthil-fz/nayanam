// /settings/budgets — orchestrator. Header + suggestions row + list of
// budgets. Owns dialog state. Pulls status + list in parallel.

import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import type {
  Budget,
  BudgetsStatusItemType,
  Category,
} from '@nayanam/core';
import {
  useArchiveBudget,
  useBudgets,
  useBudgetsStatus,
  useCategories,
  useHouseholds,
  useMe,
  usePauseBudget,
  useResumeBudget,
  useRestoreBudget,
} from '../../lib/hooks';
import { useAuthStore, useHomeStore } from '../../lib/api';
import { AddBudgetDialog } from './AddBudgetDialog';
import { EditBudgetDialog } from './EditBudgetDialog';
import { BudgetsList } from './BudgetsList';
import { BudgetsSuggestionsRow } from './BudgetsSuggestionsRow';
import { BudgetDetailSheet } from './BudgetDetailSheet';
import type { BudgetFormValues } from './BudgetForm';

type Props = {
  autoOpenAdd?: boolean;
};

export function BudgetsScreen({ autoOpenAdd }: Props) {
  const me = useMe();
  const { data: householdsData } = useHouseholds();
  const activeId = useAuthStore((s) => s.activeHouseholdId);
  const households = householdsData ?? me.data?.households ?? [];
  const activeHousehold =
    households.find((h) => h.id === activeId) ?? households[0];

  const role = activeHousehold?.role;
  const canMutate = role === 'OWNER' || role === 'ADMIN' || role === 'MEMBER';
  const canArchive = role === 'OWNER' || role === 'ADMIN';
  const canReorder = canArchive;

  const balancesHidden = useHomeStore((s) => s.balancesHidden);
  const defaultCurrencyCode =
    activeHousehold?.defaultCurrencyCode ??
    me.data?.user.primaryCurrencyCode ??
    'USD';

  const budgetsQuery = useBudgets({ includeArchived: true });
  const statusQuery = useBudgetsStatus({ includeArchived: true });
  const categoriesQuery = useCategories({ includeArchived: true });

  const pauseBudget = usePauseBudget();
  const resumeBudget = useResumeBudget();
  const archiveBudget = useArchiveBudget();
  const restoreBudget = useRestoreBudget();

  const budgets: Budget[] = useMemo(
    () => budgetsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [budgetsQuery.data],
  );
  const categories: Category[] = useMemo(
    () => categoriesQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [categoriesQuery.data],
  );
  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const statusByBudgetId = useMemo(() => {
    const m = new Map<string, BudgetsStatusItemType>();
    for (const item of statusQuery.data?.items ?? []) {
      m.set(item.budget.id, item);
    }
    return m;
  }, [statusQuery.data]);

  // Category ids with an active, non-archived, non-paused budget in the
  // default currency — used to filter the "new budget" picker so the user
  // can't create duplicates. (Backend will reject via BUDGET_ALREADY_EXISTS
  // either way; this is a UX courtesy.)
  const occupiedCategoryIds = useMemo(() => {
    const s = new Set<string>();
    for (const b of budgets) {
      if (b.scope !== 'CATEGORY') continue;
      if (b.archivedAt) continue;
      if (!b.categoryId) continue;
      if (b.currencyCode !== defaultCurrencyCode) continue;
      s.add(b.categoryId);
    }
    return s;
  }, [budgets, defaultCurrencyCode]);

  const [addOpen, setAddOpen] = useState(Boolean(autoOpenAdd));
  const [addPrefill, setAddPrefill] = useState<Partial<BudgetFormValues> | undefined>(
    undefined,
  );
  const [editTarget, setEditTarget] = useState<Budget | null>(null);
  const [detailTarget, setDetailTarget] = useState<Budget | null>(null);

  const openAdd = (prefill?: Partial<BudgetFormValues>) => {
    setAddPrefill(prefill);
    setAddOpen(true);
  };

  const handlePauseResume = (b: Budget) => {
    if (b.status === 'PAUSED') resumeBudget.mutate({ budgetId: b.id });
    else pauseBudget.mutate({ budgetId: b.id });
  };

  const handleArchive = (b: Budget) => {
    archiveBudget.mutate(
      { budgetId: b.id },
      {
        onSuccess: () => {
          if (detailTarget?.id === b.id) setDetailTarget(null);
        },
      },
    );
  };

  const handleRestore = (b: Budget) => {
    restoreBudget.mutate({ budgetId: b.id });
  };

  const isLoading =
    budgetsQuery.isLoading || categoriesQuery.isLoading || statusQuery.isLoading;

  const hasBudgets = budgets.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link
            to="/settings"
            className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Settings
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Budgets</h1>
          <p className="mt-1 text-xs text-[var(--color-text-dim)]">
            Set ceilings and get alerts when you&apos;re close.
          </p>
        </div>
        {canMutate ? (
          <button
            type="button"
            onClick={() => openAdd(undefined)}
            className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-[var(--color-accent)] px-3 text-sm font-medium text-white"
          >
            <Plus size={14} aria-hidden />
            Add
          </button>
        ) : null}
      </div>

      {budgetsQuery.isError || statusQuery.isError ? (
        <p className="text-sm text-[var(--color-negative)]">
          Couldn&apos;t load budgets. Please try again.
        </p>
      ) : isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              aria-busy="true"
              className="h-[96px] animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface-alt)]"
            />
          ))}
        </div>
      ) : !hasBudgets ? (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-8 text-center">
          <div className="text-base font-medium">No budgets yet</div>
          <p className="max-w-xs text-sm text-[var(--color-text-dim)]">
            Track spend against a ceiling and get notified at 50, 80, 100%.
          </p>
          {canMutate ? (
            <button
              type="button"
              onClick={() => openAdd(undefined)}
              className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white"
            >
              Add your first budget
            </button>
          ) : (
            <p className="text-xs text-[var(--color-text-dim)]">
              Ask an owner to add a budget.
            </p>
          )}
        </div>
      ) : (
        <>
          <BudgetsSuggestionsRow canMutate={canMutate} onPick={openAdd} />
          <BudgetsList
            budgets={budgets}
            statusByBudgetId={statusByBudgetId}
            categoriesById={categoriesById}
            canMutate={canMutate}
            canArchive={canArchive}
            canReorder={canReorder}
            redactAmounts={balancesHidden}
            onOpen={setDetailTarget}
            onEdit={setEditTarget}
            onPauseResume={handlePauseResume}
            onArchive={handleArchive}
            onRestore={handleRestore}
          />
        </>
      )}

      {addOpen ? (
        <AddBudgetDialog
          open
          onClose={() => {
            setAddOpen(false);
            setAddPrefill(undefined);
          }}
          categories={categories}
          occupiedCategoryIds={occupiedCategoryIds}
          defaultCurrencyCode={defaultCurrencyCode}
          prefill={addPrefill}
        />
      ) : null}

      {editTarget ? (
        <EditBudgetDialog
          key={editTarget.id}
          open
          onClose={() => setEditTarget(null)}
          budget={editTarget}
          categories={categories}
        />
      ) : null}

      {detailTarget ? (
        <BudgetDetailSheet
          key={detailTarget.id}
          open
          onClose={() => setDetailTarget(null)}
          budget={detailTarget}
          canMutate={canMutate}
          canArchive={canArchive}
          onEdit={() => {
            setEditTarget(detailTarget);
            setDetailTarget(null);
          }}
          onPauseResume={() => handlePauseResume(detailTarget)}
          onArchive={() => handleArchive(detailTarget)}
          onRestore={() => handleRestore(detailTarget)}
        />
      ) : null}
    </div>
  );
}
