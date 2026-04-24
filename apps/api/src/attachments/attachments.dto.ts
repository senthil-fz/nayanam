import { z } from 'zod';

export const ATTACHMENT_MIME_ALLOWLIST = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
  'application/pdf',
] as const;
export type AttachmentMime = (typeof ATTACHMENT_MIME_ALLOWLIST)[number];

export const IMAGE_MIMES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
]);

export const ATTACHMENT_SIZE_CAPS: Record<AttachmentMime, number> = {
  'image/jpeg': 10 * 1024 * 1024,
  'image/png': 10 * 1024 * 1024,
  'image/heic': 10 * 1024 * 1024,
  'image/webp': 10 * 1024 * 1024,
  'application/pdf': 25 * 1024 * 1024,
};

export const AttachmentOwnerTypeSchema = z.enum(['transaction']);
export type AttachmentOwnerType = z.infer<typeof AttachmentOwnerTypeSchema>;

export const AttachmentMimeSchema = z.enum(ATTACHMENT_MIME_ALLOWLIST);

export const AttachmentStatusSchema = z.enum(['PENDING', 'READY', 'FAILED']);
export type AttachmentStatus = z.infer<typeof AttachmentStatusSchema>;

export const PresignUploadInputSchema = z.object({
  ownerType: AttachmentOwnerTypeSchema,
  ownerId: z.string().min(1),
  filename: z.string().min(1).max(255),
  mime: AttachmentMimeSchema,
  size: z.string().regex(/^[1-9][0-9]*$/),
});
export type PresignUploadDto = z.infer<typeof PresignUploadInputSchema>;

export const ListAttachmentsQuerySchema = z.object({
  ownerType: AttachmentOwnerTypeSchema,
  ownerId: z.string().min(1),
  includeFailed: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  includeDeleted: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
});
export type ListAttachmentsQuery = z.infer<typeof ListAttachmentsQuerySchema>;

export type AttachmentDTO = {
  id: string;
  householdId: string;
  ownerType: AttachmentOwnerType;
  ownerId: string;
  key: string;
  mime: AttachmentMime;
  /** byte size as decimal string (bigint-safe over JSON). */
  size: string;
  originalFilename: string;
  thumbKey: string | null;
  width: number | null;
  height: number | null;
  status: AttachmentStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  /** Transport-only; present only when URLs have been minted. */
  downloadUrl?: string;
  thumbUrl?: string | null;
  urlExpiresAt?: string;
};

export type PresignUploadResponseDTO = {
  attachmentId: string;
  key: string;
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
  expiresAt: string;
};

export type AttachmentDownloadUrlResponseDTO = {
  url: string;
  expiresAt: string;
};
