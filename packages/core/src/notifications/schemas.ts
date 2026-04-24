// Zod schemas for Notifications domain. Phase 4 ships only the unread-count.

import { z } from 'zod';

export const UnreadCountResponse = z.object({
  unreadCount: z.number().int().nonnegative(),
});
export type UnreadCountResponseType = z.infer<typeof UnreadCountResponse>;
