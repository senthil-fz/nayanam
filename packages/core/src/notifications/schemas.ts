// Zod schemas for Notifications domain. Phase 4 shipped only unread-count;
// Phase 8 adds the full list + mutation surface.

import { z } from 'zod';

export const UnreadCountResponse = z.object({
  unreadCount: z.number().int().nonnegative(),
});
export type UnreadCountResponseType = z.infer<typeof UnreadCountResponse>;

export const NotificationCategoryEnum = z.enum([
  'bill',
  'budget',
  'transaction',
  'transfer',
  'household',
  'other',
]);
export type NotificationCategory = z.infer<typeof NotificationCategoryEnum>;

export const NotificationSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  householdId: z.string().nullable(),
  /** Dotted event-type key. Open union — clients tolerate unknowns. */
  type: z.string().min(1),
  category: NotificationCategoryEnum,
  payload: z.record(z.string(), z.unknown()),
  readAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const NotificationsPage = z.object({
  items: z.array(NotificationSchema),
  nextCursor: z.string().nullable(),
});
export type NotificationsPageType = z.infer<typeof NotificationsPage>;

export const MarkAllNotificationsReadInput = z.object({
  category: NotificationCategoryEnum.optional(),
});
export type MarkAllNotificationsReadInputType = z.infer<
  typeof MarkAllNotificationsReadInput
>;

export const MarkAllNotificationsReadResponse = z.object({
  updatedCount: z.number().int().nonnegative(),
});
export type MarkAllNotificationsReadResponseType = z.infer<
  typeof MarkAllNotificationsReadResponse
>;

/**
 * Derive the category from a dotted event-type key. The server already sets
 * `category` on the row; this helper is a pure client-side fallback for
 * optimistic updates and for payload-only contexts (e.g. push handlers).
 */
export function deriveCategoryFromType(type: string): NotificationCategory {
  const prefix = type.split('.')[0] ?? '';
  switch (prefix) {
    case 'bill':
    case 'budget':
    case 'transaction':
    case 'transfer':
    case 'household':
      return prefix;
    default:
      return 'other';
  }
}
