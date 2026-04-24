import { z } from 'zod';

export const UnreadCountResponseSchema = z.object({
  unreadCount: z.number().int().min(0).max(9999),
});
export type UnreadCountResponse = z.infer<typeof UnreadCountResponseSchema>;

export const NotificationCategorySchema = z.enum([
  'bill',
  'budget',
  'transaction',
  'transfer',
  'household',
  'other',
]);
export type NotificationCategory = z.infer<typeof NotificationCategorySchema>;

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
  category: NotificationCategorySchema.optional(),
  includeDeleted: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
});
export type ListNotificationsQuery = z.infer<typeof ListNotificationsQuerySchema>;

export const MarkAllNotificationsReadInputSchema = z
  .object({ category: NotificationCategorySchema.optional() })
  .partial()
  .optional();
export type MarkAllNotificationsReadInput = z.infer<typeof MarkAllNotificationsReadInputSchema>;

export type NotificationDTO = {
  id: string;
  userId: string;
  householdId: string | null;
  type: string;
  category: NotificationCategory;
  payload: Record<string, unknown>;
  readAt: string | null;
  deletedAt: string | null;
  createdAt: string;
};

export type NotificationsPageDTO = {
  items: NotificationDTO[];
  nextCursor: string | null;
};

export function deriveCategory(type: string): NotificationCategory {
  const prefix = type.split('.')[0];
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
