/**
 * Two-household fixture for tenancy invariant tests.
 *
 * Creates two fully isolated households (H_A, H_B), one user per household,
 * one HouseholdMember (OWNER) per household, and one Account row per
 * household. Returns the IDs so callers can assert per-op cross-tenant
 * isolation.
 *
 * IMPORTANT: this helper bypasses the household-scope extension by writing
 * via raw SQL (it has to — there is no `requestContext` to scope against
 * before the fixture exists). It deliberately uses `prisma.$executeRaw`
 * rather than the model delegates so the writes never trip the extension's
 * "no household context" guard.
 */

import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { PrismaClient } from '@prisma/client';
import { ulid } from 'ulid';

import { hmacRefresh } from '../../src/common/hash';

export interface TenancyFixture {
  householdAId: string;
  householdBId: string;
  userAId: string;
  userBId: string;
  memberAId: string;
  memberBId: string;
  accountAId: string;
  accountBId: string;
}

export async function seedTwoHouseholds(
  prisma: PrismaClient,
): Promise<TenancyFixture> {
  const householdAId = ulid();
  const householdBId = ulid();
  const userAId = ulid();
  const userBId = ulid();
  const memberAId = ulid();
  const memberBId = ulid();
  const accountAId = ulid();
  const accountBId = ulid();

  // Users
  await prisma.$executeRawUnsafe(
    `INSERT INTO users (id, email) VALUES ($1, $2), ($3, $4)`,
    userAId,
    'user+a@test.local',
    userBId,
    'user+b@test.local',
  );

  // Households
  await prisma.$executeRawUnsafe(
    `INSERT INTO households (id, name, default_currency_code, created_by, updated_by)
     VALUES ($1, $2, 'USD', $3, $3), ($4, $5, 'USD', $6, $6)`,
    householdAId,
    'Household A',
    userAId,
    householdBId,
    'Household B',
    userBId,
  );

  // Household members
  await prisma.$executeRawUnsafe(
    `INSERT INTO household_members (id, household_id, user_id, role)
     VALUES ($1, $2, $3, 'OWNER'), ($4, $5, $6, 'OWNER')`,
    memberAId,
    householdAId,
    userAId,
    memberBId,
    householdBId,
    userBId,
  );

  // One Account per household
  await prisma.$executeRawUnsafe(
    `INSERT INTO accounts
       (id, household_id, nickname, type, currency_code, created_by, updated_by)
     VALUES
       ($1, $2, $3, 'CASH', 'USD', $4, $4),
       ($5, $6, $7, 'CASH', 'USD', $8, $8)`,
    accountAId,
    householdAId,
    'Wallet A',
    userAId,
    accountBId,
    householdBId,
    'Wallet B',
    userBId,
  );

  return {
    householdAId,
    householdBId,
    userAId,
    userBId,
    memberAId,
    memberBId,
    accountAId,
    accountBId,
  };
}

export interface SeededAuthedUser {
  userId: string;
  sessionId: string;
  email: string;
  householdId: string;
  /** Bearer access token (no `Bearer ` prefix). */
  accessToken: string;
}

/**
 * Seed one User + default Household (OWNER membership) + Session, and mint
 * an access JWT signed with the active `JWT_ACCESS_SECRET`. The token is
 * accepted by the global `JwtAuthGuard`; pair it with `X-Household-Id` so
 * `HouseholdHeaderGuard` resolves tenant context.
 *
 * Used by the idempotency test pack to drive `POST /api/v1/accounts` as a
 * real authenticated user without standing up the OTP flow.
 */
export async function seedAuthedUser(
  app: INestApplication,
  prisma: PrismaClient,
  options: { email?: string; householdName?: string } = {},
): Promise<SeededAuthedUser> {
  const userId = ulid();
  const sessionId = ulid();
  const householdId = ulid();
  const email = options.email ?? `u-${userId.toLowerCase()}@test.local`;

  await prisma.$executeRawUnsafe(
    `INSERT INTO users (id, email, primary_currency_code) VALUES ($1, $2, 'USD')`,
    userId,
    email,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO households (id, name, default_currency_code, created_by, updated_by)
     VALUES ($1, $2, 'USD', $3, $3)`,
    householdId,
    options.householdName ?? 'Test Household',
    userId,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO household_members (id, household_id, user_id, role)
     VALUES ($1, $2, $3, 'OWNER')`,
    ulid(),
    householdId,
    userId,
  );

  // Persist a session so the JWT's `sid` claim references a real row. The
  // refresh hash isn't exercised by the access path; it just satisfies the
  // NOT-NULL + UNIQUE constraint on `refresh_token_hash`.
  const refreshSecret = ulid() + ulid();
  await prisma.$executeRawUnsafe(
    `INSERT INTO sessions (id, user_id, refresh_token_hash, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '30 days')`,
    sessionId,
    userId,
    hmacRefresh(refreshSecret),
  );

  const jwt = app.get(JwtService);
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET not configured for tests');
  const accessToken = jwt.sign(
    { sub: userId, sid: sessionId, typ: 'access' },
    { secret, expiresIn: 15 * 60 },
  );

  return { userId, sessionId, email, householdId, accessToken };
}
