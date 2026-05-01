import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

/**
 * Daily sweep of abandoned `PENDING` attachments older than 24h.
 *
 * Advisory lock key `0xA77AC41` keeps multi-instance deployments from
 * double-running (pg_try_advisory_xact_lock scopes to the surrounding
 * transaction and auto-releases on commit/rollback).
 *
 * Rows are transitioned to `FAILED` (not soft-deleted) so the audit trail
 * preserves the failed upload. S3 delete is best-effort — the object may
 * never have been PUT.
 */
@Injectable()
export class AttachmentReaperService {
  private readonly logger = new Logger(AttachmentReaperService.name);
  static readonly ADVISORY_LOCK_KEY = 0xa77ac41;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async sweep(): Promise<void> {
    try {
      await this.prisma.crossTenant(
        'scheduler:attachment-reaper',
        async (raw) => {
          await raw.$transaction(async (tx) => {
            const lockRows = await tx.$queryRaw<Array<{ locked: boolean }>>`
              SELECT pg_try_advisory_xact_lock(${AttachmentReaperService.ADVISORY_LOCK_KEY}) AS locked
            `;
            if (!lockRows[0]?.locked) {
              this.logger.log('sweep skipped: advisory lock not acquired');
              return;
            }

            const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const stale = await tx.attachment.findMany({
              where: { status: 'PENDING', createdAt: { lt: cutoff } },
              select: { id: true, key: true },
              take: 500,
            });
            if (stale.length === 0) return;

            const ids = stale.map((r) => r.id);
            await tx.attachment.updateMany({
              where: { id: { in: ids } },
              data: { status: 'FAILED', updatedAt: new Date() },
            });

            // S3 deletes fire outside the transaction's critical section but
            // within the same outer promise — best-effort, ignore failures.
            this.bestEffortDelete(stale.map((r) => r.key));
            this.logger.log(
              `reaped ${stale.length} PENDING attachments older than 24h`,
            );
          });
        },
      );
    } catch (err) {
      this.logger.error(`reaper failed: ${String(err)}`);
    }
  }

  private bestEffortDelete(keys: string[]) {
    void Promise.allSettled(keys.map((k) => this.storage.deleteObject(k)));
  }
}
