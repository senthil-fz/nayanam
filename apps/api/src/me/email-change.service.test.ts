/**
 * Unit tests for EmailChangeService — H7 regression.
 *
 * H7: The hourly send budget must count Event rows of type
 *     USER_EMAIL_CHANGE_REQUESTED (not emailChangeRequest rows), because
 *     sends reuse the same pending row via UPDATE rather than INSERT,
 *     so counting emailChangeRequest rows would never reflect true send
 *     frequency.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set required env vars before any module is imported.
process.env.OTP_PEPPER = 'test-otp-pepper-padding-padding-padding-padding-32';

// Mock mail service so tests don't need SMTP.
const mailMock = {
  sendEmailChangeOtp: vi.fn().mockResolvedValue(undefined),
};

// We need EventType — import the real enum.
vi.mock('../common/context', () => ({
  getHouseholdOrThrow: vi.fn(() => 'HH-TEST'),
  getAuthOrThrow: vi.fn(() => ({ userId: 'USER-1' })),
  getContext: vi.fn(() => ({ householdId: 'HH-TEST', auth: { userId: 'USER-1' } })),
}));

function buildPrisma(eventCountOverride: number) {
  // Tx object: needs householdMember for recordUserEvent (which looks up any
  // household when householdId is null) and $executeRaw for the INSERT INTO events.
  const tx = {
    emailChangeRequest: {
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    householdMember: {
      findFirst: vi.fn().mockResolvedValue({ householdId: 'HH-TEST' }),
    },
    $executeRaw: vi.fn().mockResolvedValue(1),
  };

  return {
    user: {
      findFirst: vi.fn().mockResolvedValue(null), // email not in use
      findUnique: vi.fn().mockResolvedValue({ id: 'USER-1', email: 'old@example.com' }),
      update: vi.fn().mockResolvedValue({}),
    },
    emailChangeRequest: {
      // count must NOT be used for the hourly budget — only event.count should be.
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null), // no pending request
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    event: {
      // This IS the hourly budget gate.
      count: vi.fn().mockResolvedValue(eventCountOverride),
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn(tx);
    }),
  };
}

describe('EmailChangeService.request — H7 hourly send budget', () => {
  beforeEach(() => {
    mailMock.sendEmailChangeOtp.mockClear();
  });

  it('uses event.count for hourly budget check, NOT emailChangeRequest.count', async () => {
    const prisma = buildPrisma(0);

    const { EmailChangeService } = await import('./email-change.service.js');
    // @ts-expect-error — direct instantiation bypasses DI
    const svc = new EmailChangeService(prisma, mailMock);

    await svc.request('USER-1', 'new@example.com');

    // event.count MUST have been called with actorId + type filter
    expect(prisma.event.count).toHaveBeenCalledOnce();
    const eventCountArgs = prisma.event.count.mock.calls[0]?.[0] as Record<string, unknown>;
    expect((eventCountArgs?.['where'] as Record<string, unknown>)?.['actorId']).toBe('USER-1');
    expect(
      (eventCountArgs?.['where'] as Record<string, unknown>)?.['type'],
    ).toBe('user.email_change_requested');

    // emailChangeRequest.count must NOT have been called for the budget check.
    expect(prisma.emailChangeRequest.count).not.toHaveBeenCalled();
  });

  it('throws emailChangeCooldown when hourly event count >= 5', async () => {
    const prisma = buildPrisma(5);

    const { EmailChangeService } = await import('./email-change.service.js');
    // @ts-expect-error — direct instantiation
    const svc = new EmailChangeService(prisma, mailMock);

    await expect(svc.request('USER-1', 'new@example.com')).rejects.toMatchObject({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      response: expect.objectContaining({ code: 'EMAIL_CHANGE_COOLDOWN' }),
    });

    // No email should have been sent.
    expect(mailMock.sendEmailChangeOtp).not.toHaveBeenCalled();
  });

  it('allows request when hourly event count is exactly 4 (< 5)', async () => {
    const prisma = buildPrisma(4);

    const { EmailChangeService } = await import('./email-change.service.js');
    // @ts-expect-error — direct instantiation
    const svc = new EmailChangeService(prisma, mailMock);

    const result = await svc.request('USER-1', 'new@example.com');
    expect(result).toHaveProperty('expiresInSeconds');
    expect(mailMock.sendEmailChangeOtp).toHaveBeenCalledOnce();
  });
});
