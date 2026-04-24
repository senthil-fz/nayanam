import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type Attachment as AttachmentRow } from '@prisma/client';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { Errors } from '../common/errors';
import { newId } from '../common/ids';
import { getAuthOrThrow, getContext, getHouseholdOrThrow } from '../common/context';
import { roleAtLeast, type HouseholdRole } from '../common/household-header.guard';
import { recordEvent } from '../bills/bills.service';
import {
  ATTACHMENT_MIME_ALLOWLIST,
  ATTACHMENT_SIZE_CAPS,
  IMAGE_MIMES,
  type AttachmentDTO,
  type AttachmentDownloadUrlResponseDTO,
  type AttachmentMime,
  type AttachmentOwnerType,
  type AttachmentStatus,
  type ListAttachmentsQuery,
  type PresignUploadDto,
  type PresignUploadResponseDTO,
} from './attachments.dto';

const MEMBER: HouseholdRole = 'MEMBER';
const VIEWER: HouseholdRole = 'VIEWER';
const ADMIN: HouseholdRole = 'ADMIN';

const PRESIGN_PUT_TTL_SEC = 300;
const PRESIGN_GET_TTL_SEC = 300;
const RESTORE_WINDOW_MS = 24 * 60 * 60 * 1000;
const LIST_CAP = 50;
const THUMB_MAX_BYTES = 25 * 1024 * 1024;

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ---- mutations ----

  async presignUpload(input: PresignUploadDto): Promise<PresignUploadResponseDTO> {
    this.assertRole(MEMBER);
    const householdId = getHouseholdOrThrow();
    const { userId } = getAuthOrThrow();

    if (!ATTACHMENT_MIME_ALLOWLIST.includes(input.mime)) {
      throw Errors.attachmentMimeNotAllowed(input.mime);
    }
    const size = this.parseSize(input.size);
    const cap = ATTACHMENT_SIZE_CAPS[input.mime];
    if (size > cap) {
      throw Errors.attachmentTooLarge({ size: input.size, cap, mime: input.mime });
    }

    await this.assertOwnerExists(input.ownerType, input.ownerId, householdId);

    const attachmentId = newId();
    const ext = mimeToExtension(input.mime);
    const ownerSegment = ownerKeySegment(input.ownerType);
    const key = `households/${householdId}/${ownerSegment}/${input.ownerId}/${attachmentId}.${ext}`;
    const filename = sanitizeFilename(input.filename);

    await this.prisma.attachment.create({
      data: {
        id: attachmentId,
        householdId,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        key,
        mime: input.mime,
        size: BigInt(size),
        originalFilename: filename,
        status: 'PENDING',
        createdBy: userId,
      },
    });

    const presign = await this.storage.presignPut(key, input.mime, PRESIGN_PUT_TTL_SEC);

    return {
      attachmentId,
      key,
      uploadUrl: presign.url,
      requiredHeaders: presign.requiredHeaders,
      expiresAt: presign.expiresAt.toISOString(),
    };
  }

  async finalize(id: string): Promise<AttachmentDTO> {
    this.assertRole(MEMBER);
    const { userId } = getAuthOrThrow();
    const householdId = getHouseholdOrThrow();

    const row = await this.prisma.attachment.findFirst({
      where: { id, householdId, deletedAt: null },
    });
    if (!row) throw Errors.notFound();

    // Only creator or ADMIN+ may finalize.
    if (row.createdBy !== userId && !this.hasRole(ADMIN)) {
      throw Errors.forbiddenRole();
    }
    if (row.status === 'READY') {
      throw Errors.attachmentAlreadyFinalized();
    }

    const head = await this.storage.headObject(row.key);
    if (!head) {
      await this.prisma.attachment.update({
        where: { id: row.id },
        data: { status: 'FAILED', updatedAt: new Date() },
      });
      throw Errors.attachmentFinalizeFailed({ reason: 'object_missing' });
    }
    if (head.size !== Number(row.size)) {
      await this.prisma.attachment.update({
        where: { id: row.id },
        data: { status: 'FAILED', updatedAt: new Date() },
      });
      throw Errors.attachmentSizeMismatch({ declared: row.size.toString(), observed: head.size });
    }

    // Generate thumbnail + metadata inline for images. PDFs are passed through.
    let thumbKey: string | null = null;
    let width: number | null = null;
    let height: number | null = null;

    if (IMAGE_MIMES.has(row.mime)) {
      try {
        if (head.size > THUMB_MAX_BYTES) {
          this.logger.warn(
            `skip thumbnail for ${row.id}: object exceeds ${THUMB_MAX_BYTES} bytes`,
          );
        } else {
          const original = await this.storage.getObjectBytes(row.key);
          try {
            const meta = await sharp(original).metadata();
            width = typeof meta.width === 'number' ? meta.width : null;
            height = typeof meta.height === 'number' ? meta.height : null;
          } catch (metaErr) {
            this.logger.warn(`sharp.metadata failed for ${row.id}: ${String(metaErr)}`);
          }
          try {
            const thumb = await sharp(original)
              .rotate()
              .resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true })
              .webp({ quality: 80 })
              .toBuffer();
            const derivedKey = `${row.key}.thumb.webp`;
            await this.storage.uploadBuffer(derivedKey, thumb, 'image/webp');
            thumbKey = derivedKey;
          } catch (thumbErr) {
            // HEIC without libheif lands here; accept and move on.
            this.logger.warn(`thumbnail generation failed for ${row.id}: ${String(thumbErr)}`);
          }
        }
      } catch (err) {
        this.logger.warn(`thumbnail pipeline failed for ${row.id}: ${String(err)}`);
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.attachment.update({
        where: { id: row.id },
        data: {
          status: 'READY',
          thumbKey,
          width,
          height,
          updatedAt: new Date(),
        },
      });
      await recordEvent(tx, householdId, userId, 'attachment.uploaded', {
        attachmentId: next.id,
        ownerType: next.ownerType,
        ownerId: next.ownerId,
        mime: next.mime,
        size: next.size.toString(),
        householdId,
      });
      return next;
    });

    return this.toDTOWithUrls(updated);
  }

  async list(
    params: ListAttachmentsQuery,
  ): Promise<{ items: AttachmentDTO[] }> {
    this.assertRole(VIEWER);
    const householdId = getHouseholdOrThrow();

    const where: Prisma.AttachmentWhereInput = {
      householdId,
      ownerType: params.ownerType,
      ownerId: params.ownerId,
      ...(params.includeDeleted ? {} : { deletedAt: null }),
    };
    if (!params.includeFailed) {
      where.status = { in: ['PENDING', 'READY'] };
    }

    const rows = await this.prisma.attachment.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: LIST_CAP,
    });

    const items = await Promise.all(rows.map((r) => this.toDTOWithUrls(r)));
    return { items };
  }

  async getOne(id: string): Promise<AttachmentDTO> {
    this.assertRole(VIEWER);
    const householdId = getHouseholdOrThrow();
    const row = await this.prisma.attachment.findFirst({
      where: { id, householdId, deletedAt: null },
    });
    if (!row) throw Errors.notFound();
    return this.toDTOWithUrls(row);
  }

  async refreshDownloadUrl(id: string): Promise<AttachmentDownloadUrlResponseDTO> {
    this.assertRole(VIEWER);
    const householdId = getHouseholdOrThrow();
    const row = await this.prisma.attachment.findFirst({
      where: { id, householdId, deletedAt: null },
    });
    if (!row) throw Errors.notFound();
    const url = await this.storage.presignGet(row.key, PRESIGN_GET_TTL_SEC);
    return {
      url,
      expiresAt: new Date(Date.now() + PRESIGN_GET_TTL_SEC * 1000).toISOString(),
    };
  }

  async softDelete(id: string): Promise<void> {
    this.assertRole(MEMBER);
    const { userId } = getAuthOrThrow();
    const householdId = getHouseholdOrThrow();

    const row = await this.prisma.attachment.findFirst({
      where: { id, householdId, deletedAt: null },
    });
    if (!row) throw Errors.notFound();

    const isOwn = row.createdBy === userId;
    if (!isOwn && !this.hasRole(ADMIN)) {
      throw Errors.forbiddenRole();
    }

    // We intentionally do NOT delete the S3 objects on soft-delete so the
    // 24h restore window remains meaningful. Object GC is the responsibility
    // of a future hard-delete/reaper path (spec §Rollout + §Edge cases).
    await this.prisma.$transaction(async (tx) => {
      await tx.attachment.update({
        where: { id: row.id },
        data: { deletedAt: new Date(), updatedAt: new Date() },
      });
      await recordEvent(tx, householdId, userId, 'attachment.deleted', {
        attachmentId: row.id,
        ownerType: row.ownerType,
        ownerId: row.ownerId,
        householdId,
      });
    });
  }

  async restore(id: string): Promise<AttachmentDTO> {
    this.assertRole(ADMIN);
    const { userId } = getAuthOrThrow();
    const householdId = getHouseholdOrThrow();

    // Bypass soft-delete filter by querying via findFirst with explicit deletedAt.
    const row = await this.prisma.attachment.findFirst({
      where: { id, householdId, deletedAt: { not: null } },
    });
    if (!row || !row.deletedAt) throw Errors.notFound();

    if (Date.now() - row.deletedAt.getTime() > RESTORE_WINDOW_MS) {
      throw Errors.attachmentNotRestorable();
    }
    const head = await this.storage.headObject(row.key);
    if (!head) throw Errors.attachmentNotRestorable();

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.attachment.update({
        where: { id: row.id },
        data: { deletedAt: null, updatedAt: new Date() },
      });
      await recordEvent(tx, householdId, userId, 'attachment.restored', {
        attachmentId: row.id,
        householdId,
      });
      return next;
    });

    return this.toDTOWithUrls(updated);
  }

  // ---- helpers ----

  private async assertOwnerExists(
    ownerType: AttachmentOwnerType,
    ownerId: string,
    householdId: string,
  ): Promise<void> {
    if (ownerType === 'transaction') {
      const tx = await this.prisma.transaction.findFirst({
        where: { id: ownerId, householdId, deletedAt: null },
        select: { id: true },
      });
      if (!tx) throw Errors.attachmentOwnerNotFound();
      return;
    }
    // Forward-compat: enum currently limits to 'transaction', but keep a guard.
    throw Errors.attachmentOwnerNotFound();
  }

  private parseSize(raw: string): number {
    if (!/^[1-9][0-9]*$/.test(raw)) {
      throw Errors.validation('size must be a positive integer string.', { field: 'size' });
    }
    // Cap values at MAX_SAFE_INTEGER — our 25MB cap is far smaller so this
    // never bites legitimate inputs; malicious huge strings are rejected here.
    if (raw.length > 16) {
      throw Errors.attachmentTooLarge({ size: raw });
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
      throw Errors.validation('size must be a positive integer string.', { field: 'size' });
    }
    return n;
  }

  private async toDTOWithUrls(row: AttachmentRow): Promise<AttachmentDTO> {
    let downloadUrl: string | undefined;
    let thumbUrl: string | null | undefined;
    let urlExpiresAt: string | undefined;

    if (row.status === 'READY') {
      try {
        downloadUrl = await this.storage.presignGet(row.key, PRESIGN_GET_TTL_SEC);
        if (row.thumbKey) {
          thumbUrl = await this.storage.presignGet(row.thumbKey, PRESIGN_GET_TTL_SEC);
        } else {
          thumbUrl = null;
        }
        urlExpiresAt = new Date(Date.now() + PRESIGN_GET_TTL_SEC * 1000).toISOString();
      } catch (err) {
        // URL minting failure shouldn't nuke the whole list response — leave
        // URLs absent and let the client call /download-url on demand.
        this.logger.warn(`presignGet failed for ${row.id}: ${String(err)}`);
      }
    }

    return {
      id: row.id,
      householdId: row.householdId,
      ownerType: row.ownerType as AttachmentOwnerType,
      ownerId: row.ownerId,
      key: row.key,
      mime: row.mime as AttachmentMime,
      size: row.size.toString(),
      originalFilename: row.originalFilename,
      thumbKey: row.thumbKey,
      width: row.width,
      height: row.height,
      status: row.status as AttachmentStatus,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
      ...(downloadUrl ? { downloadUrl } : {}),
      ...(thumbUrl !== undefined ? { thumbUrl } : {}),
      ...(urlExpiresAt ? { urlExpiresAt } : {}),
    };
  }

  private assertRole(min: HouseholdRole) {
    if (!this.hasRole(min)) throw Errors.forbiddenRole();
  }

  private hasRole(min: HouseholdRole): boolean {
    const role = getContext()?.householdRole;
    return Boolean(role && roleAtLeast(role, min));
  }
}

function sanitizeFilename(name: string): string {
  const trimmed = name.trim();
  // Strip any path components a client may have included.
  const baseName = trimmed.replace(/^.*[\\/]/, '');
  const clipped = baseName.slice(0, 255);
  return clipped.length > 0 ? clipped : 'upload';
}

function mimeToExtension(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/heic':
      return 'heic';
    case 'image/webp':
      return 'webp';
    case 'application/pdf':
      return 'pdf';
    default:
      return 'bin';
  }
}

function ownerKeySegment(ownerType: AttachmentOwnerType): string {
  switch (ownerType) {
    case 'transaction':
      return 'txn';
    default:
      return String(ownerType);
  }
}
