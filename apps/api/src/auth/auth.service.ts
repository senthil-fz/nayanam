import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { Errors } from '../common/errors';
import { newId } from '../common/ids';
import {
  hmacIp,
  hmacOtp,
  hmacRefresh,
  randomOtp,
  randomToken,
  timingSafeEqualHex,
  verifyHmacOtp,
  verifyHmacRefresh,
} from '../common/hash';
import { EventType } from '../common/event-types';
import { recordUserEvent } from '../me/me.service';

// Constant dummy hex (64 chars) used to equalize HMAC work on unknown-user
// branches in consumeOtp. Computed once; comparing against it always
// fails but takes the same time as a real compare.
const DUMMY_OTP_HASH = '0'.repeat(64);

const OTP_TTL_SECONDS = 600;
const OTP_MAX_ATTEMPTS = 5;
const OTP_REQUEST_WINDOW_SECONDS = 60;
const OTP_REQUEST_MAX_IN_WINDOW = 3;
/** Per-email hourly OTP send budget (distinct from the 3/60s burst cap). */
const OTP_REQUEST_MAX_PER_HOUR = 10;

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Grace window for refresh-token rotation reuse detection.
 *
 * If a rotated session's refresh token is replayed within this window, we
 * assume a benign double-send (race / network retry) and return a plain 401
 * rather than revoking the whole family. Outside the window, a replay of a
 * revoked token is treated as a token-theft attempt and the entire family is
 * revoked.
 */
const REFRESH_GRACE_WINDOW_MS = 30_000; // 30 seconds

/**
 * Internal session row shape with the family tracking columns.
 * The Prisma-generated client does not include familyId/parentId until
 * prisma:pull is run after the Liquibase migration. Until then we read
 * these columns via $queryRaw and write them via $executeRaw.
 */
