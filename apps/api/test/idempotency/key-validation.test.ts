import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { createTestApp, truncateAll, type TestAppHandle } from '../setup';
import { seedAuthedUser, type SeededAuthedUser } from '../fixtures/households';

/**
 * Key-length validation: the interceptor enforces an inclusive [8, 200]
 * character window on `Idempotency-Key`. Below or above MUST 400 with
 * `IDEMPOTENCY_KEY_INVALID`; the boundaries (8 and 200) MUST succeed.
 */
describe('idempotency: key validation', () => {
  let handle: TestAppHandle;
  let user: SeededAuthedUser;

  beforeAll(async () => {
    handle = await createTestApp();
  });

  afterAll(async () => {
    await handle?.close();
  });

  beforeEach(async () => {
    await truncateAll(handle.prisma);
    user = await seedAuthedUser(handle.app, handle.prisma);
  });

  function postWithKey(key: string, nickname: string) {
    return request(handle.httpServer)
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .set('X-Household-Id', user.householdId)
      .set('Idempotency-Key', key)
      .send({ nickname, type: 'CASH', currencyCode: 'USD' });
  }

  it('rejects a 7-char key with 400 IDEMPOTENCY_KEY_INVALID', async () => {
    const tooShort = 'a'.repeat(7);
    const res = await postWithKey(tooShort, 'short-key');
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('IDEMPOTENCY_KEY_INVALID');
  });

  it('rejects a 201-char key with 400 IDEMPOTENCY_KEY_INVALID', async () => {
    const tooLong = 'a'.repeat(201);
    const res = await postWithKey(tooLong, 'long-key');
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('IDEMPOTENCY_KEY_INVALID');
  });

  it('accepts the 8-char minimum boundary', async () => {
    const min = 'a'.repeat(8);
    const res = await postWithKey(min, 'min-key');
    expect(res.status).toBe(201);
  });

  it('accepts the 200-char maximum boundary', async () => {
    const max = 'a'.repeat(200);
    const res = await postWithKey(max, 'max-key');
    expect(res.status).toBe(201);
  });
});
