import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { requestContext, type AuthContext } from '../common/context';
import { Errors } from '../common/errors';

/**
 * Route parameter :id must be a household the current user is a member of.
 * Pushes `householdId` + `householdRole` into ALS so Prisma middleware enforces scoping.
 * Apply AFTER JwtAuthGuard.
 */
@Injectable()
export class HouseholdMemberGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthContext; params: Record<string, string> }>();
    const user = req.user;
    if (!user) throw Errors.authTokenInvalid();

    const householdId = req.params.id ?? req.params.householdId;
    if (!householdId) throw Errors.householdNotFound();

    // Use findFirst with a relation filter to also assert the household has not
    // been soft-deleted (archived). findUnique cannot carry relation predicates,
    // so we switch to findFirst which is semantically equivalent on the composite
    // (householdId, userId) natural key. HouseholdMember is deliberately excluded
    // from HOUSEHOLD_SCOPED_MODELS so no extension guard fires here.
    const membership = await this.prisma.householdMember.findFirst({
      where: {
        householdId,
        userId: user.userId,
        household: { deletedAt: null },
      },
    });
    if (!membership) throw Errors.householdNotFound();

    const store = requestContext.getStore();
    if (store) {
      store.householdId = householdId;
      store.householdRole = membership.role;
    }
    return true;
  }
}

export function requireRole(role: string, allowed: string[]): boolean {
  return allowed.includes(role);
}
