// Single budget row for the Settings → Budgets list.
//
// Layout: drag handle (ADMIN+) + icon + name/meta + progress text + bar +
// actions on hover. Tapping the main area opens the BudgetDetailSheet.

import { Archive, GripVertical, Pause, Pencil, Play, RotateCcw, Globe2 } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Budget, BudgetsStatusItemType, Category } from '@nayanam/core';
import { formatMoney } from '@nayanam/core';
import { CategoryIconChip } from '../categories/CategoryIconChip';
import { periodLabel, toneColorVar, toneFor, toneLabel } from './format';

type Props = {
  budget: Budget;
  status?: BudgetsStatusItemType;
  category?: Category;
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

export function BudgetRow({
  budget,
  status,
  category,
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: budget.id, disabled: !canReorder || Boolean(budget.archivedAt) });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(
      transform ? { ...transform, scaleX: 1, scaleY: isDragging ? 1.02 : 1 } : null,
    ),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  const progress = status?.progressPercent ?? 0;
  const tone = toneFor(progress);
  const paused = budget.status === 'PAUSED';
  const archived = Boolean(budget.archivedAt);

  const effective = status?.effectiveAmountMinor ?? budget.amountMinor;
  const spent = status?.spentMinor ?? '0';
  const spentText = redactAmounts
    ? '••••••'
    : formatMoney(spent, budget.currencyCode);
  const effectiveText = redactAmounts
    ? '••••••'
    : formatMoney(effective, budget.currencyCode);

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={
        'group flex items-center gap-3 rounded-[var(--radius-md)] border bg-[var(--color-surface)] px-3 py-3 ' +
        (isDragging
          ? 'border-[var(--color-accent)] shadow-lg'
          : 'border-[var(--color-border)]') +
        (archived ? ' opacity-70' : '')
      }
    >
      {canReorder && !archived ? (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag to reorder ${budget.name}`}
          className="flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-[var(--color-text-dim)] hover:bg-[var(--color-surface-alt)] active:cursor-grabbing"
        >
          <GripVertical size={14} aria-hidden />
        </button>
      ) : null}

      {budget.scope === 'HOUSEHOLD' ? (
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
        >
          <Globe2 size={16} />
        </span>
      ) : (
        <CategoryIconChip
          colorToken={category?.colorToken}
          iconToken={category?.iconToken}
          size={36}
        />
      )}

      <button
        type="button"
        onClick={() => onOpen(budget)}
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-[var(--color-text)]">
            {budget.name}
          </span>
          {paused ? (
            <StatusPill label="Paused" />
          ) : archived ? (
            <StatusPill label="Archived" />
          ) : null}
          {budget.rollover ? (
            <span className="rounded-full border border-[var(--color-border)] px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-dim)]">
              Rollover
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-[var(--color-text-dim)]">
          {budget.currencyCode} · {periodLabel(budget.period)}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-alt)]">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${Math.min(100, progress)}%`,
                background: toneColorVar(tone),
              }}
            />
          </div>
          <span
            className="shrink-0 font-mono text-[10px] tabular-nums"
            style={{ color: toneColorVar(tone) }}
          >
            {progress}% · {toneLabel(tone)}
          </span>
        </div>
        <div className="mt-0.5 font-mono text-[10px] text-[var(--color-text-dim)]">
          {spentText} of {effectiveText}
        </div>
      </button>

      <div className="hidden items-center gap-1 group-hover:flex">
        {canMutate && !archived ? (
          <IconButton label="Edit" onClick={() => onEdit(budget)}>
            <Pencil size={14} aria-hidden />
          </IconButton>
        ) : null}
        {canMutate && !archived ? (
          <IconButton
            label={paused ? 'Resume' : 'Pause'}
            onClick={() => onPauseResume(budget)}
          >
            {paused ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />}
          </IconButton>
        ) : null}
        {canArchive && !archived ? (
          <IconButton label="Archive" onClick={() => onArchive(budget)}>
            <Archive size={14} aria-hidden />
          </IconButton>
        ) : null}
        {canArchive && archived ? (
          <IconButton label="Restore" onClick={() => onRestore(budget)}>
            <RotateCcw size={14} aria-hidden />
          </IconButton>
        ) : null}
      </div>
    </article>
  );
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-[var(--color-surface-alt)] px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-dim)]">
      {label}
    </span>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-dim)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]"
    >
      {children}
    </button>
  );
}
