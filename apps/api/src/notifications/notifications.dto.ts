import { z } from 'zod';

/**
 * Zod schema for the unread-count response. No input DTOs — the single
 * endpoint takes no query params. Mirrors
 * `packages/core/src/notifications/schemas.ts`.
 */
export const UnreadCountResponseSchema = z.object({
  unreadCount: z.number().int().min(0).max(9999),
});

export type UnreadCountResponse = z.infer<typeof UnreadCountResponseSchema>;
