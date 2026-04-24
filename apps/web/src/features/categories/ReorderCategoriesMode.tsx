// Reorder mode for household categories. Powered by @dnd-kit — pointer +
// keyboard sensors, so reordering is mouse, touch, AND keyboard accessible.
// Server normalizes displayOrder into a dense 0..N-1 array.

import { useMemo, useState } from 'react';
import { Check, GripVertical } from 'lucide-react';
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
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Category } from '@nayanam/core';
import { useReorderCategories } from '../../lib/hooks';
import { CategoryIconChip } from './CategoryIconChip';

function orderKey(items: { id: string }[]): string {
  return items.map((i) => i.id).join('|');
}

type Props = {
  categories: Category[];
  onExit: () => void;
};

export function ReorderCategoriesMode({ categories, onExit }: Props) {
  // Only household rows are reorderable.
  const reorderable = useMemo(
    () => categories.filter((c) => !c.isSystem && !c.archivedAt),
    [categories],
  );
  // Re-sync local order when the upstream list identity changes.
  const reorderableKey = orderKey(reorderable);
  const [syncedKey, setSyncedKey] = useState(reorderableKey);
  const [order, setOrder] = useState<string[]>(() => reorderable.map((c) => c.id));
  if (syncedKey !== reorderableKey) {
    setSyncedKey(reorderableKey);
    setOrder(reorderable.map((c) => c.id));
  }
  const reorder = useReorderCategories();

  const byId = new Map(reorderable.map((c) => [c.id, c]));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrder((prev) => {
      const oldIndex = prev.indexOf(String(active.id));
      const newIndex = prev.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const save = () => {
    reorder.mutate(
      {
        order: order.map((id, idx) => ({ id, displayOrder: idx })),
      },
      { onSuccess: () => onExit() },
    );
  };

  if (reorderable.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-text-dim)]">
        No custom categories to reorder yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--color-text-dim)]">
          Reorder your custom categories. System categories keep their order.
        </p>
        <button
          type="button"
          onClick={save}
          disabled={reorder.isPending}
          className="flex items-center gap-1 rounded-full bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
        >
          <Check size={12} />
          {reorder.isPending ? 'Saving…' : 'Done'}
        </button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-1">
            {order.map((id) => {
              const c = byId.get(id);
              if (!c) return null;
              return <SortableCategoryRow key={id} category={c} />;
            })}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableCategoryRow({ category }: { category: Category }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: category.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(
      transform ? { ...transform, scaleX: 1, scaleY: isDragging ? 1.02 : 1 } : null,
    ),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={
        'flex items-center gap-3 rounded-[var(--radius-md)] border bg-[var(--color-surface)] p-2 ' +
        (isDragging
          ? 'border-[var(--color-accent)] shadow-lg'
          : 'border-[var(--color-border)]')
      }
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${category.label}`}
        className="flex cursor-grab touch-none items-center justify-center rounded-[var(--radius-sm)] p-1 text-[var(--color-text-dim)] hover:bg-[var(--color-border)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] active:cursor-grabbing"
      >
        <GripVertical size={14} />
      </button>
      <CategoryIconChip colorToken={category.colorToken} iconToken={category.iconToken} />
      <span className="flex-1 truncate text-sm font-medium">{category.label}</span>
    </li>
  );
}
