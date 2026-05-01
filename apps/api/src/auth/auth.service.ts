import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { Errors } from '../common/errors';
import { newId } from '../common/ids';
import { hmacOtp, hmacRefresh, randomOtp, randomToken, timingSafeEqualHex } from '../common/hash';

// Constant dummy hex (64 chars) used to equalize HMAC work on unknown-user
// branches in verifyOtpForSecurity. Computed once; comparing against it always
// fails but takes the same time as a real compare.
const DUMMY_OTP_HASH = '0'.repeat(64);

const OTP_TTL_SECONDS = 600;
const OTP_MAX_ATTEMPTS = 5;
const OTP_REQUEST_WINDOW_SECONDS = 60;
const OTP_REQUEST_MAX_IN_WINDOW = 3;

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

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
    const since = new Date(Date.now() - OTP_REQUEST_WINDOW_SECONDS * 1000);

    // Atomic check-then-insert: a single INSERT ... WHERE ... COUNT < N query
    // eliminates the TOCTOU race that existed when count() and create() were
    // two separate round-trips. Two concurrent requests for the same email both
    // pass the count check in the non-atomic path; this form cannot.
    const inserted = await this.prisma.$executeRaw`
      INSERT INTO otp_codes (id, email, code_hash, purpose, expires_at, attempts, created_at, updated_at)
      SELECT
        ${id}::text,
        ${email}::text,
        ${codeHash}::text,
        'login'::text,
        ${expiresAt}::timestamptz,
        0,
        NOW(),
        NOW()
      WHERE (
        SELECT COUNT(*) FROM otp_codes
        WHERE email = ${email}::text
          AND created_at >= ${since}::timestamptz
      ) < ${OTP_REQUEST_MAX_IN_WINDOW}
    `;

    // inserted = 0 means the count guard blocked the insert.
    if (inserted === 0) throw Errors.authOtpThrottled();

    await this.mail.sendOtp(email, code);

    return { sent: true, expiresInSeconds: OTP_TTL_SECONDS };
  }

  async verifyOtp(emailRaw: string, code: string, req?: Request) {
    const email = emailRaw.trim().toLowerCase();
    const codeHash = hmacOtp(code);

    // Find the most recent active OTP for this email.
    const otp = await this.prisma.otpCode.findFirst({
      where: {
        email,
        purpose: 'login',
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) throw Errors.authOtpInvalid();

    if (!timingSafeEqualHex(otp.codeHash, codeHash)) {
      // Atomically increment attempts and read the new count in one round-trip.
      const updated = await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      });
      // Throw a consistent error regardless of attempt count to avoid leaking
      // which threshold was crossed.
      void updated.attempts;
      throw Errors.authOtpInvalid();
    }

    // Check attempt count only after the HMAC passes — at this point the code
    // is correct so we don't need to enforce lockout; consuming the OTP below
    // will prevent replay. But we still check in case of a race where the OTP
    // was valid but already consumed too many times on parallel requests.
    if (otp.attempts >= OTP_MAX_ATTEMPTS) throw Errors.authOtpInvalid();

    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });

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

  async issueSession(userId: string, req?: Request) {
    const sessionId = newId();
    const refreshToken = randomToken(40);
    const refreshHash = hmacRefresh(refreshToken);
    const now = new Date();
    const refreshExpires = new Date(now.getTime() + REFRESH_TTL_SECONDS * 1000);

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId,
        refreshTokenHash: refreshHash,
        userAgent: req?.headers['user-agent']?.toString().slice(0, 400) ?? null,
        ip: extractIp(req) ?? null,
        expiresAt: refreshExpires,
      },
    });

    const accessToken = this.signAccessToken(userId, sessionId);
    const accessTokenExpiresAt = new Date(now.getTime() + ACCESS_TTL_SECONDS * 1000).toISOString();

    // Refresh token is returned opaque; server holds only the hash.
    return { accessToken, refreshToken: `${sessionId}.${refreshToken}`, accessTokenExpiresAt };
  }

  async refresh(refreshTokenCombined: string, req?: Request) {
    const [sessionId, raw] = refreshTokenCombined.split('.', 2);
    if (!sessionId || !raw) throw Errors.authTokenInvalid();

    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.revokedAt) throw Errors.authSessionRevoked();
    if (session.expiresAt.getTime() < Date.now()) throw Errors.authTokenInvalid();
    if (!timingSafeEqualHex(session.refreshTokenHash, hmacRefresh(raw))) {
      throw Errors.authTokenInvalid();
    }

    // Rotate: issue new session, revoke old.
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    return this.issueSession(session.userId, req);
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

  serializeUser(user: { id: string; email: string; name: string | null; primaryCurrencyCode: string | null; createdAt: Date }) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      primaryCurrencyCode: user.primaryCurrencyCode ?? 'USD',
      createdAt: user.createdAt.toISOString(),
    };
  }

  /**
   * Phase 9: short-lived OTP token issued after /auth/otp/verify-for-security.
   * aud=security-reset, sub=userId, 5-minute expiry. Cannot be used as an
   * access token because the jwt-access strategy rejects `typ !== 'access'`.
   */
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

  signOtpTokenForSecurity(userId: string): { token: string; expiresInSeconds: number } {
    const ttl = 300;
    const token = this.jwt.sign(
      { sub: userId, typ: 'otp', aud: 'security-reset' },
      {
        secret: this.otpTokenSecret(),
        expiresIn: ttl,
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
    // Always compute the HMAC, even on branches we'll abort on, so that the
    // unknown-user / no-pending-OTP paths take the same wall time as success.
    const codeHash = hmacOtp(code);

    const otp = await this.prisma.otpCode.findFirst({
      where: {
        email,
        purpose: 'login',
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

    if (!timingSafeEqualHex(otp.codeHash, codeHash)) {
      // Atomically increment attempts in one round-trip (avoids concurrent-increment race).
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      });
      throw Errors.authOtpInvalid();
    }

    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw Errors.authOtpInvalid();
    }

    await this.prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

    const user = await this.prisma.user.findUnique({ where: { email } });
    // Mirror the invalid-OTP failure path identically — same error code, same
    // (lack of) detail — so an attacker cannot distinguish "valid OTP for an
    // unknown user" from "wrong OTP".
    if (!user) throw Errors.authOtpInvalid();
    const signed = this.signOtpTokenForSecurity(user.id);
    const expiresAt = new Date(Date.now() + signed.expiresInSeconds * 1000).toISOString();
    return { otpToken: signed.token, expiresAt };
  }
}

function extractIp(req?: Request): string | null {
  if (!req) return null;
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0]!.trim();
  return req.socket?.remoteAddress ?? null;
}
