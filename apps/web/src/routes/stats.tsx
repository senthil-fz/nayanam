// /stats — Phase 7 Statistics screen.
//
// Composition only: owns no data-fetching directly. The `StatsScreen`
// orchestrator wires period + currency state and each chart tile.

import { createFileRoute } from '@tanstack/react-router';
import { AppShell } from '../components/AppShell';
import { StatsScreen } from '../features/stats/StatsScreen';

export const Route = createFileRoute('/stats')({
  component: StatsRoute,
});

function StatsRoute() {
  return (
    <AppShell>
      <StatsScreen />
    </AppShell>
  );
}
