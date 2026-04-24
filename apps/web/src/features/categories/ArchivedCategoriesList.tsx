import { RotateCcw } from 'lucide-react';
import type { Category } from '@nayanam/core';
import { useRestoreCategory } from '../../lib/hooks';
import { CategoryIconChip } from './CategoryIconChip';

export function ArchivedCategoriesList({ categories }: { categories: Category[] }) {
  if (categories.length === 0) {
    return (
      <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-3 text-xs text-[var(--color-text-dim)]">
        No archived categories.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1">
      {categories.map((c) => (
        <ArchivedRow key={c.id} category={c} />
      ))}
    </ul>
  );
}

function ArchivedRow({ category }: { category: Category }) {
  const restore = useRestoreCategory(category.id);
  return (
    <li className="flex items-center gap-3 rounded-[var(--radius-md)] px-2 py-2 opacity-70 hover:bg-[var(--color-surface-alt)]">
      <CategoryIconChip colorToken={category.colorToken} iconToken={category.iconToken} />
      <span className="flex-1 truncate text-sm">{category.label}</span>
      <button
        type="button"
        onClick={() => restore.mutate({})}
        disabled={restore.isPending}
        aria-label={`Restore ${category.label}`}
        className="flex h-7 items-center gap-1 rounded-full border border-[var(--color-border)] px-2 text-xs hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
      >
        <RotateCcw size={11} />
        {restore.isPending ? '…' : 'Restore'}
      </button>
    </li>
  );
}
