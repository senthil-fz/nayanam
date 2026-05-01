import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { requestContext, type AuthContext } from '../common/context';
import { Errors } from '../common/errors';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Guard that:
 *  1. Short-circuits for routes marked `@Public()` (e.g. health, OTP request/verify, refresh).
 *  2. Validates the access JWT via Passport.
 *  3. Pushes AuthContext into AsyncLocalStorage so downstream services + Prisma middleware see it.
 *
 * Registered globally via `APP_GUARD` in `AppModule` so authentication is
 * default-on for every controller. Opt out with `@Public()` only.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt-access') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const ok = (await super.canActivate(ctx)) as boolean;
    if (!ok) return false;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthContext }>();
    const user = req.user;
    if (!user) throw Errors.authTokenInvalid();

    const store = requestContext.getStore();
    if (store) store.auth = user;

    return true;
  }
}
