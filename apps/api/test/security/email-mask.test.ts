import { describe, it, expect } from 'vitest';

import { maskEmail } from '../../src/common/email-mask';

/**
 * Phase 11 / task-016 — table-driven coverage for the shared `maskEmail`
 * helper. The helper is the canonical mask used by `mail.service.ts` and the
 * pino redactor, so the contract here doubles as a regression net for log-PII
 * leaks.
 */
describe('maskEmail', () => {
  const cases: Array<[string, string]> = [
    ['alice@example.com', 'a***@e***.com'],
    ['bob@a.b.co', 'b***@a***.co'],
  ];

  it.each(cases)('masks %s as %s', (input, expected) => {
    expect(maskEmail(input)).toBe(expected);
  });

  const invalid: Array<[string, string]> = [
    ['empty string', ''],
    ['no @', 'not-an-email'],
    ['missing local part', '@bad.com'],
    ['domain without TLD', 'a@b'],
  ];

  it.each(invalid)('collapses %s to ***', (_label, input) => {
    expect(maskEmail(input)).toBe('***');
  });

  // Edge cases: document behavior for subdomains and multi-part TLDs.
  // The implementation uses `lastIndexOf('.')` on the domain portion, so the
  // TLD is the segment after the final dot. These tests document and pin the
  // actual behavior (not necessarily ideal, but at least consistent).
  it('multi-subdomain: uses last dot to split TLD', () => {
    // domain='mail.example.com' → lastIndexOf('.')=11 →
    // domainLabel='mail.example', tld='com' → 'm***'
    expect(maskEmail('user@mail.example.com')).toBe('u***@m***.com');
  });

  it('multi-part TLD: preserves only the final segment as TLD', () => {
    // domain='example.co.uk' → lastIndexOf('.')=10 →
    // domainLabel='example.co', tld='uk' → 'e***'
    expect(maskEmail('user@example.co.uk')).toBe('u***@e***.uk');
  });
});
