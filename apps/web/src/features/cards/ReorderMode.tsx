// Vertical drag-reorder view. Uses native HTML5 DnD — simple, keyboard-free
// but works for mouse/touch. A "Save" CTA POSTs the full new ordering.

import { useState } from 'react';
import { GripVertical } from 'lucide-react';
import type { Account } from '@nayanam/core';
import { useReorderAccounts } from '../../lib/hooks';

type Props = {
  accounts: Account[];
  onExit: () => void;
};

export function ReorderMode({ accounts, onExit }: Props) {
  const [order, setOrder] = useState<Account[]>(accounts);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const reorder = useReorderAccounts();

  const onDragStart = (i: number) => (e: React.DragEvent) => {
    setDragIndex(i);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === i) return;
    setOrder((prev) => {
      const next = [...prev];
      const [item] = next.splice(dragIndex, 1);
      if (!item) return prev;
      next.splice(i, 0, item);
      setDragIndex(i);
      return next;
    });
  };
  const onDragEnd = () => setDragIndex(null);

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
      <ul className="space-y-2">
        {order.map((a, i) => (
          <li
            key={a.id}
            draggable
            onDragStart={onDragStart(i)}
            onDragOver={onDragOver(i)}
            onDragEnd={onDragEnd}
            className={
              'flex cursor-grab items-center gap-3 rounded-[var(--radius-md)] border bg-[var(--color-surface)] px-4 py-3 ' +
              (dragIndex === i
                ? 'border-[var(--color-accent)] shadow-lg'
                : 'border-[var(--color-border)]')
            }
          >
            <GripVertical size={16} className="text-[var(--color-text-dim)]" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{a.nickname}</div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
                {a.type} · {a.currencyCode}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
