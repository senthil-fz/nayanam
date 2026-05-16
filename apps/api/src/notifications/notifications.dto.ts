import { z } from 'zod';
import {
  NotificationCategoryEnum,
  deriveCategoryFromType,
  type NotificationCategory,
  type Notification,
  type NotificationsPageType,
} from '@nayanam/core/notifications/schemas';

/**
 * Notifications DTOs. The category enum and the wire types come from the
 * shared `@nayanam/core` schemas (B4). The query / mutation schemas stay
 * local — they are Express string-coercion variants of the core typed shapes.
 */

export const UnreadCountResponseSchema = z.object({
  unreadCount: z.number().int().min(0).max(9999),
});
export type UnreadCountResponse = z.infer<typeof UnreadCountResponseSchema>;

// Re-export the shared category enum so existing importers keep resolving it
// from this module.
export const NotificationCategorySchema = NotificationCategoryEnum;
export type { NotificationCategory };

export const ListNotificationsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : Number(v)))
    .pipe(z.number().int().min(1).max(100).optional()),
  unreadOnly: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  category: NotificationCategoryEnum.optional(),
  includeDeleted: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
});
export type ListNotificationsQuery = z.infer<typeof ListNotificationsQuerySchema>;

export const MarkAllNotificationsReadInputSchema = z
  .object({ category: NotificationCategoryEnum.optional() })
  .partial()
  .optional();
export type MarkAllNotificationsReadInput = z.infer<typeof MarkAllNotificationsReadInputSchema>;

/** Wire shapes — shared `Notification` types from core. */
export type NotificationDTO = Notification;
export type NotificationsPageDTO = NotificationsPageType;

/**
 * Derive the notification category from a dotted event-type key.
 * Delegates to the shared `deriveCategoryFromType` so the API and the clients
 * classify event types identically.
 */
export function deriveCategory(type: string): NotificationCategory {
  return deriveCategoryFromType(type);
}
