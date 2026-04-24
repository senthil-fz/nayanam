import { Injectable } from '@nestjs/common';
import { Prisma, type Notification as NotificationRow } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getAuthOrThrow } from '../common/context';
import { Errors } from '../common/errors';
import {
  deriveCategory,
  type ListNotificationsQuery,
  type MarkAllNotificationsReadInput,
  type NotificationDTO,
  type NotificationsPageDTO,
} from './notifications.dto';

/**
 * Notifications are user-scoped (follow the user across households). This
 * service applies `userId = ctx.userId` + `deletedAt IS NULL` on reads and
 * never filters by `householdId`. The HouseholdHeaderGuard still runs for
 * consistency with the rest of the API.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async unreadCount(): Promise<{ unreadCount: number }> {
    const { userId } = getAuthOrThrow();
    const rows = await this.prisma.$queryRaw<Array<{ unread_count: number }>>`
      SELECT LEAST(COUNT(*), 9999)::int AS unread_count
        FROM notifications
       WHERE user_id = ${userId}
         AND read_at IS NULL
         AND deleted_at IS NULL
    `;
    return { unreadCount: rows[0]?.unread_count ?? 0 };
  }

  async list(params: ListNotificationsQuery): Promise<NotificationsPageDTO> {
    const { userId } = getAuthOrThrow();
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);

    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(params.includeDeleted ? {} : { deletedAt: null }),
      ...(params.unreadOnly ? { readAt: null } : {}),
      ...(params.category ? { type: { startsWith: `${params.category}.` } } : {}),
    };

    // Opaque cursor is simply the last row's id; compound order (createdAt DESC,
    // id DESC) is stable because id is unique.
    const rows = await this.prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;
    return { items: page.map(toDTO), nextCursor };
  }

  async getOne(id: string): Promise<NotificationDTO> {
    const row = await this.findOwnActive(id);
    return toDTO(row);
  }

  async markRead(id: string): Promise<NotificationDTO> {
    const row = await this.findOwnActive(id);
    if (row.readAt) return toDTO(row);
    const updated = await this.prisma.notification.update({
      where: { id: row.id },
      data: { readAt: new Date() },
    });
    return toDTO(updated);
  }

  async markUnread(id: string): Promise<NotificationDTO> {
    const row = await this.findOwnActive(id);
    if (!row.readAt) return toDTO(row);
    const updated = await this.prisma.notification.update({
      where: { id: row.id },
      data: { readAt: null },
    });
    return toDTO(updated);
  }

  async markAllRead(input: MarkAllNotificationsReadInput): Promise<{ updatedCount: number }> {
    const { userId } = getAuthOrThrow();
    const category = input?.category;
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
        deletedAt: null,
        ...(category ? { type: { startsWith: `${category}.` } } : {}),
      },
      data: { readAt: new Date() },
    });
    return { updatedCount: result.count };
  }

  async softDelete(id: string): Promise<void> {
    const row = await this.findOwnActive(id);
    await this.prisma.notification.update({
      where: { id: row.id },
      data: { deletedAt: new Date() },
    });
  }

  private async findOwnActive(id: string): Promise<NotificationRow> {
    const { userId } = getAuthOrThrow();
    const row = await this.prisma.notification.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!row) throw Errors.notFound();
    return row;
  }
}

function toDTO(row: NotificationRow): NotificationDTO {
  return {
    id: row.id,
    userId: row.userId,
    householdId: row.householdId,
    type: row.type,
    category: deriveCategory(row.type),
    payload: (row.payload as Record<string, unknown>) ?? {},
    readAt: row.readAt ? row.readAt.toISOString() : null,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
