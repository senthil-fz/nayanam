import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { Errors } from '../common/errors';
import { newId } from '../common/ids';
import { randomOtp, sha256Hex } from '../common/hash';

const OTP_TTL_SECONDS = 600;
const COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

@Injectable()
export class EmailChangeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async request(
    userId: string,
    newEmailRaw: string,
  ): Promise<{ expiresInSeconds: number; nextAllowedAt: string }> {
    const newEmail = newEmailRaw.trim().toLowerCase();

    // 409 if email is already committed to another user.
    const inUse = await this.prisma.user.findFirst({
      where: { email: newEmail, NOT: { id: userId } },
      select: { id: true },
    });
    if (inUse) throw Errors.emailAlreadyInUse();

    const pending = await this.prisma.emailChangeRequest.findFirst({
      where: { userId, consumedAt: null },
    });

    if (pending) {
      const sinceMs = Date.now() - pending.lastSentAt.getTime();
      if (sinceMs < COOLDOWN_SECONDS * 1000) {
        const retryAfter = Math.ceil((COOLDOWN_SECONDS * 1000 - sinceMs) / 1000);
        throw Errors.emailChangeCooldown(retryAfter);
      }
    }

    const code = randomOtp();
    const otpHash = sha256Hex(code);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OTP_TTL_SECONDS * 1000);

    if (pending) {
      await this.prisma.emailChangeRequest.update({
        where: { id: pending.id },
        data: {
          newEmail,
          otpHash,
          expiresAt,
          lastSentAt: now,
          failedAttempts: 0,
        },
      });
    } else {
      await this.prisma.emailChangeRequest.create({
        data: {
          id: newId(),
          userId,
          newEmail,
          otpHash,
          expiresAt,
          lastSentAt: now,
        },
      });
    }

    await this.mail.sendEmailChangeOtp(newEmail, code);

    return {
      expiresInSeconds: OTP_TTL_SECONDS,
      nextAllowedAt: new Date(now.getTime() + COOLDOWN_SECONDS * 1000).toISOString(),
    };
  }

  async verify(userId: string, otp: string): Promise<{ email: string; oldEmailMasked: string; newEmailMasked: string }> {
    const pending = await this.prisma.emailChangeRequest.findFirst({
      where: { userId, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!pending) throw Errors.emailChangeNotPending();

    if (pending.expiresAt.getTime() < Date.now()) throw Errors.otpExpired();
    if (pending.failedAttempts >= MAX_ATTEMPTS) throw Errors.otpMaxAttempts();

    if (pending.otpHash !== sha256Hex(otp)) {
      await this.prisma.emailChangeRequest.update({
        where: { id: pending.id },
        data: { failedAttempts: { increment: 1 } },
      });
      throw Errors.otpInvalid();
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw Errors.notFound();
    const oldEmail = user.email;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: { email: pending.newEmail, updatedAt: new Date() },
        });
        await tx.emailChangeRequest.update({
          where: { id: pending.id },
          data: { consumedAt: new Date() },
        });
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw Errors.emailAlreadyInUse();
      }
      throw err as Error;
    }

    // Tripwire to the OLD email. Best-effort: a mail failure must not fail the change.
    try {
      await this.mail.sendEmailChangedNotice(oldEmail, maskEmail(pending.newEmail));
    } catch {
      /* ignore */
    }

    return {
      email: pending.newEmail,
      oldEmailMasked: maskEmail(oldEmail),
      newEmailMasked: maskEmail(pending.newEmail),
    };
  }
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@', 2);
  if (!local || !domain) return '***';
  const head = local.slice(0, 1);
  return `${head}${'*'.repeat(Math.max(1, local.length - 1))}@${domain}`;
}
