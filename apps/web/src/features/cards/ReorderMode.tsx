// Vertical drag-reorder view powered by @dnd-kit. Pointer + keyboard sensors
// give us free a11y (arrow keys + space to pick up / drop). A "Save" CTA POSTs
// the full dense new ordering.

import { useState } from 'react';
import { GripVertical } from 'lucide-react';
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
import type { Account } from '@nayanam/core';
import { useReorderAccounts } from '../../lib/hooks';

type Props = {
  accounts: Account[];
  onExit: () => void;
};

export function ReorderMode({ accounts, onExit }: Props) {
  const [order, setOrder] = useState<Account[]>(accounts);
  const reorder = useReorderAccounts();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrder((prev) => {
      const oldIndex = prev.findIndex((a) => a.id === active.id);
      const newIndex = prev.findIndex((a) => a.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const onSave = () => {
    reorder.mutate(
      {
        order: order.map((a, i) => ({ id: a.id, displayOrder: i })),
      },
      { onSuccess: () => onExit() },
    );
  };

  return (
    <div>
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Reorder cards</h3>
        <div className="flex gap-2">
          <button
            onClick={onExit}
            className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={reorder.isPending}
            className="rounded-full bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
          >
            {reorder.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext
          items={order.map((a) => a.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-2">
            {order.map((a) => (
              <SortableAccountRow key={a.id} account={a} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableAccountRow({ account }: { account: Account }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: account.id });

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
        'flex items-center gap-3 rounded-[var(--radius-md)] border bg-[var(--color-surface)] px-4 py-3 ' +
        (isDragging
          ? 'border-[var(--color-accent)] shadow-lg'
          : 'border-[var(--color-border)]')
      }
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${account.nickname}`}
        className="flex cursor-grab touch-none items-center justify-center rounded-[var(--radius-sm)] p-1 text-[var(--color-text-dim)] hover:bg-[var(--color-border)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] active:cursor-grabbing"
      >
        <GripVertical size={16} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{account.nickname}</div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
          {account.type} · {account.currencyCode}
        </div>
      </div>
    </li>
  );
}
