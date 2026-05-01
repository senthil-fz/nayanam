import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiClient, type ApiClient, type TokenProvider } from '../src/api/client';

/**
 * Phase 11 hardening — task-019.
 *
 * Verifies that the Idempotency-Key plumbing added in task-011 actually
 * reaches the wire on every wrapper that accepts an `idempotencyKey?` arg.
 *
 * For each wrapper we run two assertions:
 *   1. omitted  -> no `idempotency-key` header on the outgoing request.
 *   2. provided -> `idempotency-key` equals the supplied value (case-insensitive
 *      header lookup, since fetch's HeadersInit may normalise casing).
 *
 * The fetch transport is replaced with a spy that records the (url, init) pair
 * and replies with HTTP 204 — no response body parsing, no auth retry path.
 */

type CapturedCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
};

function emptyTokens(): TokenProvider {
  return {
    getAccessToken: () => null,
    getRefreshToken: () => null,
    setTokens: () => {},
    onUnauthenticated: () => {},
  };
}

function normaliseHeaders(init: RequestInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = init?.headers;
  if (!raw) return out;
  if (raw instanceof Headers) {
    raw.forEach((value, key) => {
      out[key.toLowerCase()] = value;
    });
    return out;
  }
  if (Array.isArray(raw)) {
    for (const entry of raw as ReadonlyArray<readonly [string, string]>) {
      out[entry[0].toLowerCase()] = entry[1];
    }
    return out;
  }
  for (const [k, v] of Object.entries(raw as Record<string, string>)) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

describe('apiClient — Idempotency-Key forwarding', () => {
  let client: ApiClient;
  let calls: CapturedCall[];
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    calls = [];
    // Replace fetch with a recording stub that always returns 204.
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === 'string' ? input : input.toString();
        calls.push({
          url,
          method: init?.method ?? 'GET',
          headers: normaliseHeaders(init),
        });
        return new Response(null, { status: 204 });
      },
    );

    client = createApiClient({
      baseUrl: 'http://api.test',
      tokens: emptyTokens(),
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  /**
   * Run a wrapper twice — once without and once with an idempotency key — and
   * assert the resulting fetch headers. Centralising this loop keeps the
   * per-wrapper rows below readable as a coverage table.
   */
  async function expectIdempotencyForwarding(
    label: string,
    invokeWithoutKey: () => Promise<unknown>,
    invokeWithKey: (key: string) => Promise<unknown>,
  ): Promise<void> {
    calls.length = 0;
    await invokeWithoutKey();
    expect(calls, `${label}: omitted call did not reach fetch`).toHaveLength(1);
    const omitted = calls[0]!;
    expect(
      omitted.headers['idempotency-key'],
      `${label}: header should be absent when key omitted`,
    ).toBeUndefined();

    calls.length = 0;
    const key = `idem-${label}-${Math.random().toString(36).slice(2, 10)}`;
    await invokeWithKey(key);
    expect(calls, `${label}: keyed call did not reach fetch`).toHaveLength(1);
    const keyed = calls[0]!;
    expect(
      keyed.headers['idempotency-key'],
      `${label}: header should equal supplied key`,
    ).toBe(key);
  }

  // --- Auth ----------------------------------------------------------------

  it('authOtpRequest forwards Idempotency-Key', async () => {
    await expectIdempotencyForwarding(
      'authOtpRequest',
      () => client.authOtpRequest('user@test.dev'),
      (key) => client.authOtpRequest('user@test.dev', key),
    );
  });

  it('authOtpVerify forwards Idempotency-Key', async () => {
    await expectIdempotencyForwarding(
      'authOtpVerify',
      () => client.authOtpVerify('user@test.dev', '123456'),
      (key) => client.authOtpVerify('user@test.dev', '123456', key),
    );
  });

  it('authLogout forwards Idempotency-Key', async () => {
    await expectIdempotencyForwarding(
      'authLogout',
      () => client.authLogout(),
      (key) => client.authLogout(key),
    );
  });

  it('authOtpVerifyForSecurity forwards Idempotency-Key', async () => {
    const body = { email: 'user@test.dev', code: '123456' };
    await expectIdempotencyForwarding(
      'authOtpVerifyForSecurity',
      () => client.authOtpVerifyForSecurity(body),
      (key) => client.authOtpVerifyForSecurity(body, key),
    );
  });

  // --- Push tokens ---------------------------------------------------------

  it('registerPushToken forwards Idempotency-Key', async () => {
    const body = { platform: 'ios' as const, token: 'abc', expoPushToken: null };
    await expectIdempotencyForwarding(
      'registerPushToken',
      () => client.registerPushToken(body),
      (key) => client.registerPushToken(body, key),
    );
  });

  it('deletePushToken forwards Idempotency-Key', async () => {
    await expectIdempotencyForwarding(
      'deletePushToken',
      () => client.deletePushToken('tok-1'),
      (key) => client.deletePushToken('tok-1', key),
    );
  });

  // --- Households ----------------------------------------------------------

  it('createHousehold forwards Idempotency-Key', async () => {
    const body = { name: 'Test Household' };
    await expectIdempotencyForwarding(
      'createHousehold',
      () => client.createHousehold(body),
      (key) => client.createHousehold(body, key),
    );
  });

  // --- Invites -------------------------------------------------------------

  it('createInvite forwards Idempotency-Key', async () => {
    const body = { email: 'invitee@test.dev', role: 'MEMBER' as const };
    await expectIdempotencyForwarding(
      'createInvite',
      () => client.createInvite('hh-1', body),
      (key) => client.createInvite('hh-1', body, key),
    );
  });

  it('revokeInvite forwards Idempotency-Key', async () => {
    await expectIdempotencyForwarding(
      'revokeInvite',
      () => client.revokeInvite('hh-1', 'inv-1'),
      (key) => client.revokeInvite('hh-1', 'inv-1', key),
    );
  });

  it('acceptInvite forwards Idempotency-Key', async () => {
    await expectIdempotencyForwarding(
      'acceptInvite',
      () => client.acceptInvite('token-xyz'),
      (key) => client.acceptInvite('token-xyz', key),
    );
  });

  // --- Loans ---------------------------------------------------------------

  it('computeLoan forwards Idempotency-Key', async () => {
    // Body shape isn't validated client-side, so an empty object is fine for
    // header-forwarding assertions. Cast through unknown to satisfy the typed
    // wrapper without depending on the exact ComputeLoanInput shape.
    const body = {} as Parameters<ApiClient['computeLoan']>[1];
    await expectIdempotencyForwarding(
      'computeLoan',
      () => client.computeLoan('loan-1', body),
      (key) => client.computeLoan('loan-1', body, key),
    );
  });

  // --- Security (PIN reset) ------------------------------------------------

  it('resetMePin forwards Idempotency-Key', async () => {
    const body = {} as Parameters<ApiClient['resetMePin']>[0];
    await expectIdempotencyForwarding(
      'resetMePin',
      () => client.resetMePin(body),
      (key) => client.resetMePin(body, key),
    );
  });
});
