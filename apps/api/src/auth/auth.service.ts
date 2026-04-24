import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { Errors } from '../common/errors';
import { newId } from '../common/ids';
import { randomOtp, randomToken, sha256Hex } from '../common/hash';

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

    // Throttle: limit OTP requests per email per minute
    const since = new Date(Date.now() - OTP_REQUEST_WINDOW_SECONDS * 1000);
    const recent = await this.prisma.otpCode.count({
      where: { email, createdAt: { gte: since } },
    });
    if (recent >= OTP_REQUEST_MAX_IN_WINDOW) throw Errors.authOtpThrottled();

    const code = randomOtp();
    const codeHash = sha256Hex(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

    await this.prisma.otpCode.create({
      data: {
        id: newId(),
        email,
        codeHash,
        purpose: 'login',
        expiresAt,
      },
    });

    await this.mail.sendOtp(email, code);

    return { sent: true, expiresInSeconds: OTP_TTL_SECONDS };
  }

  async verifyOtp(emailRaw: string, code: string, req?: Request) {
    const email = emailRaw.trim().toLowerCase();
    const codeHash = sha256Hex(code);

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

    if (otp.attempts >= OTP_MAX_ATTEMPTS) throw Errors.authOtpInvalid({ reason: 'too_many_attempts' });

    if (otp.codeHash !== codeHash) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw Errors.authOtpInvalid();
    }

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
    const refreshHash = sha256Hex(refreshToken);
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
    if (session.refreshTokenHash !== sha256Hex(raw)) throw Errors.authTokenInvalid();

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
        secret: this.config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret-change-me',
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
  signOtpTokenForSecurity(userId: string): { token: string; expiresInSeconds: number } {
    const ttl = 300;
    const token = this.jwt.sign(
      { sub: userId, typ: 'otp', aud: 'security-reset' },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret-change-me',
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
        secret: this.config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret-change-me',
      });
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
  ): Promise<{ otpToken: string; expiresInSeconds: number }> {
    // see end of method
    const email = emailRaw.trim().toLowerCase();
    const codeHash = sha256Hex(code);

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
    if (otp.attempts >= OTP_MAX_ATTEMPTS) throw Errors.authOtpInvalid({ reason: 'too_many_attempts' });
    if (otp.codeHash !== codeHash) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw Errors.authOtpInvalid();
    }
    await this.prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw Errors.authOtpInvalid();
    const signed = this.signOtpTokenForSecurity(user.id);
    return { otpToken: signed.token, expiresInSeconds: signed.expiresInSeconds };
  }
}

function extractIp(req?: Request): string | null {
  if (!req) return null;
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0]!.trim();
  return req.socket?.remoteAddress ?? null;
}
