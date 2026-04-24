import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthContext } from '../common/context';

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<{ user: AuthContext }>();
  return req.user;
});
