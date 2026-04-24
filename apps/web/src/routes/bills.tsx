// /bills — Phase 5 Bills & subscriptions screen.

import { createFileRoute } from '@tanstack/react-router';
import { BillsScreen } from '../features/bills/BillsScreen';

export const Route = createFileRoute('/bills')({
  component: BillsScreen,
});
