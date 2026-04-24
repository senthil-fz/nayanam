// Shared shell for authenticated routes — sticky header + primary tab nav.
// Mobile-first: tabs collapse to a bottom bar on narrow viewports.

import { Link, useLocation } from '@tanstack/react-router';
import type { ReactNode } from 'react';

type Tab = { to: string; label: string };

const TABS: Tab[] = [
  { to: '/', label: 'Home' },
  { to: '/cards', label: 'Cards' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/bills', label: 'Bills' },
  { to: '/categories', label: 'Categories' },
];

export function AppShell({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const loc = useLocation();
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]/80 px-6 py-4 backdrop-blur">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--color-accent)] font-bold text-white">
            N
          </div>
          <div>
            <div className="text-base font-semibold tracking-tight">Nayanam</div>
            <div className="font-mono text-[10px] uppercase tracking-wider opacity-50">
              Expense manager
            </div>
          </div>
        </Link>
        {right}
      </header>

      <main className="flex-1 px-6 pb-24 pt-4">{children}</main>

      <nav
        aria-label="Primary"
        className="sticky bottom-0 z-20 border-t border-[var(--color-border)] bg-[var(--color-bg)]/90 px-6 py-2 backdrop-blur"
      >
        <ul className="flex items-center justify-around">
          {TABS.map((t) => {
            const active = loc.pathname === t.to;
            return (
              <li key={t.to}>
                <Link
                  to={t.to}
                  className={
                    'rounded-full px-4 py-2 text-sm font-medium transition-colors ' +
                    (active
                      ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                      : 'text-[var(--color-text-dim)] hover:text-[var(--color-text)]')
                  }
                >
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
