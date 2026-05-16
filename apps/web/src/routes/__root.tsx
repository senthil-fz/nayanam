import { Outlet, createRootRoute, redirect, useRouter } from '@tanstack/react-router';
import { apiClient, useAuthStore } from '../lib/api';

function RootErrorFallback({ error }: { error: unknown }) {
  const router = useRouter();
  const message =
    error instanceof Error ? error.message : 'An unexpected error occurred.';
  return (
    <div
      role="alert"
      className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-negative)]/10 text-2xl text-[var(--color-negative)]">
        !
      </div>
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-xs text-sm text-[var(--color-text-dim)]">{message}</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => router.invalidate()}
          className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => void router.navigate({ to: '/', replace: true })}
          className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-medium"
        >
          Go home
        </button>
      </div>
    </div>
  );
}

function RootNotFound() {
  const router = useRouter();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-5xl font-bold opacity-20">404</div>
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="max-w-xs text-sm text-[var(--color-text-dim)]">
        The page you&rsquo;re looking for doesn&rsquo;t exist.
      </p>
      <button
        type="button"
        onClick={() => void router.navigate({ to: '/', replace: true })}
        className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white"
      >
        Go home
      </button>
    </main>
  );
}

/** Returns true when the in-memory access token is known-expired. */
function isAccessTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  // Add a 30-second clock-skew buffer so we refresh slightly early.
  return Date.now() >= new Date(expiresAt).getTime() - 30_000;
}

export const Route = createRootRoute({
  errorComponent: ({ error }) => <RootErrorFallback error={error} />,
  notFoundComponent: () => <RootNotFound />,
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
