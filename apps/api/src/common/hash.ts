import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Bare SHA-256. Reserved for NON-SECRET fingerprinting (e.g. idempotency
 * response-body hashing). Never use for OTPs, refresh tokens, or any value
 * that an attacker could attempt to reverse from a DB dump — use the keyed
 * `hmac*` helpers below instead.
 */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Crypto-random URL-safe token. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** 6-digit numeric OTP code, zero-padded. */
export function randomOtp(): string {
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return n.toString().padStart(6, '0');
}

/**
 * Direct `process.env` read — intentionally NOT using ConfigService here.
 *
 * Rationale:
 *   1. `config/env.schema.ts` is wired into `ConfigModule.forRoot({ validate })`
 *      and runs at process boot. It rejects a missing or short value before
 *      any request is processed, so the value is guaranteed present by the time
 *      any HMAC helper is called.
 *   2. These four vars are static secrets that never change after boot; they do
 *      not need ConfigService's live-reload semantics.
 *   3. `hash.ts` deliberately has no NestJS imports so it can be used in unit
 *      tests and CLI tools without bootstrapping the DI container. Injecting
 *      ConfigService would force a DI context on every test callsite.
 *
 * If you need to add a new HMAC helper that reads a secret, add the var to
 * `env.schema.ts` (ensures boot-time validation) then add it to the union type
 * below — do NOT add a raw `process.env[X]` read elsewhere without the schema
 * guard.
 */
function requireEnv(name: 'OTP_PEPPER' | 'REFRESH_PEPPER' | 'SESSION_SALT' | 'INVITE_PEPPER'): string {
  // Boot-time env validation (config/env.schema.ts) guarantees presence; this
  // throw is a defensive backstop rather than a runtime contract.
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

/** HMAC-SHA-256(OTP) keyed by OTP_PEPPER. Hex, 64 chars. At-rest hash. */
export function hmacOtp(value: string): string {
  return createHmac('sha256', requireEnv('OTP_PEPPER')).update(value).digest('hex');
}

/** HMAC-SHA-256(refreshToken) keyed by REFRESH_PEPPER. Hex, 64 chars. At-rest hash. */
export function hmacRefresh(value: string): string {
  return createHmac('sha256', requireEnv('REFRESH_PEPPER')).update(value).digest('hex');
}

/** HMAC-SHA-256(ip) keyed by SESSION_SALT. Hex, 64 chars. */
export function hmacIp(ip: string): string {
  return createHmac('sha256', requireEnv('SESSION_SALT')).update(ip).digest('hex');
}

/** HMAC-SHA-256(inviteToken) keyed by INVITE_PEPPER. Hex, 64 chars. At-rest hash. */
export function hmacInvite(value: string): string {
  return createHmac('sha256', requireEnv('INVITE_PEPPER')).update(value).digest('hex');
}

/**
 * Constant-time hex string equality. Returns false (no throw) on length
 * mismatch or invalid hex. Both inputs MUST be hex strings of the same length.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let bufA: Buffer;
  let bufB: Buffer;
  try {
    bufA = Buffer.from(a, 'hex');
    bufB = Buffer.from(b, 'hex');
  } catch {
    return false;
  }
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}
