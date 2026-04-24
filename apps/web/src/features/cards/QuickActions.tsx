// Four-button grid from the prototype. Only "Manage" is wired in v1.

import { ArrowUpRight, Plus, Snowflake, Settings } from 'lucide-react';

type Props = { onManage: () => void };

const COMING_SOON = 'Coming soon';

export function QuickActions({ onManage }: Props) {
  return (
    <div className="mt-6 grid grid-cols-4 gap-2">
      <ActionButton icon={<ArrowUpRight size={18} />} label="Send" disabled tooltip={COMING_SOON} />
      <ActionButton icon={<Plus size={18} />} label="Top-up" disabled tooltip={COMING_SOON} />
      <ActionButton icon={<Snowflake size={18} />} label="Freeze" disabled tooltip={COMING_SOON} />
      <ActionButton icon={<Settings size={18} />} label="Manage" onClick={onManage} />
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
  tooltip,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  tooltip?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={tooltip ?? label}
      aria-label={label}
      className={
        'flex flex-col items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-3 text-xs font-medium transition-colors ' +
        (disabled
          ? 'cursor-not-allowed opacity-50'
          : 'hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]')
      }
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
