import { describe, it, expect } from 'vitest';

import { randomOtp, randomToken } from '../../src/common/hash';

/**
 * Phase-11 task-014 — pure-function coverage for `randomOtp` and `randomToken`
 * from `apps/api/src/common/hash.ts`.
 *
 * No DB or Nest container involvement.
 */
describe('randomOtp', () => {
  it('returns a string of exactly 6 characters', () => {
    const otp = randomOtp();
    expect(typeof otp).toBe('string');
    expect(otp).toHaveLength(6);
  });

  it('contains only digit characters', () => {
    const otp = randomOtp();
    expect(otp).toMatch(/^\d{6}$/);
  });

  it('is zero-padded — values below 100000 still produce 6 digits', () => {
    // Run many calls; statistically at least one will be < 100000.
    // But we cannot force a low value from crypto randomness, so instead
    // we directly assert the formatting contract for a known low value by
    // inspecting the pad logic: if otp.length is always 6 after 1000 calls
    // then zero-padding is functioning.
    const lengths = Array.from({ length: 1000 }, () => randomOtp().length);
    expect(lengths.every((l) => l === 6)).toBe(true);
  });

  it('returns different values across successive calls (randomness check)', () => {
    const values = new Set(Array.from({ length: 100 }, () => randomOtp()));
    // With 1_000_000 possible values, 100 calls should yield well above 1 unique.
    expect(values.size).toBeGreaterThan(1);
  });

  it('all characters are ASCII decimal digits (0-9), no letters or symbols', () => {
    for (let i = 0; i < 50; i++) {
      const otp = randomOtp();
      for (const ch of otp) {
        const code = ch.charCodeAt(0);
        expect(code).toBeGreaterThanOrEqual(48); // '0'
        expect(code).toBeLessThanOrEqual(57);    // '9'
      }
    }
  });
});

describe('randomToken', () => {
  it('returns a string', () => {
    expect(typeof randomToken()).toBe('string');
  });

  it('matches base64url character set (no +, /, or = padding)', () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('default output is at least 32 characters long (32 random bytes encoded)', () => {
    // 32 raw bytes → 43 base64url chars (ceil(32*4/3), no padding).
    const token = randomToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
  });

  it('accepts a custom byte-length and produces proportionally longer output', () => {
    const short = randomToken(16);
    const long = randomToken(64);
    expect(long.length).toBeGreaterThan(short.length);
  });

  it('returns different values across successive calls', () => {
    const values = new Set(Array.from({ length: 50 }, () => randomToken()));
    expect(values.size).toBeGreaterThan(1);
  });

  it('does not contain URL-unsafe characters', () => {
    for (let i = 0; i < 20; i++) {
      const token = randomToken();
      expect(token).not.toMatch(/[+/=]/);
    }
  });
});
