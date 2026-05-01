import { Module } from '@nestjs/common';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyReaperService } from './idempotency-reaper.service';

/**
 * Owns idempotency cross-cutting wiring:
 *  - `IdempotencyInterceptor` (still applied per-route via `@UseInterceptors`)
 *  - `IdempotencyReaperService` (hourly @Cron sweep of expired rows)
 *
 * Imported once from `AppModule` so the reaper's @Cron decorator is registered
 * with the schedule registry. Per-route interceptor providers in feature
 * modules continue to work; this module's existence does not change that.
 */
@Module({
  providers: [IdempotencyInterceptor, IdempotencyReaperService],
  exports: [IdempotencyInterceptor],
})
export class IdempotencyModule {}
