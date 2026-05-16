import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { requestContext, type AuthContext } from './context';
import { Errors } from './errors';

/**
 * Resolves household context from the `X-Household-Id` header (contract for
 * every tenant-scoped route that doesn't have `:householdId` in its path —
 * e.g. /accounts/**).
 *
 * - 401 if no auth context (must run AFTER JwtAuthGuard).
 * - 404 RESOURCE_NOT_FOUND if the user is not a member of the given household
 *   (deliberately collapsed so cross-tenant probing cannot distinguish
 *   "household exists" from "I'm not in it").
 * - On success, stamps `householdId` + `householdRole` onto the ALS store so
 *   the Prisma middleware enforces scoping on every query down-stack.
 */
@Injectable()
export class HouseholdHeaderGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthContext }>();
    const user = req.user;
    if (!user) throw Errors.authTokenInvalid();

    const householdId = (req.header('x-household-id') ?? req.header('X-Household-Id'))?.trim();
    if (!householdId) throw Errors.notFound('Missing X-Household-Id header.');

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
    if (!membership) throw Errors.notFound();

    const store = requestContext.getStore();
    if (store) {
      store.householdId = householdId;
      store.householdRole = membership.role;
    }
    return true;
  }
}

export type HouseholdRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

export const ROLE_RANK: Record<HouseholdRole, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

export function roleAtLeast(role: string, min: HouseholdRole): boolean {
  const r = ROLE_RANK[role as HouseholdRole];
  return typeof r === 'number' && r >= ROLE_RANK[min];
}
