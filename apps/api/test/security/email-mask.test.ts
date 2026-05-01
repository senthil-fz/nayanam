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
});
