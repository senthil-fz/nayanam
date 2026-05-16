import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { Observable, from, switchMap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { canonicalJSON } from './canonicalize';
import type { AuthContext } from './context';
import { Errors } from './errors';
import { sha256Hex } from './hash';

/**
 * Replay-safe idempotency for mutating endpoints.
 *
 * Behavior contract (Phase 11 hardening):
 *   - Header `Idempotency-Key` is REQUIRED only by upstream decorators; this
 *     interceptor passes through if absent.
 *   - The cache row is keyed on the composite `(userId, key)` so the same
 *     opaque key sent by two different users never collides.
 *   - On every mutating call we compute `requestHash = sha256Hex(canonicalJSON
 *     (body))` and store it. On replay we compare hashes:
 *       * match (and same method+path)  → return the cached response + status
 *       * mismatch (or method/path drift) → 409 IDEMPOTENCY_CONFLICT
 *     This protects clients from the classic "I retried with edits" footgun.
 *   - Expired rows are deleted lazily on read in addition to the hourly reaper.
 *   - Request-hash uses bare SHA-256: this is a non-secret fingerprint, an
 *     attacker who could read the DB already has the body (`responseBody`
 *     column). HMAC would buy nothing. See `common/hash.ts` docstring.
 *
 * Pass-through cases (no record created, no replay):
 *   - No `Idempotency-Key` header.
 *   - No authenticated user on the request.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);
  private static readonly TTL_MS = 24 * 60 * 60 * 1000;
  private static readonly KEY_MIN = 8;
  private static readonly KEY_MAX = 200;

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: AuthContext }>();
    const res = http.getResponse<Response>();

    const rawKey = req.header('idempotency-key') ?? req.header('Idempotency-Key');
    const key = rawKey?.trim();
    if (!key) return next.handle();

    if (key.length < IdempotencyInterceptor.KEY_MIN || key.length > IdempotencyInterceptor.KEY_MAX) {
      throw Errors.idempotencyKeyInvalid({ keyLength: key.length });
    }

    const userId = req.user?.userId;
    if (!userId) return next.handle();

    const method = req.method.toUpperCase();
    const path = (req.baseUrl ?? '') + (req.path ?? '');
    // Fold X-Household-Id into the hash so that the same (userId, key) pair
    // across different households returns IDEMPOTENCY_CONFLICT rather than
    // replaying household-A's cached response for a household-B request.
    // Uses the empty string when the header is absent (non-household endpoints)
    // for consistent behaviour.
    const householdId =
      req.header('x-household-id') ?? req.header('X-Household-Id') ?? '';
    const requestHash = sha256Hex(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      canonicalJSON({ body: req.body ?? {}, householdId }),
    );

    return from(
      this.prisma.idempotencyKey.findUnique({
        where: { userId_key: { userId, key } },
      }),
    ).pipe(
      switchMap((existing) => {
        if (existing) {
          if (existing.expiresAt.getTime() < Date.now()) {
            // Expired — drop the stale row and proceed as a fresh insert-before-execute.
            return from(
              this.prisma.idempotencyKey
                .delete({ where: { userId_key: { userId, key } } })
                .catch(() => undefined),
            ).pipe(
              switchMap(() =>
                this.insertBeforeExecute(key, userId, method, path, requestHash, next, res),
              ),
            );
          }

          // Live row. Same key MUST mean same request — including method, path,
          // and body. Any drift means the client reused a key by accident: 409.
          if (
            existing.requestHash !== requestHash ||
            existing.method !== method ||
            existing.path !== path
          ) {
            throw Errors.idempotencyConflict();
          }

          // statusCode === 0 means a prior request is still in-flight.
          if (existing.statusCode === 0) {
            throw Errors.idempotencyInFlight();
          }

          res.status(existing.statusCode);
          return from(Promise.resolve(existing.responseBody));
        }
        return this.insertBeforeExecute(key, userId, method, path, requestHash, next, res);
      }),
    );
  }

  /**
   * Insert-before-execute: reserve the `(userId, key)` slot with a placeholder
   * row (statusCode = 0, responseBody = null) BEFORE calling the handler. The
   * unique constraint on `(userId, key)` acts as a distributed mutex so at most
   * one handler fires per key.
   *
   *   INSERT succeeds  → execute handler → UPDATE row with real response.
   *   INSERT fails P2002 → concurrent request holds the slot:
   *     - statusCode > 0  → completed, replay the cached response.
   *     - statusCode = 0  → still in-flight, return 409 IDEMPOTENCY_IN_FLIGHT.
   */
  private insertBeforeExecute(
    key: string,
    userId: string,
    method: string,
    path: string,
    requestHash: string,
    next: CallHandler,
    res: Response,
  ): Observable<unknown> {
    const expiresAt = new Date(Date.now() + IdempotencyInterceptor.TTL_MS);

    const reservePromise = this.prisma.idempotencyKey
      .create({
        data: {
          key,
          userId,
          method,
          path,
          statusCode: 0,
          requestHash,
          responseBody: Prisma.JsonNull,
          expiresAt,
        },
      })
      .then(() => true as const)
      .catch(async (err: unknown) => {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          // Another request holds (or held) the slot.
          const concurrent = await this.prisma.idempotencyKey.findUnique({
            where: { userId_key: { userId, key } },
          });
          if (!concurrent) {
            // Row was deleted between the failed insert and the re-read
            // (e.g. expiry reaper). Treat as a miss and let the caller retry
            // from scratch — safest option is to surface in-flight so the
            // client backs off briefly.
            throw Errors.idempotencyInFlight();
          }
          if (concurrent.statusCode > 0) {
            // Completed by the winning request — replay.
            return { replay: true, row: concurrent } as const;
          }
          // Still in-flight.
          throw Errors.idempotencyInFlight();
        }
        throw err;
      });

    return from(reservePromise).pipe(
      switchMap((result) => {
        // Replay path — re-read won the insert race and already completed.
        if (result !== true) {
          res.status(result.row.statusCode);
          return from(Promise.resolve(result.row.responseBody));
        }

        // We hold the slot. Execute the handler, then commit the real response.
        return from(
          new Promise<unknown>((resolve, reject) => {
            next
              .handle()
              .subscribe({
                next: (body) => resolve(body),
                // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
                error: (err: unknown) => reject(err),
              });
          }).then(async (body) => {
            const status = res.statusCode ?? 200;
            const serialized = safeSerialize(body);
            const responseBody = JSON.parse(serialized) as unknown;
            await this.prisma.idempotencyKey.update({
              where: { userId_key: { userId, key } },
              data: {
                statusCode: status,
                responseBody: responseBody as object,
              },
            });
            return body;
          }).catch(async (err: unknown) => {
            // Handler threw — delete the placeholder so the client can retry
            // with the same key (the mutation never ran to completion).
            await this.prisma.idempotencyKey
              .delete({ where: { userId_key: { userId, key } } })
              .catch((deleteErr: unknown) => {
                this.logger.error(
                  `idempotency placeholder cleanup failed for user=...${userId.slice(-4)} key=${key}: ${stringifyErr(deleteErr)}`,
                );
              });
            throw err;
          }),
        );
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

function stringifyErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
