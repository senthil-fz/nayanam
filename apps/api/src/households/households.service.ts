import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { Errors } from '../common/errors';
import { newId } from '../common/ids';
import { randomToken, sha256Hex } from '../common/hash';

const INVITE_TTL_DAYS = 7;

@Injectable()
export class HouseholdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async listForUser(userId: string) {
    const memberships = await this.prisma.householdMember.findMany({
      where: { userId, household: { deletedAt: null } },
      include: { household: true },
      orderBy: { joinedAt: 'asc' },
    });
    return memberships.map((m) => this.toSummary(m.household, m.role));
  }

  async create(userId: string, name: string, currency?: string) {
    const id = newId();
    const hh = await this.prisma.household.create({
      data: {
        id,
        name,
        defaultCurrencyCode: currency ?? 'USD',
        createdBy: userId,
        updatedBy: userId,
      },
    });
    await this.prisma.householdMember.create({
      data: { id: newId(), householdId: id, userId, role: 'OWNER' },
    });
    await this.recordEvent(id, userId, 'household.created', { name });
    return this.toHousehold(hh);
  }

  async get(userId: string, householdId: string) {
    await this.assertMember(userId, householdId);
    const hh = await this.prisma.household.findFirst({
      where: { id: householdId, deletedAt: null },
    });
    if (!hh) throw Errors.householdNotFound();
    return this.toHousehold(hh);
  }

  async update(
    userId: string,
    householdId: string,
    patch: {
      name?: string;
      defaultCurrencyCode?: string;
      iconToken?: string | null;
      colorToken?: string | null;
    },
  ) {
    const role = await this.assertMember(userId, householdId);
    if (!['OWNER', 'ADMIN'].includes(role)) throw Errors.forbidden('Requires OWNER or ADMIN.');

    const data: Record<string, unknown> = { updatedBy: userId, updatedAt: new Date() };
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.defaultCurrencyCode !== undefined) {
      data.defaultCurrencyCode = patch.defaultCurrencyCode.toUpperCase();
    }
    if (patch.iconToken !== undefined) data.iconToken = patch.iconToken ?? null;
    if (patch.colorToken !== undefined) data.colorToken = patch.colorToken ?? null;

    const hh = await this.prisma.household.update({
      where: { id: householdId },
      data,
    });
    await this.recordEvent(householdId, userId, 'household.updated', {
      changedFields: Object.keys(patch),
    });
    return this.toHousehold(hh);
  }

  // --- Phase 9 household member management ---

  async updateMemberRole(
    actorUserId: string,
    householdId: string,
    targetUserId: string,
    role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER',
  ): Promise<{ userId: string; role: string }> {
    const actorRole = await this.assertMember(actorUserId, householdId);
    if (actorRole !== 'OWNER') throw Errors.forbiddenRole('Requires OWNER.');

    const target = await this.prisma.householdMember.findUnique({
      where: { householdId_userId: { householdId, userId: targetUserId } },
    });
    if (!target) throw Errors.notFound();
    if (target.role === role) return { userId: targetUserId, role };

    if (target.role === 'OWNER' && role !== 'OWNER') {
      const owners = await this.prisma.householdMember.count({
        where: { householdId, role: 'OWNER' },
      });
      if (owners <= 1) throw Errors.householdLastOwner();
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.householdMember.update({
        where: { householdId_userId: { householdId, userId: targetUserId } },
        data: { role },
      });
      await this.recordEventTx(tx, householdId, actorUserId, 'household.member_role_changed', {
        targetUserId,
        before: target.role,
        after: role,
      });
    });

    return { userId: targetUserId, role };
  }

  async removeMember(
    actorUserId: string,
    householdId: string,
    targetUserId: string,
  ): Promise<{ removed: boolean; alreadyRemoved?: boolean }> {
    const actorRole = await this.assertMember(actorUserId, householdId);
    if (actorRole !== 'OWNER') throw Errors.forbiddenRole('Requires OWNER.');
    if (actorUserId === targetUserId) {
      throw Errors.validation('Cannot remove yourself — use POST /households/:id/leave.');
    }

    const target = await this.prisma.householdMember.findUnique({
      where: { householdId_userId: { householdId, userId: targetUserId } },
    });
    if (!target) return { removed: false, alreadyRemoved: true };

    if (target.role === 'OWNER') {
      const owners = await this.prisma.householdMember.count({
        where: { householdId, role: 'OWNER' },
      });
      if (owners <= 1) throw Errors.householdLastOwner();
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.householdMember.delete({
        where: { householdId_userId: { householdId, userId: targetUserId } },
      });
      await this.recordEventTx(tx, householdId, actorUserId, 'household.member_removed', {
        targetUserId,
      });
    });
    return { removed: true };
  }

  async leave(
    userId: string,
    householdId: string,
  ): Promise<{ left: boolean; householdDeleted: boolean }> {
    const role = await this.assertMember(userId, householdId);

    const memberCount = await this.prisma.householdMember.count({ where: { householdId } });

    // Sole member → soft-delete household too (implicit self-delete path).
    if (memberCount === 1) {
      await this.prisma.$transaction(async (tx) => {
        await tx.householdMember.deleteMany({ where: { householdId, userId } });
        await tx.household.update({
          where: { id: householdId },
          data: { deletedAt: new Date(), updatedBy: userId },
        });
        await this.recordEventTx(tx, householdId, userId, 'household.member_left', {});
        await this.recordEventTx(tx, householdId, userId, 'household.deleted', { hard: false });
      });
      return { left: true, householdDeleted: true };
    }

    // Not alone: if caller is the sole OWNER, block the leave.
    if (role === 'OWNER') {
      const owners = await this.prisma.householdMember.count({
        where: { householdId, role: 'OWNER' },
      });
      if (owners <= 1) {
        throw Errors.householdLastOwner({ mustPromoteBeforeLeaving: true });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.householdMember.deleteMany({ where: { householdId, userId } });
      await this.recordEventTx(tx, householdId, userId, 'household.member_left', {});
    });
    return { left: true, householdDeleted: false };
  }

  async archive(userId: string, householdId: string): Promise<{ deleted: boolean; hard: boolean }> {
    const role = await this.assertMember(userId, householdId);
    if (role !== 'OWNER') throw Errors.forbiddenRole('Requires OWNER.');

    const memberCount = await this.prisma.householdMember.count({ where: { householdId } });
    if (memberCount > 1) throw Errors.householdNotEmpty();

    // Check for any non-deleted data that would prevent a hard delete.
    const [accountCount, txCount, billCount, budgetCount] = await Promise.all([
      this.prisma.account.count({ where: { householdId, deletedAt: null } }),
      this.prisma.transaction.count({ where: { householdId, deletedAt: null } }),
      this.prisma.bill.count({ where: { householdId, deletedAt: null } }),
      this.prisma.budget.count({ where: { householdId, deletedAt: null } }),
    ]);

    const hard =
      accountCount === 0 && txCount === 0 && billCount === 0 && budgetCount === 0;

    await this.prisma.$transaction(async (tx) => {
      await tx.household.update({
        where: { id: householdId },
        data: { deletedAt: new Date(), updatedBy: userId },
      });
      await this.recordEventTx(tx, householdId, userId, 'household.deleted', { hard });
    });
    return { deleted: true, hard };
  }

  async listMembers(userId: string, householdId: string) {
    await this.assertMember(userId, householdId);
    const rows = await this.prisma.householdMember.findMany({
      where: { householdId },
      include: { user: true },
      orderBy: { joinedAt: 'asc' },
    });

    // Enrich: per-user avatar attachment id + last-seen from sessions.
    const userIds = rows.map((m) => m.userId);
    const avatarRows =
      userIds.length === 0
        ? []
        : await this.prisma.$queryRaw<Array<{ owner_id: string; id: string }>>`
            SELECT DISTINCT ON (owner_id) owner_id, id
              FROM attachments
             WHERE owner_type = 'user'
               AND owner_id = ANY(${userIds}::text[])
               AND status = 'READY'
               AND deleted_at IS NULL
             ORDER BY owner_id, created_at DESC
          `;
    const avatarMap = new Map<string, string>(
      avatarRows.map((r) => [r.owner_id, r.id]),
    );

    const lastSeenRows =
      userIds.length === 0
        ? []
        : await this.prisma.$queryRaw<Array<{ user_id: string; last_seen_at: Date }>>`
            SELECT user_id, MAX(last_seen_at) AS last_seen_at
              FROM sessions
             WHERE user_id = ANY(${userIds}::text[])
               AND revoked_at IS NULL
             GROUP BY user_id
          `;
    const lastSeenMap = new Map<string, Date>(
      lastSeenRows.map((r) => [r.user_id, r.last_seen_at]),
    );

    return rows.map((m) => ({
      id: m.id,
      userId: m.userId,
      email: m.user.email,
      name: m.user.name,
      role: m.role as 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER',
      joinedAt: m.joinedAt.toISOString(),
      avatarAttachmentId: avatarMap.get(m.userId) ?? null,
      lastSeenAt: lastSeenMap.get(m.userId)?.toISOString() ?? null,
    }));
  }

  async listInvites(userId: string, householdId: string) {
    const role = await this.assertMember(userId, householdId);
    if (!['OWNER', 'ADMIN'].includes(role)) throw Errors.forbidden();
    const rows = await this.prisma.householdInvite.findMany({
      where: { householdId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((i) => this.toInvite(i));
  }

  async createInvite(userId: string, householdId: string, email: string, role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER') {
    const requesterRole = await this.assertMember(userId, householdId);
    if (!['OWNER', 'ADMIN'].includes(requesterRole)) throw Errors.forbidden();
    if (role === 'OWNER' && requesterRole !== 'OWNER') throw Errors.forbidden('Only OWNER can invite OWNER.');

    const token = randomToken(32);
    const tokenHash = sha256Hex(token);
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const invite = await this.prisma.householdInvite.create({
      data: {
        id: newId(),
        householdId,
        email: email.trim().toLowerCase(),
        role,
        tokenHash,
        invitedBy: userId,
        expiresAt,
      },
    });

    // Compose email with an accept link — web handles the route.
    const webUrl = this.config.get<string>('WEB_URL') ?? 'http://localhost:5173';
    const hh = await this.prisma.household.findUnique({ where: { id: householdId } });
    await this.mail.sendInvite(email, hh?.name ?? 'Nayanam', `${webUrl}/invites/accept?token=${token}`);

    await this.recordEvent(householdId, userId, 'household.invite_created', { email, role });

    return { ...this.toInvite(invite), token };
  }

  async revokeInvite(userId: string, householdId: string, inviteId: string) {
    const role = await this.assertMember(userId, householdId);
    if (!['OWNER', 'ADMIN'].includes(role)) throw Errors.forbidden();
    await this.prisma.householdInvite.updateMany({
      where: { id: inviteId, householdId, revokedAt: null, acceptedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.recordEvent(householdId, userId, 'household.invite_revoked', { inviteId });
  }

  async acceptInvite(userId: string, rawToken: string) {
    const tokenHash = sha256Hex(rawToken);
    // This lookup intentionally bypasses scoping — it's how we discover the household.
    // We must use a raw client call that doesn't go through the household-scope guard.
    const invite = await this.prisma.$queryRaw<
      Array<{
        id: string;
        household_id: string;
        email: string;
        role: string;
        expires_at: Date;
        accepted_at: Date | null;
        revoked_at: Date | null;
      }>
    >`SELECT id, household_id, email, role, expires_at, accepted_at, revoked_at
       FROM household_invites WHERE token_hash = ${tokenHash} LIMIT 1`;

    const row = invite[0];
    if (!row) throw Errors.inviteInvalid();
    if (row.accepted_at || row.revoked_at) throw Errors.inviteInvalid();
    if (row.expires_at.getTime() < Date.now()) throw Errors.inviteInvalid();

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw Errors.authTokenInvalid();
    if (user.email.toLowerCase() !== row.email.toLowerCase()) throw Errors.inviteEmailMismatch();

    // Atomic: mark invite accepted + create membership (ignore if already member).
    await this.prisma.$transaction(async (tx) => {
      await tx.householdInvite.update({
        where: { id: row.id },
        data: { acceptedAt: new Date() },
      });
      const existing = await tx.householdMember.findUnique({
        where: { householdId_userId: { householdId: row.household_id, userId } },
      });
      if (!existing) {
        await tx.householdMember.create({
          data: {
            id: newId(),
            householdId: row.household_id,
            userId,
            role: row.role,
          },
        });
      }
    });

    await this.recordEvent(row.household_id, userId, 'household.invite_accepted', { inviteId: row.id });

    const hh = await this.prisma.household.findUnique({ where: { id: row.household_id } });
    if (!hh) throw Errors.householdNotFound();
    return this.toSummary(hh, row.role);
  }

  // ---- helpers ----

  private async assertMember(userId: string, householdId: string): Promise<string> {
    const m = await this.prisma.householdMember.findUnique({
      where: { householdId_userId: { householdId, userId } },
    });
    if (!m) throw Errors.householdNotFound();
    return m.role;
  }

  private toHousehold(hh: {
    id: string;
    name: string;
    defaultCurrencyCode: string;
    createdAt: Date;
  }) {
    return {
      id: hh.id,
      name: hh.name,
      defaultCurrencyCode: hh.defaultCurrencyCode,
      createdAt: hh.createdAt.toISOString(),
    };
  }

  private toSummary(
    hh: { id: string; name: string; defaultCurrencyCode: string },
    role: string,
  ) {
    return {
      id: hh.id,
      name: hh.name,
      role: role as 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER',
      defaultCurrencyCode: hh.defaultCurrencyCode,
    };
  }

  private toInvite(i: {
    id: string;
    email: string;
    role: string;
    expiresAt: Date;
    createdAt: Date;
    acceptedAt: Date | null;
    revokedAt: Date | null;
  }) {
    return {
      id: i.id,
      email: i.email,
      role: i.role as 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER',
      expiresAt: i.expiresAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
      acceptedAt: i.acceptedAt?.toISOString() ?? null,
      revokedAt: i.revokedAt?.toISOString() ?? null,
    };
  }

  private async recordEvent(householdId: string, actorId: string, type: string, payload: unknown) {
    await this.prisma.$executeRaw`INSERT INTO events (id, household_id, actor_id, type, payload)
      VALUES (${newId()}, ${householdId}, ${actorId}, ${type}, ${JSON.stringify(payload)}::jsonb)`;
  }

  private async recordEventTx(
    tx: Prisma.TransactionClient,
    householdId: string,
    actorId: string | null,
    type: string,
    payload: unknown,
  ) {
    await tx.$executeRaw`INSERT INTO events (id, household_id, actor_id, type, payload)
      VALUES (${newId()}, ${householdId}, ${actorId}, ${type}, ${JSON.stringify(payload)}::jsonb)`;
  }
}
