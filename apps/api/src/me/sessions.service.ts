import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Errors } from '../common/errors';

export type SessionSummary = {
  id: string;
  deviceName: string | null;
  deviceKind: 'web' | 'ios' | 'android' | 'other';
  lastSeenAt: string;
  ipAddressHash: string | null;
  createdAt: string;
  isCurrent: boolean;
};

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, currentSessionId: string): Promise<{ items: SessionSummary[] }> {
    const rows = await this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
    });
    return {
      items: rows.map((s) => ({
        id: s.id,
        deviceName: s.deviceName,
        deviceKind: (s.deviceKind as SessionSummary['deviceKind']) ?? 'other',
        lastSeenAt: s.lastSeenAt.toISOString(),
        ipAddressHash: s.ipAddressHash,
        createdAt: s.createdAt.toISOString(),
        isCurrent: s.id === currentSessionId,
      })),
    };
  }

  async revoke(userId: string, sessionId: string, currentSessionId: string): Promise<void> {
    if (sessionId === currentSessionId) throw Errors.sessionCurrentCannotRevoke();
    const row = await this.prisma.session.findFirst({ where: { id: sessionId, userId } });
    if (!row) throw Errors.notFound();
    if (row.revokedAt) return;
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllOthers(userId: string, currentSessionId: string): Promise<{ revokedCount: number }> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, NOT: { id: currentSessionId } },
      data: { revokedAt: new Date() },
    });
    return { revokedCount: result.count };
  }
}
