// Small, shared UI primitives for the Settings screen. Shared across cards
// so the grouped-section look stays consistent with the prototype.

import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

export function SectionGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
        {title}
      </h2>
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        {children}
      </div>
    </section>
  );
}

export function SettingsRow({
  icon,
  iconTint,
  label,
  sub,
  right,
  onClick,
  destructive,
}: {
  icon?: ReactNode;
  iconTint?: string;
  label: string;
  sub?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
  destructive?: boolean;
}) {
  const content = (
    <div className="flex w-full items-center gap-3 px-4 py-3 text-left">
      {icon ? (
        <span
          aria-hidden
          style={{
            background: iconTint ?? 'var(--color-accent-soft)',
            color: iconTint ? 'var(--color-text)' : 'var(--color-accent)',
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span
          className={
            'block truncate text-sm font-semibold ' +
            (destructive ? 'text-[var(--color-negative)]' : 'text-[var(--color-text)]')
          }
        >
          {label}
        </span>
        {sub ? (
          <span className="mt-0.5 block truncate text-xs text-[var(--color-text-dim)]">
            {sub}
          </span>
        ) : null}
      </span>
      {right ? (
        <span className="flex shrink-0 items-center">{right}</span>
      ) : onClick ? (
        <ChevronRight
          size={16}
          aria-hidden
          className="shrink-0 text-[var(--color-text-dim)]"
        />
      ) : null}
    </div>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block w-full border-b border-[var(--color-border)] bg-transparent text-left transition-colors last:border-b-0 hover:bg-[var(--color-surface-alt)]"
      >
        {content}
      </button>
    );
  }
  return (
    <div className="block w-full border-b border-[var(--color-border)] last:border-b-0">
      {content}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={
        'relative inline-flex h-[22px] w-9 items-center rounded-full transition-colors ' +
        (checked
          ? 'bg-[var(--color-accent)]'
          : 'bg-[var(--color-surface-alt)] border border-[var(--color-border)]') +
        (disabled ? ' opacity-50' : '')
      }
    >
      <span
        aria-hidden
        className="absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all"
        style={{ left: checked ? 16 : 2 }}
      />
    </button>
  );
}

export function relativeTime(isoInput: string | null | undefined): string {
  if (!isoInput) return '—';
  const then = new Date(isoInput).getTime();
  if (Number.isNaN(then)) return '—';
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return 'just now';
  const mins = Math.round(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.round(days / 365);
  return `${years}y ago`;
}

export function Avatar({
  name,
  url,
  size = 40,
}: {
  name?: string | null;
  url?: string | null;
  size?: number;
}) {
  const initials = (name ?? '?')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className="flex items-center justify-center rounded-full bg-[var(--color-accent-soft)] font-semibold text-[var(--color-accent)]"
    >
      {initials || '?'}
    </span>
  );
}
