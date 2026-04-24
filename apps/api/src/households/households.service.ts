import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

  async update(userId: string, householdId: string, patch: { name?: string; defaultCurrencyCode?: string }) {
    const role = await this.assertMember(userId, householdId);
    if (!['OWNER', 'ADMIN'].includes(role)) throw Errors.forbidden('Requires OWNER or ADMIN.');
    const hh = await this.prisma.household.update({
      where: { id: householdId },
      data: { ...patch, updatedBy: userId, updatedAt: new Date() },
    });
    await this.recordEvent(householdId, userId, 'household.updated', patch);
    return this.toHousehold(hh);
  }

  async listMembers(userId: string, householdId: string) {
    await this.assertMember(userId, householdId);
    const rows = await this.prisma.householdMember.findMany({
      where: { householdId },
      include: { user: true },
      orderBy: { joinedAt: 'asc' },
    });
    return rows.map((m) => ({
      id: m.id,
      userId: m.userId,
      email: m.user.email,
      name: m.user.name,
      role: m.role as 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER',
      joinedAt: m.joinedAt.toISOString(),
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
}
