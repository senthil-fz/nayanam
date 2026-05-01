import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Hourly sweep of expired `idempotency_keys` rows. The interceptor also drops
 * stale rows lazily on read, but a periodic sweep keeps the table small for
 * keys that are never replayed (the common case after a successful first
 * request). 24h TTL is enforced at write time.
 */
@Injectable()
export class IdempotencyReaperService {
  private readonly logger = new Logger(IdempotencyReaperService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sweep(): Promise<void> {
    try {
      const { count } = await this.prisma.idempotencyKey.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      if (count > 0) {
        this.logger.log(`reaped ${count} expired idempotency_keys row(s)`);
      }
    } catch (err) {
      this.logger.error(
        `idempotency reaper failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
