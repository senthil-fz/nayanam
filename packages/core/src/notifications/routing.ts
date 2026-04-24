// Tap-through routing for in-app notification rows and push handlers.
// Single source of truth consumed by both web and mobile — keeps the route
// table in sync across surfaces.

import { deriveCategoryFromType, type Notification } from './schemas';

export type NotificationRoute = {
  web: string | null;
  mobile: string | null;
};

function str(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Map a notification to per-platform route strings. Returns `{ web: null,
 * mobile: null }` for types that do not have a meaningful destination; the
 * UI should treat those as "mark read, no navigation."
 */
export function resolveNotificationRoute(n: Notification): NotificationRoute {
  const category = n.category ?? deriveCategoryFromType(n.type);

  if (category === 'bill') {
    const billId = str(n.payload, 'billId');
    if (!billId) return { web: '/bills', mobile: '/bills' };
    return {
      web: `/bills?highlight=${encodeURIComponent(billId)}`,
      mobile: `/bills/${encodeURIComponent(billId)}`,
    };
  }

  if (category === 'budget') {
    const budgetId = str(n.payload, 'budgetId');
    if (!budgetId) {
      return { web: '/settings/budgets', mobile: '/budgets' };
    }
    return {
      web: `/settings/budgets?highlight=${encodeURIComponent(budgetId)}`,
      // Mobile budgets detail screen isn't shipped yet — fall back to the tab
      // with a highlight query the list screen can consume.
      mobile: `/budgets?highlight=${encodeURIComponent(budgetId)}`,
    };
  }

  if (category === 'transaction' || category === 'transfer') {
    const id =
      str(n.payload, 'transactionId') ??
      str(n.payload, 'transferId') ??
      null;
    if (!id) {
      return { web: '/transactions', mobile: '/(tabs)/transactions' };
    }
    return {
      web: `/transactions?highlight=${encodeURIComponent(id)}`,
      mobile: `/(tabs)/transactions?highlight=${encodeURIComponent(id)}`,
    };
  }

  if (category === 'household') {
    return { web: '/settings/household', mobile: '/settings/household' };
  }

  return { web: null, mobile: null };
}
