// Settings placeholder — full UI lands in Phase 9. Provides a sign-out affordance
// so users have an escape hatch before then.

import {
  Outlet,
  createFileRoute,
  Link,
  useLocation,
} from '@tanstack/react-router';
import { ChevronRight, Target } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { useLogout, useMe } from '../lib/hooks';

export const Route = createFileRoute('/settings')({
  component: SettingsScreen,
});

function SettingsScreen() {
  const me = useMe();
  const logout = useLogout();
  const location = useLocation();

  // When a child route is active (e.g. /settings/budgets) TanStack Router
  // renders this parent's component first; we yield to the child outlet
  // instead of showing the settings index.
  if (location.pathname !== '/settings') {
    return <Outlet />;
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        <div>
          <Link
            to="/"
            className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Home
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-[var(--color-text-dim)]">
            Full settings arrive in Phase 9. Sign out is available here until then.
          </p>
        </div>

        <nav aria-label="Settings sections" className="flex flex-col gap-2">
          <Link
            to="/settings/budgets"
            className="group flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-colors hover:bg-[var(--color-surface-alt)]"
          >
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
            >
              <Target size={18} strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-[var(--color-text)]">
                Budgets
              </span>
              <span className="mt-0.5 block text-xs text-[var(--color-text-dim)]">
                Set ceilings and get alerts when you&apos;re close.
              </span>
            </span>
            <ChevronRight
              size={16}
              aria-hidden
              className="shrink-0 text-[var(--color-text-dim)] group-hover:text-[var(--color-text)]"
            />
          </Link>
        </nav>

        <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
            Signed in as
          </div>
          <div className="mt-1 text-base font-medium">
            {me.data?.user.name ?? me.data?.user.email ?? '—'}
          </div>
          {me.data?.user.name ? (
            <div className="text-sm text-[var(--color-text-dim)]">
              {me.data.user.email}
            </div>
          ) : null}
        </section>

        <button
          type="button"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          className="self-start rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-negative)] transition-colors hover:bg-[var(--color-surface-alt)] disabled:opacity-60"
        >
          {logout.isPending ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </AppShell>
  );
}
