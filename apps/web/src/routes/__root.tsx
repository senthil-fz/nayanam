import { Outlet, createRootRoute, redirect } from '@tanstack/react-router';
import { useAuthStore } from '../lib/api';

export const Route = createRootRoute({
  beforeLoad: ({ location }) => {
    const s = useAuthStore.getState();
    const isAuthPath = location.pathname.startsWith('/auth');
    const hasSession = Boolean(s.refreshToken);
    if (!hasSession && !isAuthPath) {
      throw redirect({ to: '/auth' });
    }
    if (hasSession && location.pathname === '/auth') {
      throw redirect({ to: '/' });
    }
  },
  component: () => (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <Outlet />
    </div>
  ),
});
