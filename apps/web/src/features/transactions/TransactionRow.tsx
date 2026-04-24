// Per-row transaction component.
// Hover reveals inline actions (edit, duplicate, delete/restore).
// Transfer pair-rows render with a different accent and route their delete
// action through the parent's transfer-delete handler.

import { CATEGORY_COLORS, type CategoryColorToken } from '@nayanam/ui-tokens';
import type { Account, Category, Transaction } from '@nayanam/core';
import { ArrowRightLeft, Copy, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { categoryIconFor } from './icons';
import { signedAmount } from './format';

type Props = {
  transaction: Transaction;
  account?: Account;
  category?: Category;
  /** Whether this row is the destination side of a transfer (account match). */
  isTransferDestination?: boolean;
  onEdit?: (t: Transaction) => void;
  onDuplicate?: (t: Transaction) => void;
  onDelete?: (t: Transaction) => void;
  onRestore?: (t: Transaction) => void;
  /** Suppress row actions (e.g. inside Home recent-activity compact mode). */
  compact?: boolean;
  /** Hide the delete button (VIEWER role). */
  hideDelete?: boolean;
};

function resolveTint(token: string | undefined | null) {
  if (token && token in CATEGORY_COLORS) {
    const c = CATEGORY_COLORS[token as CategoryColorToken];
    return { ink: c.ink, soft: c.soft };
  }
  return { ink: '#3F3F46', soft: '#E4E4E7' };
}

export function TransactionRow({
  transaction: t,
  account,
  category,
  isTransferDestination,
  onEdit,
  onDuplicate,
  onDelete,
  onRestore,
  compact,
  hideDelete,
}: Props) {
  const isDeleted = Boolean(t.deletedAt);
  const isTransfer = t.type === 'TRANSFER';
  const iconToken = isTransfer
    ? 'arrow-right-arrow-left'
    : category?.iconToken ?? 'tag';
  const colorToken = category?.colorToken ?? 'graphite';
  const { ink, soft } = resolveTint(colorToken);
  const Icon = isTransfer ? ArrowRightLeft : categoryIconFor(iconToken);

  const amount = signedAmount(t.type, t.amountMinor, t.currencyCode, {
    isTransferDestination,
  });
  const toneClass =
    amount.tone === 'positive'
      ? 'text-[var(--color-positive)]'
      : amount.tone === 'negative'
        ? 'text-[var(--color-negative)]'
        : 'text-[var(--color-accent)]';

  return (
    <article
      data-deleted={isDeleted || undefined}
      className={
        'group flex items-center gap-3 rounded-[var(--radius-md)] px-2 py-2 ' +
        'hover:bg-[var(--color-surface-alt)] ' +
        (isDeleted ? 'opacity-60' : '')
      }
    >
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: soft, color: ink }}
      >
        <Icon size={18} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium text-[var(--color-text)]">
            {isTransfer
              ? isTransferDestination
                ? 'Transfer in'
                : 'Transfer out'
              : category?.label ?? 'Uncategorized'}
          </span>
          {account ? (
            <span className="truncate font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
              {account.nickname}
            </span>
          ) : null}
        </div>
        {t.note ? (
          <p className="mt-0.5 line-clamp-1 text-xs text-[var(--color-text-dim)]">
            {t.note.slice(0, 80)}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className={`text-sm font-semibold tabular-nums ${toneClass}`}>
          {amount.text}
        </div>
        {!compact ? (
          <div
            className="ml-1 hidden items-center gap-1 group-hover:flex"
            aria-label="Row actions"
          >
            {!isDeleted && onEdit ? (
              <RowIconButton
                label="Edit"
                icon={<Pencil size={14} />}
                onClick={() => onEdit(t)}
              />
            ) : null}
            {!isDeleted && onDuplicate && !isTransfer ? (
              <RowIconButton
                label="Duplicate"
                icon={<Copy size={14} />}
                onClick={() => onDuplicate(t)}
              />
            ) : null}
            {!isDeleted && !hideDelete && onDelete ? (
              <RowIconButton
                label={isTransfer ? 'Delete transfer' : 'Delete'}
                icon={<Trash2 size={14} />}
                onClick={() => onDelete(t)}
                tone="negative"
              />
            ) : null}
            {isDeleted && onRestore ? (
              <RowIconButton
                label="Restore"
                icon={<RotateCcw size={14} />}
                onClick={() => onRestore(t)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function RowIconButton({
  label,
  icon,
  onClick,
  tone,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone?: 'negative';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={
        'flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-dim)] ' +
        'hover:bg-[var(--color-border)] hover:text-[var(--color-text)] ' +
        (tone === 'negative' ? 'hover:text-[var(--color-negative)]' : '')
      }
    >
      {icon}
    </button>
  );
}
