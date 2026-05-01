import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { EventType } from '../common/event-types';
import { PrismaService } from '../prisma/prisma.service';
import { Errors } from '../common/errors';
import { recordUserEvent } from './me.service';

const PIN_REGEX = /^\d{6}$/;
const MAX_FAILED = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const ARGON_OPTS: argon2.Options = {
  type: argon2.argon2id,
  timeCost: 2,
  memoryCost: 19 * 1024, // 19 MiB, OWASP minimum
  parallelism: 1,
};

export type SecurityStatus = {
  biometricEnabled: boolean;
  pinSet: boolean;
  pinLockedUntil: string | null;
};

@Injectable()
export class SecurityService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<SecurityStatus> {
    const row = await this.upsertDefault(userId);
    return this.toStatus(row);
  }

  async update(
    userId: string,
    input: { biometricEnabled?: boolean; pin?: string | null; currentPin?: string },
  ): Promise<{ status: SecurityStatus; changedFlags: Record<string, unknown> }> {
    const row = await this.upsertDefault(userId);

    const changed: Record<string, unknown> = {};
    const data: {
      biometricEnabled?: boolean;
      pinHash?: string | null;
      pinLastChangedAt?: Date | null;
      pinFailedAttempts?: number;
      pinLockedUntil?: Date | null;
    } = {};

    const wantsPinMutation =
      Object.prototype.hasOwnProperty.call(input, 'pin') ||
      Object.prototype.hasOwnProperty.call(input, 'currentPin');

    if (input.biometricEnabled !== undefined && input.biometricEnabled !== row.biometricEnabled) {
      data.biometricEnabled = input.biometricEnabled;
      changed.biometricEnabled = input.biometricEnabled;
    }

    if (wantsPinMutation) {
      const pinSet = Boolean(row.pinHash);

      if (input.pin === null) {
        // Clear PIN. Only allowed if biometric also off after this call.
        const willHaveBiometric = input.biometricEnabled ?? row.biometricEnabled;
        if (willHaveBiometric) {
          throw Errors.validation(
            'Cannot clear PIN while biometric is enabled — disable biometric first.',
          );
        }
        if (!pinSet) throw Errors.pinNotSet();
        if (!input.currentPin) throw Errors.pinInvalid();
        this.assertNotLocked(row);
        const ok = await this.verifyCurrentPin(userId, row.pinHash!, input.currentPin);
        if (!ok) throw Errors.pinInvalid();
        data.pinHash = null;
        data.pinLastChangedAt = null;
        data.pinFailedAttempts = 0;
        data.pinLockedUntil = null;
        changed.pinSet = false;
      } else if (typeof input.pin === 'string') {
        if (!PIN_REGEX.test(input.pin)) throw Errors.pinFormatInvalid();

        if (pinSet) {
          if (!input.currentPin) throw Errors.pinInvalid();
          this.assertNotLocked(row);
          const ok = await this.verifyCurrentPin(userId, row.pinHash!, input.currentPin);
          if (!ok) throw Errors.pinInvalid();
        } else if (input.currentPin) {
          // Client thinks a PIN is set but server has none.
          throw Errors.pinNotSet();
        }

        const hash = await argon2.hash(input.pin, ARGON_OPTS);
        data.pinHash = hash;
        data.pinLastChangedAt = new Date();
        data.pinFailedAttempts = 0;
        data.pinLockedUntil = null;
        changed.pinSet = true;
      }
    }

    if (Object.keys(data).length === 0) {
      return { status: this.toStatus(row), changedFlags: {} };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.userSecurity.update({
        where: { userId },
        data: { ...data, updatedAt: new Date() },
      });
      if (Object.keys(changed).length > 0) {
        await recordUserEvent(tx, userId, null, EventType.USER_SECURITY_UPDATED, { flags: changed });
      }
      return u;
    });

    return { status: this.toStatus(updated), changedFlags: changed };
  }

  async verifyPin(userId: string, pin: string): Promise<{ ok: true }> {
    if (!PIN_REGEX.test(pin)) throw Errors.pinFormatInvalid();
    const row = await this.upsertDefault(userId);
    if (!row.pinHash) throw Errors.pinNotSet();
    this.assertNotLocked(row);

    const ok = await argon2.verify(row.pinHash, pin);
    if (!ok) {
      const attempts = row.pinFailedAttempts + 1;
      const locked = attempts >= MAX_FAILED;
      await this.prisma.userSecurity.update({
        where: { userId },
        data: {
          pinFailedAttempts: attempts,
          pinLockedUntil: locked ? new Date(Date.now() + LOCKOUT_MS) : row.pinLockedUntil,
          updatedAt: new Date(),
        },
      });
      if (locked) {
        throw Errors.pinLocked(Math.ceil(LOCKOUT_MS / 1000));
      }
      throw Errors.pinInvalid();
    }

    if (row.pinFailedAttempts > 0 || row.pinLockedUntil) {
      await this.prisma.userSecurity.update({
        where: { userId },
        data: { pinFailedAttempts: 0, pinLockedUntil: null, updatedAt: new Date() },
      });
    }
    return { ok: true };
  }

  async resetPinWithOtpToken(userId: string, newPin: string): Promise<void> {
    if (!PIN_REGEX.test(newPin)) throw Errors.pinFormatInvalid();
    await this.upsertDefault(userId);
    const hash = await argon2.hash(newPin, ARGON_OPTS);
    await this.prisma.$transaction(async (tx) => {
      await tx.userSecurity.update({
        where: { userId },
        data: {
          pinHash: hash,
          pinLastChangedAt: new Date(),
          pinFailedAttempts: 0,
          pinLockedUntil: null,
          updatedAt: new Date(),
        },
      });
      await recordUserEvent(tx, userId, null, EventType.USER_SECURITY_UPDATED, {
        flags: { pinSet: true, reason: 'reset' },
      });
    });
  }

  private async upsertDefault(userId: string) {
    return this.prisma.userSecurity.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  private async verifyCurrentPin(
    userId: string,
    hash: string,
    candidate: string,
  ): Promise<boolean> {
    const ok = await argon2.verify(hash, candidate);
    if (!ok) {
      // Single atomic transaction: increment attempts AND conditionally set
      // pinLockedUntil based on the new count. Eliminates the race condition
      // where two concurrent requests both increment to MAX_FAILED but only
      // one sets the lockout.
      await this.prisma.$transaction(async (tx) => {
        const row = await tx.userSecurity.update({
          where: { userId },
          data: { pinFailedAttempts: { increment: 1 }, updatedAt: new Date() },
          select: { pinFailedAttempts: true },
        });
        if (row.pinFailedAttempts >= MAX_FAILED) {
          await tx.userSecurity.update({
            where: { userId },
            data: { pinLockedUntil: new Date(Date.now() + LOCKOUT_MS), updatedAt: new Date() },
          });
        }
      });
      return false;
    }
    return true;
  }

  private assertNotLocked(row: { pinLockedUntil: Date | null }): void {
    if (row.pinLockedUntil && row.pinLockedUntil.getTime() > Date.now()) {
      const retryAfter = Math.ceil((row.pinLockedUntil.getTime() - Date.now()) / 1000);
      throw Errors.pinLocked(retryAfter);
    }
  }

  private toStatus(row: {
    biometricEnabled: boolean;
    pinHash: string | null;
    pinLockedUntil: Date | null;
  }): SecurityStatus {
    return {
      biometricEnabled: row.biometricEnabled,
      pinSet: Boolean(row.pinHash),
      pinLockedUntil: row.pinLockedUntil ? row.pinLockedUntil.toISOString() : null,
    };
  }
}
