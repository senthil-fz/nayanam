/**
 * Mask an email for safe logging.
 *
 * Returns `u***@d***.tld` form: keeps the first character of the local-part,
 * the first character of the domain label, and the TLD verbatim. The remaining
 * characters are replaced with `***`.
 *
 * Edge cases (empty string, missing `@`, missing `.` in domain, malformed input)
 * collapse to `'***'` so logs never accidentally leak partial PII.
 */
export function maskEmail(email: string): string {
  if (!email || typeof email !== 'string') return '***';
  const at = email.indexOf('@');
  if (at <= 0 || at === email.length - 1) return '***';

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  const dot = domain.lastIndexOf('.');
  if (dot <= 0 || dot === domain.length - 1) return '***';

  const domainLabel = domain.slice(0, dot);
  const tld = domain.slice(dot + 1);

  const localMasked = `${local[0]}***`;
  const domainMasked = `${domainLabel[0]}***`;

  return `${localMasked}@${domainMasked}.${tld}`;
}
