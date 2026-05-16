import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { Errors } from './errors';
import { IdempotencyInterceptor } from './idempotency.interceptor';

/**
 * Variant of `IdempotencyInterceptor` that **requires** the `Idempotency-Key`
 * header. Endpoints decorated with this interceptor will return
 * `400 IDEMPOTENCY_KEY_MISSING` when the header is absent rather than silently
 * proceeding without replay protection.
 *
 * Use on endpoints where duplicate execution is particularly dangerous — e.g.
 * `POST /transactions` and `POST /transfers`.
 */
@Injectable()
export class MandatoryIdempotencyInterceptor
  extends IdempotencyInterceptor
  implements NestInterceptor
{
  override intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const req = context
      .switchToHttp()
      .getRequest<Request>();

    const rawKey =
      req.header('idempotency-key') ?? req.header('Idempotency-Key');

    if (!rawKey?.trim()) {
      throw Errors.idempotencyKeyMissing();
    }

    return super.intercept(context, next);
  }
}
