// Single-bill row. Icon chip inherits from category when bill tokens are null.

import { CATEGORY_COLORS, type CategoryColorToken } from '@nayanam/ui-tokens';
import type { Bill, Category } from '@nayanam/core';
import { formatMoney } from '@nayanam/core';
import {
  CircleCheckBig,
  Pause,
  Pencil,
  Play,
  Archive,
  MoreHorizontal,
} from 'lucide-react';
import { categoryIconFor } from '../transactions/icons';
import { cycleEyebrow, daysUntilDue, dueLabel, formatShortDate } from './format';

type Action = {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
};

type Props = {
  bill: Bill;
  category: Category | undefined;
  /** Ref setter used by UpcomingTimeline → row scroll-into-view. */
  registerRef?: (el: HTMLElement | null) => void;
  /** Set by the screen when a timeline dot was tapped; triggers the flash. */
  flash?: boolean;
  canMutate: boolean;
  canArchive: boolean;
  onOpen: (bill: Bill) => void;
  onEdit: (bill: Bill) => void;
  onMarkPaid: (bill: Bill) => void;
  onPauseResume: (bill: Bill) => void;
  onArchive: (bill: Bill) => void;
};

function resolveTint(token: string | null | undefined) {
  if (token && token in CATEGORY_COLORS) {
    const c = CATEGORY_COLORS[token as CategoryColorToken];
    return { ink: c.ink, soft: c.soft };
  }
  return { ink: '#3F3F46', soft: '#E4E4E7' };
}

export function BillRow({
  bill,
  category,
  registerRef,
  flash,
  canMutate,
  canArchive,
  onOpen,
  onEdit,
  onMarkPaid,
  onPauseResume,
  onArchive,
}: Props) {
  const colorToken = bill.colorToken ?? category?.colorToken ?? null;
  const iconToken = bill.iconToken ?? category?.iconToken ?? 'tag';
  const { ink, soft } = resolveTint(colorToken);
  const Icon = categoryIconFor(iconToken);

  const paused = bill.status === 'PAUSED';
  const days = daysUntilDue(bill.nextDueAt);
  const due = paused ? null : dueLabel(days);

  const actions: Action[] = [];
  if (canMutate && !paused) {
    actions.push({
      key: 'mark-paid',
      label: 'Mark paid',
      icon: <CircleCheckBig size={14} aria-hidden />,
      onClick: () => onMarkPaid(bill),
    });
  }
  if (canMutate) {
    actions.push({
      key: 'edit',
      label: 'Edit',
      icon: <Pencil size={14} aria-hidden />,
      onClick: () => onEdit(bill),
    });
    actions.push({
      key: 'pause-resume',
      label: paused ? 'Resume' : 'Pause',
      icon: paused ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />,
      onClick: () => onPauseResume(bill),
    });
  }
  if (canArchive) {
    actions.push({
      key: 'archive',
      label: 'Archive',
      icon: <Archive size={14} aria-hidden />,
      onClick: () => onArchive(bill),
    });
  }

  return (
    <article
      ref={registerRef}
      data-flash={flash || undefined}
      className={
        'group flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 ' +
        (flash ? 'ring-2 ring-[var(--color-accent)] transition-shadow' : '')
      }
    >
      <button
        type="button"
        onClick={() => onOpen(bill)}
        aria-label={`Open bill ${bill.name}`}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{ background: soft, color: ink }}
      >
        <Icon size={16} aria-hidden />
      </button>

      <button
        type="button"
        onClick={() => onOpen(bill)}
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-[var(--color-text)]">
            {bill.name}
          </span>
          {paused ? (
            <span className="rounded-full bg-[var(--color-surface-alt)] px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-dim)]">
              Paused
            </span>
          ) : due?.tone === 'negative' ? (
            <span className="rounded-full bg-[var(--color-negative)]/15 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--color-negative)]">
              {due.label}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-[var(--color-text-dim)]">
          {cycleEyebrow(bill)} · Next {formatShortDate(bill.nextDueAt)}
        </div>
      </button>

      <div className="text-right">
        <div className="font-mono text-sm font-bold text-[var(--color-text)]">
          {formatMoney(bill.amountMinor, bill.currencyCode)}
        </div>
        <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--color-text-faint)]">
          /mo
        </div>
      </div>

      {actions.length > 0 ? (
        <div className="hidden items-center gap-1 group-hover:flex">
          {actions.slice(0, 3).map((a) => (
            <button
              key={a.key}
              type="button"
              aria-label={a.label}
              title={a.label}
              onClick={a.onClick}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-dim)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]"
            >
              {a.icon}
            </button>
          ))}
          {actions.length > 3 ? (
            <button
              type="button"
              aria-label="More actions"
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-dim)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]"
              onClick={() => actions[3]?.onClick()}
              title={actions[3]?.label}
            >
              <MoreHorizontal size={14} aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
