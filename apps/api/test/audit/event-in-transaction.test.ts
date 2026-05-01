import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type PrismaClient } from '@prisma/client';
import { ulid } from 'ulid';

import { createTestApp, truncateAll, type TestAppHandle } from '../setup';
import { HouseholdsService } from '../../src/households/households.service';
import { MeService } from '../../src/me/me.service';
import { EmailChangeService } from '../../src/me/email-change.service';
import { MailService } from '../../src/mail/mail.service';
import { hmacOtp } from '../../src/common/hash';

/**
 * Phase-11 task-018 — verify that audit-event inserts wrapped inside
 * `prisma.$transaction(async tx => …)` blocks roll back atomically with
 * the mutation that produced them.
 *
 * Strategy: spy on `prisma.$transaction` and replace its implementation
 * with one that runs the original callback to completion, then throws
 * BEFORE the implicit COMMIT. Postgres rolls back the whole tx,
 * including the `INSERT INTO events …` row recorded inside it. We then
 * assert that no `events` row of the expected type exists.
 *
 * This is stronger than triggering an unrelated downstream throw because
 * it proves the event row participates in the transaction even when the
 * `recordEvent*` call is the LAST statement in the callback (as is the
 * case for `households.create`).
 */
describe('audit events roll back with their transaction', () => {
  let handle: TestAppHandle;
  let households: HouseholdsService;
  let me: MeService;
  let emailChange: EmailChangeService;

  // A minimal pair of fixture users + an existing household where the
  // updateProfile / email-change tests need a user with a household.
  const userA = ulid();
  const userB = ulid();
  const seedHouseholdId = ulid();

  beforeAll(async () => {
    handle = await createTestApp({
      configure: (b) =>
        // Replace MailService with a no-op so createInvite / verify do not hit SMTP.
        b.overrideProvider(MailService).useValue({
          sendOtp: vi.fn<Parameters<MailService['sendOtp']>, ReturnType<MailService['sendOtp']>>().mockResolvedValue(undefined),
          sendInvite: vi.fn<Parameters<MailService['sendInvite']>, ReturnType<MailService['sendInvite']>>().mockResolvedValue(undefined),
          sendEmailChangeOtp: vi.fn<Parameters<MailService['sendEmailChangeOtp']>, ReturnType<MailService['sendEmailChangeOtp']>>().mockResolvedValue(undefined),
          sendEmailChangedNotice: vi.fn<Parameters<MailService['sendEmailChangedNotice']>, ReturnType<MailService['sendEmailChangedNotice']>>().mockResolvedValue(undefined),
          sendGeneric: vi.fn<Parameters<MailService['sendGeneric']>, ReturnType<MailService['sendGeneric']>>().mockResolvedValue(undefined),
        }),
    });
    households = handle.app.get(HouseholdsService);
    me = handle.app.get(MeService);
    emailChange = handle.app.get(EmailChangeService);
  });

  afterAll(async () => {
    await handle?.close();
  });

  beforeEach(async () => {
    await truncateAll(handle.prisma);

    // Re-seed a clean fixture set every test.
    await handle.prisma.user.createMany({
      data: [
        { id: userA, email: `a-${userA.toLowerCase()}@nayanam.test`, name: 'Alice' },
        { id: userB, email: `b-${userB.toLowerCase()}@nayanam.test`, name: 'Bob' },
      ],
    });
    await handle.prisma.household.create({
      data: {
        id: seedHouseholdId,
        name: 'Seed Household',
        defaultCurrencyCode: 'USD',
        createdBy: userA,
        updatedBy: userA,
      },
    });
    await handle.prisma.householdMember.create({
      data: {
        id: ulid(),
        householdId: seedHouseholdId,
        userId: userA,
        role: 'OWNER',
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Wrap PrismaService.$transaction so the FIRST invocation runs the
   * original callback to completion, then throws — forcing Postgres to
   * ROLLBACK. Subsequent calls in the same test pass through unchanged.
   */
  function arm$transactionRollback(): void {
    type TxFn = Parameters<PrismaClient['$transaction']>[0];
    type TxOptions = Parameters<PrismaClient['$transaction']>[1];

    const prisma = handle.prisma as unknown as {
      $transaction: (fn: TxFn, options?: TxOptions) => Promise<unknown>;
    };
    const original = prisma.$transaction.bind(prisma);
    let armed = true;
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: TxFn, options?: TxOptions) => {
      if (armed && typeof fn === 'function') {
        armed = false;
        return original(async (tx) => {
          await (fn as (t: typeof tx) => Promise<unknown>)(tx);
          throw new Error('forced-rollback (test)');
        }, options);
      }
      return original(fn, options);
    });
  }

  async function countEvents(type: string): Promise<number> {
    const rows = await handle.prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*)::bigint AS n FROM events WHERE type = ${type}
    `;
    return Number(rows[0]?.n ?? 0n);
  }

  // -------------------------------------------------------------------
  // household.created — HouseholdsService.create
  // -------------------------------------------------------------------
  describe('household.created (HouseholdsService.create)', () => {
    it('rolls back the event row when the transaction throws', async () => {
      arm$transactionRollback();
      await expect(households.create(userA, 'Doomed', 'USD')).rejects.toThrow(
        /forced-rollback/,
      );
      expect(await countEvents('household.created')).toBe(0);
    });

    it('persists exactly one event row on success', async () => {
      const hh = await households.create(userA, 'Sunny', 'USD');
      expect(hh.id).toBeDefined();
      expect(await countEvents('household.created')).toBe(1);
    });
  });

  // -------------------------------------------------------------------
  // household.invite_created — HouseholdsService.createInvite
  // -------------------------------------------------------------------
  describe('household.invite_created (HouseholdsService.createInvite)', () => {
    it('rolls back the event row when the transaction throws', async () => {
      arm$transactionRollback();
      await expect(
        households.createInvite(userA, seedHouseholdId, 'invitee@nayanam.test', 'MEMBER'),
      ).rejects.toThrow(/forced-rollback/);
      expect(await countEvents('household.invite_created')).toBe(0);
      // The invite row itself should also have been rolled back.
      const invites = await handle.prisma.householdInvite.count({
        where: { householdId: seedHouseholdId },
      });
      expect(invites).toBe(0);
    });

    it('persists exactly one event row on success', async () => {
      await households.createInvite(
        userA,
        seedHouseholdId,
        'invitee@nayanam.test',
        'MEMBER',
      );
      expect(await countEvents('household.invite_created')).toBe(1);
    });
  });

  // -------------------------------------------------------------------
  // user.profile_updated — MeService.updateProfile
  // -------------------------------------------------------------------
  describe('user.profile_updated (MeService.updateProfile)', () => {
    it('rolls back the event row when the transaction throws', async () => {
      arm$transactionRollback();
      await expect(me.updateProfile(userA, { name: 'Alice Renamed' })).rejects.toThrow(
        /forced-rollback/,
      );
      expect(await countEvents('user.profile_updated')).toBe(0);
      // The user row mutation should also be rolled back.
      const u = await handle.prisma.user.findUnique({ where: { id: userA } });
      expect(u?.name).toBe('Alice');
    });

    it('persists exactly one event row on success', async () => {
      await me.updateProfile(userA, { name: 'Alice Renamed' });
      expect(await countEvents('user.profile_updated')).toBe(1);
      const u = await handle.prisma.user.findUnique({ where: { id: userA } });
      expect(u?.name).toBe('Alice Renamed');
    });
  });

  // -------------------------------------------------------------------
  // user.email_changed — EmailChangeService.verify
  // -------------------------------------------------------------------
  describe('user.email_changed (EmailChangeService.verify)', () => {
    const otp = '123456';
    const newEmail = `new-${userA.toLowerCase()}@nayanam.test`;

    async function seedPendingChange(): Promise<void> {
      await handle.prisma.emailChangeRequest.create({
        data: {
          id: ulid(),
          userId: userA,
          newEmail,
          otpHash: hmacOtp(otp),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          lastSentAt: new Date(),
        },
      });
    }

    it('rolls back the event row when the transaction throws', async () => {
      await seedPendingChange();
      arm$transactionRollback();
      await expect(emailChange.verify(userA, otp)).rejects.toThrow(/forced-rollback/);
      expect(await countEvents('user.email_changed')).toBe(0);
      // The user email should be unchanged AND the request still un-consumed.
      const u = await handle.prisma.user.findUnique({ where: { id: userA } });
      expect(u?.email.toLowerCase()).not.toBe(newEmail);
      const req = await handle.prisma.emailChangeRequest.findFirst({
        where: { userId: userA },
      });
      expect(req?.consumedAt).toBeNull();
    });

    it('persists exactly one event row on success', async () => {
      await seedPendingChange();
      const out = await emailChange.verify(userA, otp);
      expect(out.email).toBe(newEmail);
      expect(await countEvents('user.email_changed')).toBe(1);
    });
  });
});
