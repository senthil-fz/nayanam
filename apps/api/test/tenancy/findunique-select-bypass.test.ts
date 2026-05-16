/**
 * Regression test for Finding 4: findUnique with a narrow `select` that omits
 * `householdId` must still throw HOUSEHOLD_SCOPE_VIOLATION on a cross-tenant
 * lookup rather than silently returning the cross-tenant row.
 *
 * Before the fix, if `args.select` did not include `householdId`, the
 * post-query assertion would see `rowHh === undefined` and pass silently
 * (the `typeof rowHh === 'string'` guard was falsy). After the fix, the
 * extension merges `householdId: true` into `select` before the query,
 * asserts, then strips the field if the caller didn't ask for it.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { requestContext } from '../../src/common/context';
import { seedTwoHouseholds, type TenancyFixture } from '../fixtures/households';
import { createTestApp, truncateAll, type TestAppHandle } from '../setup';

describe('PrismaService findUnique — select-without-householdId bypass (Finding 4)', () => {
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

  function asHouseholdA<T>(fn: () => Promise<T>): Promise<T> {
    return requestContext.run(
      {
        auth: { userId: fx.userAId, sessionId: 'test-session' },
        householdId: fx.householdAId,
        householdRole: 'OWNER',
      },
      fn,
    );
  }

  it('findUnique with select omitting householdId on cross-tenant id throws HOUSEHOLD_SCOPE_VIOLATION', async () => {
    // Household A context, but looking up an account owned by Household B,
    // with a narrow select that does NOT include householdId.
    // Before the fix: rowHh === undefined → typeof check was false → silently
    // returned cross-tenant row. After fix: throws.
    await expect(
      asHouseholdA(() =>
        handle.prisma.account.findUnique({
          where: { id: fx.accountBId },
          select: { id: true, nickname: true },
        }),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'HOUSEHOLD_SCOPE_VIOLATION' }),
    });
  });

  it('findUnique without select (full row) still throws on cross-tenant id', async () => {
    // Full row select — householdId is always present in the result, so the
    // existing assertion path (no injection needed) must also work.
    await expect(
      asHouseholdA(() =>
        handle.prisma.account.findUnique({ where: { id: fx.accountBId } }),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'HOUSEHOLD_SCOPE_VIOLATION' }),
    });
  });
});
