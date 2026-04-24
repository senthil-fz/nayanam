// /settings/budgets — Phase 6 Budgets management screen.
//
// Flat routing: the file name `settings.budgets.tsx` produces the URL path
// `/settings/budgets` at the root of the tree (no nested layout on top).

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { AppShell } from '../components/AppShell';
import { BudgetsScreen } from '../features/budgets/BudgetsScreen';

const SearchSchema = z.object({
  // Home empty-state CTA and suggestion chips use `?add=1` to auto-open
  // the Add dialog. Treat anything truthy as "open".
  add: z.coerce.number().optional(),
  // Optional budget id to highlight (e.g. arriving from a notification
  // deep-link). Reserved; not yet consumed.
  highlight: z.string().optional(),
});

export const Route = createFileRoute('/settings/budgets')({
  validateSearch: SearchSchema,
  component: BudgetsRoute,
});

function BudgetsRoute() {
  const { add } = Route.useSearch();
  return (
    <AppShell>
      <BudgetsScreen autoOpenAdd={Boolean(add)} />
    </AppShell>
  );
}
