import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { requestContext } from './context';

/**
 * Initializes the AsyncLocalStorage store for each incoming request.
 * The JWT guard later populates `ctx.auth`; the household guard populates `ctx.householdId`.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(_req: Request, _res: Response, next: NextFunction) {
    requestContext.run({}, () => next());
  }
}
