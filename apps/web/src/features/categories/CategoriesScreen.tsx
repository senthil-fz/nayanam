// Category manager — tabs for INCOME / EXPENSE, system rows read-only,
// household rows support edit / archive / reorder.

import { useMemo, useState } from 'react';
import { Archive, ArrowUpDown, Pencil, Plus } from 'lucide-react';
import type { Category } from '@nayanam/core';
import { useArchiveCategory, useCategories } from '../../lib/hooks';
import { CategoryIconChip } from './CategoryIconChip';
import { AddCategoryDialog } from './AddCategoryDialog';
import { EditCategoryDialog } from './EditCategoryDialog';
import { ReorderCategoriesMode } from './ReorderCategoriesMode';
import { ArchivedCategoriesList } from './ArchivedCategoriesList';

type Tab = 'EXPENSE' | 'INCOME';

export function CategoriesScreen() {
  const [tab, setTab] = useState<Tab>('EXPENSE');
  const [showArchived, setShowArchived] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Category | null>(null);

  const activeQuery = useCategories({ type: tab, includeArchived: false });
  const archivedQuery = useCategories({ type: tab, includeArchived: true });

  const active: Category[] = useMemo(
    () => activeQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [activeQuery.data],
  );
  const withArchived: Category[] = useMemo(
    () => archivedQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [archivedQuery.data],
  );
  const archived = useMemo(
    () => withArchived.filter((c) => c.archivedAt),
    [withArchived],
  );

  const systemRows = active.filter((c) => c.isSystem);
  const householdRows = active.filter((c) => !c.isSystem);

  const canReorder = householdRows.length > 1 && !reorderMode;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
          <p className="text-xs text-[var(--color-text-dim)]">
            {systemRows.length} system · {householdRows.length} custom
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canReorder ? (
            <button
              type="button"
              onClick={() => setReorderMode(true)}
              className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              <ArrowUpDown size={12} />
              Reorder
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            aria-label="Add category"
            className="flex h-9 items-center gap-1 rounded-full bg-[var(--color-accent)] px-3 text-sm font-medium text-white"
          >
            <Plus size={14} />
            New
          </button>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Category type"
        className="mb-4 flex gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-1"
      >
        {(['EXPENSE', 'INCOME'] as const).map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => {
                setTab(t);
                setReorderMode(false);
              }}
              className={
                'flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ' +
                (active
                  ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm'
                  : 'text-[var(--color-text-dim)] hover:text-[var(--color-text)]')
              }
            >
              {t === 'EXPENSE' ? 'Expenses' : 'Income'}
            </button>
          );
        })}
      </div>

      {activeQuery.isLoading ? (
        <ListSkeleton />
      ) : activeQuery.isError ? (
        <p className="text-sm text-[var(--color-negative)]">
          Couldn&apos;t load categories. Please try again.
        </p>
      ) : reorderMode ? (
        <ReorderCategoriesMode
          categories={active}
          onExit={() => setReorderMode(false)}
        />
      ) : (
        <>
          <Section title="System">
            <ul className="flex flex-col gap-1">
              {systemRows.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 rounded-[var(--radius-md)] px-2 py-2"
                >
                  <CategoryIconChip
                    colorToken={c.colorToken}
                    iconToken={c.iconToken}
                  />
                  <span className="flex-1 truncate text-sm font-medium">{c.label}</span>
                  <span className="rounded-full bg-[var(--color-surface-alt)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--color-text-dim)]">
                    system
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Custom">
            {householdRows.length === 0 ? (
              <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-3 text-xs text-[var(--color-text-dim)]">
                You haven&apos;t added any custom categories yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {householdRows.map((c) => (
                  <HouseholdRow
                    key={c.id}
                    category={c}
                    onEdit={() => setEditTarget(c)}
                  />
                ))}
              </ul>
            )}
          </Section>

          <div className="mt-8 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            >
              <Archive size={12} />
              {showArchived ? 'Hide archived' : 'Show archived'}
              {archived.length > 0 ? ` (${archived.length})` : ''}
            </button>
          </div>
          {showArchived ? (
            <div className="mt-3">
              <ArchivedCategoriesList categories={archived} />
            </div>
          ) : null}
        </>
      )}

      <AddCategoryDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultType={tab}
      />
      {editTarget ? (
        <EditCategoryDialog
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          category={editTarget}
        />
      ) : null}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4 first:mt-0">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
        {title}
      </div>
      {children}
    </section>
  );
}

function HouseholdRow({
  category,
  onEdit,
}: {
  category: Category;
  onEdit: () => void;
}) {
  const archive = useArchiveCategory(category.id);
  return (
    <li className="group flex items-center gap-3 rounded-[var(--radius-md)] px-2 py-2 hover:bg-[var(--color-surface-alt)]">
      <CategoryIconChip colorToken={category.colorToken} iconToken={category.iconToken} />
      <span className="flex-1 truncate text-sm font-medium">{category.label}</span>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${category.label}`}
        className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-dim)] hover:bg-[var(--color-border)] hover:text-[var(--color-text)]"
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        onClick={() => archive.mutate({})}
        disabled={archive.isPending}
        aria-label={`Archive ${category.label}`}
        className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-dim)] hover:bg-[var(--color-border)] hover:text-[var(--color-negative)]"
      >
        <Archive size={14} />
      </button>
    </li>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-[var(--radius-md)] px-2 py-2"
        >
          <div className="h-9 w-9 animate-pulse rounded-full bg-[var(--color-border)]" />
          <div className="h-3 w-32 animate-pulse rounded bg-[var(--color-border)]" />
        </div>
      ))}
    </div>
  );
}
