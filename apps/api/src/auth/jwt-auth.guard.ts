import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { requestContext, type AuthContext } from '../common/context';
import { Errors } from '../common/errors';

/**
 * Guard that:
 *  1. Validates the access JWT via Passport.
 *  2. Pushes AuthContext into AsyncLocalStorage so downstream services + Prisma middleware see it.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt-access') {
  override async canActivate(ctx: ExecutionContext): Promise<boolean> {
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
