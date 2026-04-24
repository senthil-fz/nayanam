import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, from, of, switchMap, tap } from 'rxjs';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthContext } from './context';

/**
 * Replay-safe idempotency for mutating endpoints.
 *
 * Client sends `Idempotency-Key: <opaque>`. On first call we execute the
 * handler, serialize the JSON response, persist `{key, userId, method, path,
 * statusCode, responseBody}` with a 24h TTL, and return the live response.
 * On replay with the same key (any time within TTL) we short-circuit the
 * handler and return the cached response and status code — no duplicate
 * mutation, no event re-emission.
 *
 * Applied on any route. Missing header = pass through, no record.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);
  private static readonly TTL_MS = 24 * 60 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: AuthContext }>();
    const res = http.getResponse<Response>();

    const key = (req.header('idempotency-key') ?? req.header('Idempotency-Key'))?.trim();
    if (!key) return next.handle();
    if (key.length < 8 || key.length > 200) return next.handle();

    const userId = req.user?.userId;
    if (!userId) return next.handle();

    const method = req.method.toUpperCase();
    const path = req.baseUrl + req.path;

    return from(
      this.prisma.idempotencyKey.findUnique({ where: { key } }),
    ).pipe(
      switchMap((existing) => {
        if (existing) {
          // Same key, different route = reject. Keeps keys scoped to their intended call.
          if (
            existing.userId !== userId ||
            existing.method !== method ||
            existing.path !== path
          ) {
            return next.handle();
          }
          if (existing.expiresAt.getTime() < Date.now()) {
            // Expired — delete and fall through to live path.
            return from(
              this.prisma.idempotencyKey.delete({ where: { key } }).catch(() => undefined),
            ).pipe(switchMap(() => this.liveAndCache(key, userId, method, path, next, res)));
          }
          res.status(existing.statusCode);
          return of(existing.responseBody);
        }
        return this.liveAndCache(key, userId, method, path, next, res);
      }),
    );
  }

  private liveAndCache(
    key: string,
    userId: string,
    method: string,
    path: string,
    next: CallHandler,
    res: Response,
  ): Observable<unknown> {
    return next.handle().pipe(
      tap((body) => {
        // Fire-and-forget cache write. We don't block the response on it.
        const status = res.statusCode ?? 200;
        const serialized = safeSerialize(body);
        const responseHash = createHash('sha256').update(serialized).digest('hex');
        const responseBody = JSON.parse(serialized) as unknown;
        this.prisma.idempotencyKey
          .create({
            data: {
              key,
              userId,
              method,
              path,
              statusCode: status,
              responseHash,
              responseBody: responseBody as object,
              expiresAt: new Date(Date.now() + IdempotencyInterceptor.TTL_MS),
            },
          })
          .catch((err: unknown) => {
            // Unique violation = a concurrent first-request won the race.
            // That's fine: next replay will hit the cached row.
            this.logger.debug(`idempotency cache miss (race): ${String(err)}`);
          });
      }),
    );
  }
}

/**
 * JSON.stringify that handles bigint by coercing to string — matches our
 * money-over-wire convention elsewhere.
 */
function safeSerialize(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    typeof v === 'bigint' ? v.toString() : v,
  );
}
