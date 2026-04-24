// Drag-reorderable list of active budgets + a collapsible archived section.

import { useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type {
  Budget,
  BudgetsStatusItemType,
  Category,
} from '@nayanam/core';
import { useReorderBudgets } from '../../lib/hooks';
import { BudgetRow } from './BudgetRow';

type Props = {
  budgets: Budget[];
  statusByBudgetId: Map<string, BudgetsStatusItemType>;
  categoriesById: Map<string, Category>;
  canMutate: boolean;
  canArchive: boolean;
  canReorder: boolean;
  redactAmounts: boolean;
  onOpen: (budget: Budget) => void;
  onEdit: (budget: Budget) => void;
  onPauseResume: (budget: Budget) => void;
  onArchive: (budget: Budget) => void;
  onRestore: (budget: Budget) => void;
};

export function BudgetsList({
  budgets,
  statusByBudgetId,
  categoriesById,
  canMutate,
  canArchive,
  canReorder,
  redactAmounts,
  onOpen,
  onEdit,
  onPauseResume,
  onArchive,
  onRestore,
}: Props) {
  const active = useMemo(
    () => budgets.filter((b) => !b.archivedAt),
    [budgets],
  );
  const archived = useMemo(
    () => budgets.filter((b) => Boolean(b.archivedAt)),
    [budgets],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Local optimistic order so drag-reorder feels instant; on drop we persist.
  const [order, setOrder] = useState<string[] | null>(null);
  const effectiveOrder = order ?? active.map((b) => b.id);
  // Re-sync if upstream list identity changes.
  const upstreamKey = active.map((b) => b.id).join('|');
  const [syncedKey, setSyncedKey] = useState(upstreamKey);
  if (syncedKey !== upstreamKey) {
    setSyncedKey(upstreamKey);
    setOrder(null);
  }

  const reorder = useReorderBudgets();

  const onDragEnd = (e: DragEndEvent) => {
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    const current = effectiveOrder;
    const oldIdx = current.indexOf(String(a.id));
    const newIdx = current.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(current, oldIdx, newIdx);
    setOrder(next);
    reorder.mutate({
      order: next.map((id, idx) => ({ id, displayOrder: idx })),
    });
  };

  const byId = new Map(active.map((b) => [b.id, b]));

  const [showArchived, setShowArchived] = useState(false);

  return (
    <div className="space-y-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={effectiveOrder}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {effectiveOrder.map((id) => {
              const b = byId.get(id);
              if (!b) return null;
              return (
                <BudgetRow
                  key={id}
                  budget={b}
                  status={statusByBudgetId.get(id)}
                  category={b.categoryId ? categoriesById.get(b.categoryId) : undefined}
                  canMutate={canMutate}
                  canArchive={canArchive}
                  canReorder={canReorder}
                  redactAmounts={redactAmounts}
                  onOpen={onOpen}
                  onEdit={onEdit}
                  onPauseResume={onPauseResume}
                  onArchive={onArchive}
                  onRestore={onRestore}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {archived.length > 0 ? (
        <div>
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="text-xs font-medium text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
          </button>
          {showArchived ? (
            <div className="mt-2 space-y-2">
              {archived.map((b) => (
                <BudgetRow
                  key={b.id}
                  budget={b}
                  status={statusByBudgetId.get(b.id)}
                  category={b.categoryId ? categoriesById.get(b.categoryId) : undefined}
                  canMutate={canMutate}
                  canArchive={canArchive}
                  canReorder={false}
                  redactAmounts={redactAmounts}
                  onOpen={onOpen}
                  onEdit={onEdit}
                  onPauseResume={onPauseResume}
                  onArchive={onArchive}
                  onRestore={onRestore}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
