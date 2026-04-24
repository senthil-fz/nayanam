// Five quick-action chip buttons.

import { Minus, Plus, ArrowRightLeft, ScanLine, Receipt } from 'lucide-react';
import { type ReactNode } from 'react';
import { useToast } from '../../components/Toast';

type Action = {
  key: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  disabledReason?: string;
  onClick?: () => void;
};

type Props = {
  canMutate: boolean;
  lockReason?: string;
  onAddExpense: () => void;
  onAddIncome: () => void;
  onTransfer: () => void;
};

export function QuickActionsGrid({
  canMutate,
  lockReason,
  onAddExpense,
  onAddIncome,
  onTransfer,
}: Props) {
  const toast = useToast();
  const mutateDisabled = !canMutate;

  const actions: Action[] = [
    {
      key: 'expense',
      label: 'Add expense',
      icon: <Minus size={16} aria-hidden />,
      disabled: mutateDisabled,
      disabledReason: lockReason,
      onClick: onAddExpense,
    },
    {
      key: 'income',
      label: 'Add income',
      icon: <Plus size={16} aria-hidden />,
      disabled: mutateDisabled,
      disabledReason: lockReason,
      onClick: onAddIncome,
    },
    {
      key: 'transfer',
      label: 'Transfer',
      icon: <ArrowRightLeft size={16} aria-hidden />,
      disabled: mutateDisabled,
      disabledReason: lockReason,
      onClick: onTransfer,
    },
    {
      key: 'scan',
      label: 'Scan',
      icon: <ScanLine size={16} aria-hidden />,
      disabled: true,
      disabledReason: 'Coming soon',
    },
    {
      key: 'bills',
      label: 'Bills',
      icon: <Receipt size={16} aria-hidden />,
      onClick: () => toast.show('Bills arrives in Phase 5.'),
    },
  ];

  return (
    <div className="grid grid-cols-5 gap-2">
      {actions.map((a) => (
        <button
          key={a.key}
          type="button"
          onClick={a.onClick}
          disabled={a.disabled}
          title={a.disabled ? a.disabledReason : undefined}
          aria-label={a.label + (a.disabled ? ` (${a.disabledReason})` : '')}
          className={
            'flex flex-col items-center gap-1.5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-3 text-[11px] font-medium leading-tight transition-colors ' +
            (a.disabled
              ? 'opacity-60'
              : 'hover:bg-[var(--color-surface-alt)] active:scale-[0.98]')
          }
        >
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
          >
            {a.icon}
          </span>
          <span className="text-[var(--color-text)]">{a.label}</span>
        </button>
      ))}
    </div>
  );
}
