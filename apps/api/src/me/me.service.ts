import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { Errors } from '../common/errors';
import { newId } from '../common/ids';
import { isSupportedCurrency } from '../common/currencies';

const AVATAR_URL_TTL_SEC = 300;

export type MeProfile = {
  id: string;
  email: string;
  name: string | null;
  primaryCurrencyCode: string | null;
  primaryCurrencyCodeOrDefault: string;
  avatarAttachmentId: string | null;
  avatarThumbUrl: string | null;
  createdAt: string;
};

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async getProfile(userId: string): Promise<MeProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw Errors.notFound();
    return this.serialize(user);
  }

  async updateProfile(
    userId: string,
    patch: { name?: string | null; primaryCurrencyCode?: string | null },
  ): Promise<{ profile: MeProfile; changed: string[]; before: Record<string, unknown>; after: Record<string, unknown> }> {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw Errors.notFound();

    const changed: string[] = [];
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const data: { name?: string | null; primaryCurrencyCode?: string | null; updatedAt?: Date } = {};

    if (patch.name !== undefined) {
      const newName = patch.name === null ? null : patch.name.trim();
      if ((existing.name ?? null) !== (newName ?? null)) {
        data.name = newName;
        changed.push('name');
        before.name = existing.name;
        after.name = newName;
      }
    }

    if (patch.primaryCurrencyCode !== undefined) {
      const newCode = patch.primaryCurrencyCode === null ? null : patch.primaryCurrencyCode.toUpperCase();
      if (newCode !== null && !isSupportedCurrency(newCode)) {
        throw Errors.currencyUnsupported(newCode);
      }
      if ((existing.primaryCurrencyCode ?? null) !== (newCode ?? null)) {
        data.primaryCurrencyCode = newCode;
        changed.push('primaryCurrencyCode');
        before.primaryCurrencyCode = existing.primaryCurrencyCode;
        after.primaryCurrencyCode = newCode;
      }
    }

    if (changed.length === 0) {
      return { profile: await this.serialize(existing), changed: [], before: {}, after: {} };
    }

    data.updatedAt = new Date();
    const updated = await this.prisma.user.update({ where: { id: userId }, data });
    return { profile: await this.serialize(updated), changed, before, after };
  }

  /** Resolve the most-recent READY non-deleted avatar for a user. */
  async resolveUserAvatarAttachmentId(userId: string): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; thumb_key: string | null; key: string }>>`
      SELECT id, thumb_key, key
        FROM attachments
       WHERE owner_type = 'user'
         AND owner_id = ${userId}
         AND status = 'READY'
         AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1
    `;
    return rows[0]?.id ?? null;
  }

  /** Resolve the most-recent READY non-deleted avatar for a household. */
  async resolveHouseholdAvatarAttachmentId(householdId: string): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM attachments
       WHERE owner_type = 'household'
         AND owner_id = ${householdId}
         AND status = 'READY'
         AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1
    `;
    return rows[0]?.id ?? null;
  }

  async resolveAvatarThumbUrl(attachmentId: string | null): Promise<string | null> {
    if (!attachmentId) return null;
    const row = await this.prisma.attachment.findFirst({ where: { id: attachmentId } });
    if (!row) return null;
    const key = row.thumbKey ?? row.key;
    try {
      return await this.storage.presignGet(key, AVATAR_URL_TTL_SEC);
    } catch {
      return null;
    }
  }

  private async serialize(user: {
    id: string;
    email: string;
    name: string | null;
    primaryCurrencyCode: string | null;
    createdAt: Date;
  }): Promise<MeProfile> {
    const attachmentId = await this.resolveUserAvatarAttachmentId(user.id);
    const avatarThumbUrl = await this.resolveAvatarThumbUrl(attachmentId);

    // Fallback for primaryCurrencyCodeOrDefault: first household default, else 'USD'.
    let fallback = 'USD';
    if (!user.primaryCurrencyCode) {
      const membership = await this.prisma.householdMember.findFirst({
        where: { userId: user.id },
        include: { household: true },
        orderBy: { joinedAt: 'asc' },
      });
      if (membership?.household?.defaultCurrencyCode) {
        fallback = membership.household.defaultCurrencyCode;
      }
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      primaryCurrencyCode: user.primaryCurrencyCode,
      primaryCurrencyCodeOrDefault: user.primaryCurrencyCode ?? fallback,
      avatarAttachmentId: attachmentId,
      avatarThumbUrl,
      createdAt: user.createdAt.toISOString(),
    };
  }
}

/** Small helper to record user.* events (no household scoping needed). */
export async function recordUserEvent(
  prisma: PrismaService,
  userId: string,
  householdId: string | null,
  type: string,
  payload: unknown,
): Promise<void> {
  // Events table requires a non-null household_id. For user-scoped events
  // lacking a household context, we pick any one the user belongs to so the
  // row has a valid FK; scheduler-originated events pass null households.
  let hid = householdId;
  if (!hid) {
    const m = await prisma.householdMember.findFirst({ where: { userId } });
    hid = m?.householdId ?? null;
  }
  if (!hid) return; // User has no household yet — skip the audit row.
  await prisma.$executeRaw`
    INSERT INTO events (id, household_id, actor_id, type, payload)
    VALUES (${newId()}, ${hid}, ${userId}, ${type}, ${JSON.stringify(payload)}::jsonb)
  `;
}
