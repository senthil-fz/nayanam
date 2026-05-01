import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { createTestApp, type TestAppHandle } from './setup';

describe('harness smoke', () => {
  let handle: TestAppHandle;

  beforeAll(async () => {
    handle = await createTestApp();
  });

  afterAll(async () => {
    await handle?.close();
  });

  it('GET /api/v1/health returns 200 with status=ok', async () => {
    const res = await request(handle.httpServer).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
    expect(typeof res.body.timestamp).toBe('string');
  });
});