type SessionRow = {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  family_id: string;
  parent_id: string | null;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly jwt: JwtService,
  ) {}

  // ---- OTP ----

  async requestOtp(emailRaw: string): Promise<{ sent: true; expiresInSeconds: number }> {
    const email = emailRaw.trim().toLowerCase();

    const code = randomOtp();
    const codeHash = hmacOtp(code);
    const id = newId();
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);
    const since3min = new Date(Date.now() - OTP_REQUEST_WINDOW_SECONDS * 1000);
    const since1hr = new Date(Date.now() - 3_600_000);

    // Atomic check-then-insert: a single INSERT ... WHERE ... COUNT < N query
    // eliminates the TOCTOU race that existed when count() and create() were
    // two separate round-trips. Two concurrent requests for the same email both
    // pass the count check in the non-atomic path; this form cannot.
    //
    // Two rate-limit guards:
    //   1. Burst cap: at most OTP_REQUEST_MAX_IN_WINDOW (3) in the last 60 s.
    //   2. Hourly budget: at most OTP_REQUEST_MAX_PER_HOUR (10) in the last hour.
    // Both are checked atomically in the same INSERT ... WHERE expression.
    const inserted = await this.prisma.$executeRaw`
      INSERT INTO otp_codes (id, email, code_hash, purpose, expires_at, attempts, created_at)
      SELECT
        ${id}::text,
        ${email}::text,
        ${codeHash}::text,
        'login'::text,
        ${expiresAt}::timestamptz,
        0,
        NOW()
      WHERE (
        SELECT COUNT(*) FROM otp_codes
        WHERE email = ${email}::text
          AND created_at >= ${since3min}::timestamptz
      ) < ${OTP_REQUEST_MAX_IN_WINDOW}
      AND (
        SELECT COUNT(*) FROM otp_codes
        WHERE email = ${email}::text
          AND created_at >= ${since1hr}::timestamptz
      ) < ${OTP_REQUEST_MAX_PER_HOUR}
    `;

    // inserted = 0 means the count guard blocked the insert.
    if (inserted === 0) throw Errors.authOtpThrottled();

    await this.mail.sendOtp(email, code);

    return { sent: true, expiresInSeconds: OTP_TTL_SECONDS };
  }

  async verifyOtp(emailRaw: string, code: string, req?: Request) {
    const email = emailRaw.trim().toLowerCase();
    await this.consumeOtp(email, code, 'login');

    // Upsert user
    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await this.prisma.user.create({
        data: { id: newId(), email, primaryCurrencyCode: 'USD' },
      });
      // Seed a default household for first-login users.
      const hhId = newId();
      await this.prisma.household.create({
        data: {
          id: hhId,
          name: 'My Household',
          defaultCurrencyCode: 'USD',
          createdBy: user.id,
          updatedBy: user.id,
        },
      });
      await this.prisma.householdMember.create({
        data: {
          id: newId(),
          householdId: hhId,
          userId: user.id,
          role: 'OWNER',
        },
      });
    }

    const households = await this.listHouseholdsForUser(user.id);
    const tokens = await this.issueSession(user.id, req);

    return {
      ...tokens,
      user: this.serializeUser(user),
      households,
    };
  }

  // ---- Sessions ----

  async issueSession(
    userId: string,
    req?: Request,
    parentSessionId?: string,
    familyId?: string,
  ) {
    const sessionId = newId();
    const refreshToken = randomToken(40);
    const refreshHash = hmacRefresh(refreshToken);
    const now = new Date();
    const refreshExpires = new Date(now.getTime() + REFRESH_TTL_SECONDS * 1000);

    // The family ID groups all sessions that trace back to a single login event.
    // A root session (no parent) seeds its own family; rotation inherits the
    // parent's family so the whole chain can be revoked on replay of a revoked token.
    const resolvedFamilyId = familyId ?? sessionId;
    const userAgent = req?.headers['user-agent']?.toString().slice(0, 400) ?? null;
    const ip = extractIp(req);
    const ipHash = ip ? hmacIp(ip) : null;

    // Use $executeRaw because the Prisma-generated client does not yet include
    // family_id / parent_id (those columns are added by the Liquibase changeset
    // 20260516-001-session-family-id.yaml; prisma:pull + prisma:generate must run
    // after the migration). Raw SQL is type-safe here because we control all inputs.
    await this.prisma.$executeRaw`
      INSERT INTO sessions (
        id, user_id, refresh_token_hash, user_agent,
        ip_address_hash, expires_at, family_id, parent_id,
        device_kind, last_used_at, created_at, last_seen_at
      ) VALUES (
        ${sessionId}::varchar,
        ${userId}::varchar,
        ${refreshHash}::text,
        ${userAgent}::text,
        ${ipHash}::text,
        ${refreshExpires}::timestamptz,
        ${resolvedFamilyId}::varchar,
        ${parentSessionId ?? null}::varchar,
        'other'::text,
        NOW(),
        NOW(),
        NOW()
      )
    `;

    const accessToken = this.signAccessToken(userId, sessionId);
    const accessTokenExpiresAt = new Date(now.getTime() + ACCESS_TTL_SECONDS * 1000).toISOString();

    // Refresh token is returned opaque; server holds only the hash.
    return { accessToken, refreshToken: `${sessionId}.${refreshToken}`, accessTokenExpiresAt };
  }

  async refresh(refreshTokenCombined: string, req?: Request) {
    const [sessionId, raw] = refreshTokenCombined.split('.', 2);
    if (!sessionId || !raw) throw Errors.authTokenInvalid();

    // Use $queryRaw to read family_id / parent_id columns that the Prisma client
    // doesn't know about yet (pending migration + prisma:pull).
    const rows = await this.prisma.$queryRaw<SessionRow[]>`
      SELECT id, user_id, refresh_token_hash, expires_at, revoked_at, family_id, parent_id
      FROM sessions
      WHERE id = ${sessionId}::varchar
    `;
    const session = rows[0];
    if (!session) throw Errors.authSessionRevoked();
    if (session.expires_at.getTime() < Date.now()) throw Errors.authTokenInvalid();

    if (!verifyHmacRefresh(raw, session.refresh_token_hash)) {
      throw Errors.authTokenInvalid();
    }

    // Check if this session was already revoked (previously rotated or logged out).
    if (session.revoked_at) {
      // SECURITY: A revoked session's refresh token was replayed.
      // This may be a network retry (benign) or a stolen-token attack.
      //
      // Grace window: if the session was revoked very recently (e.g. within 30s),
      // a sibling rotated session is likely already live. We suppress the family
      // revoke to avoid punishing a double-send, but still return 401.
      const msSinceRevoked = Date.now() - session.revoked_at.getTime();
      if (msSinceRevoked > REFRESH_GRACE_WINDOW_MS) {
        // Outside the grace window → token theft assumed.
        // Revoke the entire family to contain the breach.
        this.logger.warn(
          { sessionId, familyId: session.family_id },
          'Refresh-token reuse detected outside grace window — revoking entire session family.',
        );
        const now = new Date();
        await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`
            UPDATE sessions SET revoked_at = ${now}::timestamptz
            WHERE family_id = ${session.family_id}::varchar
              AND revoked_at IS NULL
          `;
          await recordUserEvent(tx, session.user_id, null, EventType.USER_ALL_SESSIONS_REVOKED, {
            reason: 'refresh_token_reuse',
            familyId: session.family_id,
          });
        });
      }
      // Always reject — whether inside or outside the grace window.
      throw Errors.authSessionRevoked();
    }

    // Rotate: revoke old session, issue new session in the same family.
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    return this.issueSession(session.user_id, req, session.id, session.family_id);
  }

  async logout(sessionId: string) {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ---- helpers ----

  signAccessToken(userId: string, sessionId: string): string {
    return this.jwt.sign(
      { sub: userId, sid: sessionId, typ: 'access' },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: ACCESS_TTL_SECONDS,
        algorithm: 'HS256',
      },
    );
  }

  async listHouseholdsForUser(userId: string) {
    const memberships = await this.prisma.householdMember.findMany({
      where: { userId, household: { deletedAt: null } },
      include: { household: true },
      orderBy: { joinedAt: 'asc' },
    });
    return memberships.map((m) => ({
      id: m.householdId,
      name: m.household.name,
      role: m.role as 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER',
      defaultCurrencyCode: m.household.defaultCurrencyCode,
    }));
  }

  serializeUser(user: {
    id: string;
    email: string;
    name: string | null;
    primaryCurrencyCode: string | null;
    createdAt: Date;
  }) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      primaryCurrencyCode: user.primaryCurrencyCode ?? 'USD',
      createdAt: user.createdAt.toISOString(),
    };
  }

  /**
   * Returns the secret to use for security-reset OTP tokens.
   * Uses `JWT_SECURITY_OTP_SECRET` if configured (recommended for production),
   * falling back to `JWT_ACCESS_SECRET`. Both paths assert `aud=security-reset`
   * and `typ=otp` on verify so cross-type token acceptance is prevented even
   * when the same secret is shared.
   */
  private otpTokenSecret(): string {
    return (
      this.config.get<string>('JWT_SECURITY_OTP_SECRET') ??
      this.config.getOrThrow<string>('JWT_ACCESS_SECRET')
    );
  }

  /**
   * Phase 9: short-lived OTP token issued after /auth/otp/verify-for-security.
   * aud=security-reset, sub=userId, 5-minute expiry. Cannot be used as an
   * access token because the jwt-access strategy rejects `typ !== 'access'`.
   */
  signOtpTokenForSecurity(userId: string): { token: string; expiresInSeconds: number } {
    const ttl = 300;
    const token = this.jwt.sign(
      { sub: userId, typ: 'otp', aud: 'security-reset' },
      {
        secret: this.otpTokenSecret(),
        expiresIn: ttl,
        algorithm: 'HS256',
      },
    );
    return { token, expiresInSeconds: ttl };
  }

  /** Verify a security-reset OTP token; returns the subject userId or throws. */
  verifyOtpTokenForSecurity(token: string): Promise<string> {
    return Promise.resolve().then(() => this.verifyOtpTokenForSecuritySync(token));
  }

  private verifyOtpTokenForSecuritySync(token: string): string {
    try {
      const payload = this.jwt.verify<{ sub: string; typ?: string; aud?: string }>(token, {
        secret: this.otpTokenSecret(),
        algorithms: ['HS256'],
      });
      // Explicitly assert both claims to prevent cross-type token acceptance
      // even when JWT_SECURITY_OTP_SECRET is not set and secrets are shared.
      if (payload.typ !== 'otp' || payload.aud !== 'security-reset' || !payload.sub) {
        throw Errors.authTokenInvalid();
      }
      return payload.sub;
    } catch {
      throw Errors.authTokenInvalid();
    }
  }

  /**
   * Phase 9: mirror of verifyOtp but issues a short-lived otpToken scoped to
   * security operations instead of creating a session.
   */
  async verifyOtpForSecurity(
    emailRaw: string,
    code: string,
  ): Promise<{ otpToken: string; expiresAt: string }> {
    const email = emailRaw.trim().toLowerCase();
    await this.consumeOtp(email, code, 'login');

    const user = await this.prisma.user.findUnique({ where: { email } });
    // Mirror the invalid-OTP failure path identically — same error code, same
    // (lack of) detail — so an attacker cannot distinguish "valid OTP for an
    // unknown user" from "wrong OTP".
    if (!user) throw Errors.authOtpInvalid();
    const signed = this.signOtpTokenForSecurity(user.id);
    const expiresAt = new Date(Date.now() + signed.expiresInSeconds * 1000).toISOString();
    return { otpToken: signed.token, expiresAt };
  }

  /**
   * Shared OTP consumption helper used by both `verifyOtp` and
   * `verifyOtpForSecurity`. Centralises:
   *   - Timing defence (dummy-hash compare when no OTP exists).
   *   - Attempt counting on the FAILURE path (not only after correct HMAC).
   *   - Lockout: after OTP_MAX_ATTEMPTS wrong guesses the OTP row is immediately
   *     consumed so no further guesses are possible, even with the correct code.
   *   - Success path: marks the OTP consumed and returns.
   *
   * By sharing this helper, both callers are guaranteed identical security
   * properties and neither can drift.
   */
  private async consumeOtp(email: string, code: string, purpose: string): Promise<void> {
    // Always compute the HMAC, even on branches we'll abort on, so that the
    // unknown-user / no-pending-OTP paths take the same wall time as success.
    const codeHash = hmacOtp(code);

    const otp = await this.prisma.otpCode.findFirst({
      where: {
        email,
        purpose,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    // No active OTP — still perform a constant-time compare against a dummy
    // hash so the response shape and timing match the invalid-OTP path. This
    // prevents distinguishing "no OTP requested" from "wrong OTP" via timing.
    if (!otp) {
      timingSafeEqualHex(codeHash, DUMMY_OTP_HASH);
      throw Errors.authOtpInvalid();
    }

    if (!verifyHmacOtp(code, otp.codeHash)) {
      // Atomically increment attempts and read the new count in one round-trip.
      const updated = await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      });

      // SECURITY: Enforce the attempt cap on the FAILURE path, not only after
      // a correct HMAC. Once the cap is reached, immediately consume the OTP
      // so that even a correct guess is rejected for the remainder of the TTL.
      if (updated.attempts >= OTP_MAX_ATTEMPTS) {
        await this.prisma.otpCode.update({
          where: { id: otp.id },
          data: { consumedAt: new Date() },
        });
      }

      throw Errors.authOtpInvalid();
    }

    // Correct code — mark consumed and return.
    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });
  }
}

function extractIp(req?: Request): string | null {
  if (!req) return null;
  // Use Express's derived req.ip which honours trust-proxy rules set in
  // main.ts — never parse the raw X-Forwarded-For header directly.
  return req.ip ?? req.socket?.remoteAddress ?? null;
}
