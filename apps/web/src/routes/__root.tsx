import { Outlet, createRootRoute, redirect } from '@tanstack/react-router';
import { apiClient, useAuthStore } from '../lib/api';

/** Returns true when the in-memory access token is known-expired. */
function isAccessTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  // Add a 30-second clock-skew buffer so we refresh slightly early.
  return Date.now() >= new Date(expiresAt).getTime() - 30_000;
}

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    const s = useAuthStore.getState();
    const isAuthPath = location.pathname.startsWith('/auth');

    // No refresh token at all — definitely unauthenticated.
    if (!s.refreshToken) {
      if (!isAuthPath) throw redirect({ to: '/auth' });
      return;
    }

    // We have a refresh token. If the access token is missing or known-expired,
    // eagerly validate the session before rendering any protected content (prevents
    // the stale-token flicker: dashboard mounts → queries 401 → then redirect).
    if (!isAuthPath && (!s.accessToken || isAccessTokenExpired(s.accessTokenExpiresAt))) {
      try {
        // Attempt to rehydrate — this will call /me which triggers a token refresh
        // via the 401 → refresh → retry path in the API client.
        await apiClient.getMe();
      } catch {
        // Session is genuinely dead (refresh rejected). Clear state and redirect.
        useAuthStore.getState().clear();
        throw redirect({ to: '/auth' });
      }
    }

    // Already authenticated — bounce away from the auth screen.
    if (s.refreshToken && location.pathname === '/auth') {
      throw redirect({ to: '/' });
    }
  },
  component: () => (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <Outlet />
    </div>
  ),
});
