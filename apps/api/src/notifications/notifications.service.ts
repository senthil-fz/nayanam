import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getAuthOrThrow } from '../common/context';

/**
 * Notifications are user-scoped (follow the user across households), so this
 * service intentionally does NOT apply `householdId` filtering. `X-Household-Id`
 * is ignored for the unread-count endpoint per Phase 4 spec §API surface.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async unreadCount(): Promise<{ unreadCount: number }> {
    const { userId } = getAuthOrThrow();
    // Cap at 9999 in SQL so we never pull a bigger count than we need; the
    // (user_id, read_at) index covers this predicate.
    const rows = await this.prisma.$queryRaw<Array<{ unread_count: number }>>`
      SELECT LEAST(COUNT(*), 9999)::int AS unread_count
        FROM notifications
       WHERE user_id = ${userId}
         AND read_at IS NULL
    `;
    return { unreadCount: rows[0]?.unread_count ?? 0 };
  }
}
