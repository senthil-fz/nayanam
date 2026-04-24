// /settings — Phase 9 Settings index. Nested /settings/budgets (Phase 6)
// still routes through this parent: when the pathname isn't exactly
// `/settings` we yield to the child <Outlet />.

import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router';
import { AppShell } from '../components/AppShell';
import { SettingsScreen } from '../features/settings/SettingsScreen';

export const Route = createFileRoute('/settings')({
  component: SettingsRoute,
});

function SettingsRoute() {
  const location = useLocation();
  if (location.pathname !== '/settings') {
    return <Outlet />;
  }
  return (
    <AppShell>
      <SettingsScreen />
    </AppShell>
  );
}
