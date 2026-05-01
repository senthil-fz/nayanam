/**
 * Tests for the audited `crossTenant(reason, fn)` primitive on
 * `PrismaService`. This is the ONE named bypass of household scoping; it is
 * for schedulers and other batch jobs that must read across all tenants.
 *
 * Invariants enforced here:
 *   1. Without `requestContext` AND outside `crossTenant`, a household-scoped
 *      read THROWS `HOUSEHOLD_SCOPE_VIOLATION`. Production code never lands
 *      in this state by accident; the test pins the contract.
 *   2. Inside `crossTenant`, the same read succeeds and returns rows from
 *      EVERY household.
 *   3. Every `crossTenant` invocation logs the supplied reason string so the
 *      bypass is auditable in production.
 */

import { Logger } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

import { PrismaService } from '../../src/prisma/prisma.service';
import { seedTwoHouseholds, type TenancyFixture } from '../fixtures/households';
import { createTestApp, truncateAll, type TestAppHandle } from '../setup';

describe('PrismaService.crossTenant', () => {
  let handle: TestAppHandle;
  let fx: TenancyFixture;

  beforeAll(async () => {
    handle = await createTestApp();
  });

  afterAll(async () => {
    await handle?.close();
  });

  beforeEach(async () => {
    await truncateAll(handle.prisma);
    fx = await seedTwoHouseholds(handle.prisma);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('without context and without crossTenant, household-scoped read throws HOUSEHOLD_SCOPE_VIOLATION', async () => {
    await expect(handle.prisma.account.findMany({})).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'HOUSEHOLD_SCOPE_VIOLATION' }),
    });
  });

  it('inside crossTenant, the read succeeds and returns rows from BOTH households', async () => {
    const prismaService = handle.app.get(PrismaService);

    const rows = await prismaService.crossTenant(
      'test:tenancy-invariants',
      async (raw: PrismaClient) => raw.account.findMany({}),
    );

    expect(rows).toHaveLength(2);
    const ids = rows.map((r) => r.id).sort();
    expect(ids).toEqual([fx.accountAId, fx.accountBId].sort());

    const householdIds = new Set(rows.map((r) => r.householdId));
    expect(householdIds.has(fx.householdAId)).toBe(true);
    expect(householdIds.has(fx.householdBId)).toBe(true);
  });

  it('crossTenant logs the supplied reason string for audit', async () => {
    const prismaService = handle.app.get(PrismaService);
    const logSpy = vi.spyOn(Logger.prototype, 'log');

    await prismaService.crossTenant(
      'test:audited-reason-string',
      async (raw: PrismaClient) => raw.account.findMany({}),
    );

    // Find the call whose first arg is an object carrying the reason.
    const matching = logSpy.mock.calls.find((call) => {
      const arg = call[0];
      return (
        arg !== null &&
        typeof arg === 'object' &&
        (arg as { msg?: unknown }).msg === 'crossTenant.invoked' &&
        (arg as { reason?: unknown }).reason === 'test:audited-reason-string'
      );
    });

    expect(matching).toBeDefined();
  });
});
