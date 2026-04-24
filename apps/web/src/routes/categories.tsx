// /categories — manage household custom categories (+ view system rows).
// Phase 9 will fold this under Settings; for Phase 3 it lives at /categories.

import { createFileRoute } from '@tanstack/react-router';
import { AppShell } from '../components/AppShell';
import { CategoriesScreen } from '../features/categories/CategoriesScreen';

export const Route = createFileRoute('/categories')({
  component: CategoriesRoute,
});

function CategoriesRoute() {
  return (
    <AppShell>
      <CategoriesScreen />
    </AppShell>
  );
}
