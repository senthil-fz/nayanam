import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { requestContext } from './context';

/**
 * Initializes the AsyncLocalStorage store for each incoming request.
 * The JWT guard later populates `ctx.auth`; the household guard populates `ctx.householdId`.
 *
 * Correlation ID: reads `x-correlation-id` from the incoming request if present;
 * otherwise generates a fresh UUID. The value is echoed back on the response via
 * `x-correlation-id` so callers can correlate client-side and server-side log entries.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const correlationId =
      (req.headers['x-correlation-id'] as string | undefined) ??
      crypto.randomUUID();

    res.setHeader('x-correlation-id', correlationId);

    requestContext.run({ correlationId }, () => next());
  }
}
