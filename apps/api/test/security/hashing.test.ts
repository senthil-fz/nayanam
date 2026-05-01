import { describe, it, expect, vi } from 'vitest';

import {
  hmacOtp,
  hmacIp,
  hmacRefresh,
  sha256Hex,
  timingSafeEqualHex,
} from '../../src/common/hash';

/**
 * Phase 11 / task-016 — `hmacOtp` / `hmacIp` / `timingSafeEqualHex` regression
 * tests. These never touch the DB or Nest container; they're pure-function
 * checks against `apps/api/src/common/hash.ts`.
 *
 * The peppers required at module-eval time are seeded by `test/setup.ts`. Any
 * test that needs to FLIP a pepper does so with `vi.stubEnv` and reverts in
 * `afterEach` so sibling tests stay deterministic.
 */
describe('hmacOtp', () => {
  it('returns a deterministic 64-char hex string', () => {
    const a = hmacOtp('123456');
    const b = hmacOtp('123456');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs from a bare sha256 of the same input', () => {
    expect(hmacOtp('123456')).not.toBe(sha256Hex('123456'));
  });

  it('produces different hashes when OTP_PEPPER changes', () => {
    const original = hmacOtp('123456');

    vi.stubEnv('OTP_PEPPER', 'rotated-pepper-padding-padding-padding-32chars');
    try {
      const rotated = hmacOtp('123456');
      expect(rotated).not.toBe(original);
      expect(rotated).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('hmacIp', () => {
  it('is deterministic for a given SESSION_SALT', () => {
    expect(hmacIp('1.2.3.4')).toBe(hmacIp('1.2.3.4'));
  });

  it('produces different hashes when SESSION_SALT changes', () => {
    const original = hmacIp('1.2.3.4');

    vi.stubEnv('SESSION_SALT', 'rotated-salt-padding-padding-padding-padding-32');
    try {
      const rotated = hmacIp('1.2.3.4');
      expect(rotated).not.toBe(original);
      expect(rotated).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('hmacRefresh', () => {
  it('is deterministic: same input always produces the same 64-char hex', () => {
    const a = hmacRefresh('some-refresh-token');
    const b = hmacRefresh('some-refresh-token');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs from hmacOtp on the same input (different key pepper)', () => {
    const token = 'shared-input-value';
    expect(hmacRefresh(token)).not.toBe(hmacOtp(token));
  });

  it('output is a 64-character lowercase hex string', () => {
    const hash = hmacRefresh('any-token-value');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different inputs produce different outputs', () => {
    const a = hmacRefresh('token-alpha');
    const b = hmacRefresh('token-beta');
    expect(a).not.toBe(b);
  });

  it('rotated REFRESH_PEPPER produces a different hash for the same input', () => {
    const original = hmacRefresh('my-token');

    vi.stubEnv('REFRESH_PEPPER', 'rotated-refresh-pepper-padding-padding-32chars');
    try {
      const rotated = hmacRefresh('my-token');
      expect(rotated).not.toBe(original);
      expect(rotated).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('timingSafeEqualHex', () => {
  // Two distinct, equal-length, well-formed 64-char hex strings.
  const A = 'a'.repeat(64);
  const B = 'b'.repeat(64);

  it('returns true on byte-equal hex inputs', () => {
    expect(timingSafeEqualHex(A, A)).toBe(true);
  });

  it('returns false on byte-different hex inputs of equal length', () => {
    expect(timingSafeEqualHex(A, B)).toBe(false);
  });

  it('returns false (without throwing) on length mismatch', () => {
    expect(() => timingSafeEqualHex(A, 'a'.repeat(62))).not.toThrow();
    expect(timingSafeEqualHex(A, 'a'.repeat(62))).toBe(false);
  });

  it('returns false on non-hex / non-string inputs', () => {
    // @ts-expect-error — exercising the runtime guard.
    expect(timingSafeEqualHex(undefined, A)).toBe(false);
    // @ts-expect-error — exercising the runtime guard.
    expect(timingSafeEqualHex(null, null)).toBe(false);
  });

  // No global env mutation here; nothing to clean up.
});
