// Home header — avatar + greeting + notification bell.

import { Link } from '@tanstack/react-router';
import type { ApiMe } from '@nayanam/contracts';
import { NotificationBell } from './NotificationBell';

type Props = {
  me: ApiMe | undefined;
};

function initialsOf(name?: string | null, email?: string): string {
  const src = (name ?? email ?? '?').trim();
  if (!src) return '?';
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function greetingFor(date = new Date()): string {
  const h = date.getUTCHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function firstNameOf(user?: ApiMe['user']): string {
  if (!user) return '...';
  const name = user.name?.trim();
  if (name) return name.split(/\s+/)[0] ?? name;
  return user.email.split('@')[0] ?? user.email;
}

export function HomeHeader({ me }: Props) {
  const initials = initialsOf(me?.user.name, me?.user.email);

  return (
    <header className="flex items-center justify-between gap-3">
      <Link
        to="/settings"
        aria-label="Open settings"
        className="group flex items-center gap-3"
      >
        <span
          aria-hidden
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-accent),var(--color-accent-soft))] text-sm font-bold text-white shadow-sm transition-transform group-hover:scale-[1.03]"
        >
          {initials}
        </span>
        <span className="flex flex-col text-left">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
            {greetingFor()}
          </span>
          <span className="text-base font-semibold tracking-tight text-[var(--color-text)]">
            {firstNameOf(me?.user)}
          </span>
        </span>
      </Link>
      <NotificationBell />
    </header>
  );
}
