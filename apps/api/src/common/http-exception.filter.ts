import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';
import type { Request, Response } from 'express';

type ErrorBody = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  private readonly isProd: boolean;

  constructor(@Optional() @Inject(ConfigService) config?: ConfigService) {
    this.isProd = config?.get<string>('NODE_ENV') === 'production';
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const correlationId =
      (req.headers['x-correlation-id'] as string | undefined) ?? 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorBody = {
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
    };

    // Zod validation exceptions — emit VALIDATION_ERROR with flattened details.
    if (exception instanceof ZodValidationException) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
      body = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed.',
          details: (exception.getZodError() as ZodError).flatten() as unknown as Record<
            string,
            unknown
          >,
        },
      };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp = exception.getResponse();
      if (typeof resp === 'string') {
        body = { error: { code: codeForStatus(status), message: resp } };
      } else if (resp && typeof resp === 'object') {
        const r = resp as Record<string, unknown>;
        body = {
          error: {
            code: (r.code as string | undefined) ?? codeForStatus(status),
            message:
              (r.message as string | undefined) ?? codeForStatus(status),
            details:
              (r.details as Record<string, unknown> | undefined) ?? undefined,
          },
        };
      }

      if (status >= 500) {
        const msg =
          exception instanceof Error
            ? exception.message
            : String(exception);
        this.logger.error(
          { correlationId, msg },
          `[${correlationId}] ${msg}`,
        );
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        {
          correlationId,
          msg: exception.message,
          ...(!this.isProd && { stack: exception.stack }),
        },
        `[${correlationId}] ${exception.message}`,
      );
    }

    res.status(status).json(body);
  }
}

function codeForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 422:
      return 'UNPROCESSABLE_ENTITY';
    case 429:
      return 'RATE_LIMITED';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'ERROR';
  }
}
