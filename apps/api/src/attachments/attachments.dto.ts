import { z } from 'zod';
import {
  AttachmentOwnerTypeEnum,
  AttachmentMimeEnum,
  AttachmentStatusEnum,
  ATTACHMENT_SIZE_CAPS,
  PresignUploadInput,
  type AttachmentOwnerType,
  type AttachmentMime,
  type AttachmentStatus,
  type Attachment,
  type PresignUploadResponseType,
  type AttachmentDownloadUrlResponseType,
} from '@nayanam/core/attachments/schemas';

/**
 * Attachments DTOs. Enums, size caps, the presign input schema and the wire
 * types come from the shared `@nayanam/core` schemas (B4). The MIME allowlist
 * and the image-MIME set below are server-enforcement constants — kept local
 * but derived from the shared `AttachmentMimeEnum`.
 */

export { ATTACHMENT_SIZE_CAPS };
export type { AttachmentOwnerType, AttachmentMime, AttachmentStatus };

// Server-side MIME allowlist — the exact set of the shared enum, as a tuple so
// `.includes()` keeps its narrowed element type.
export const ATTACHMENT_MIME_ALLOWLIST = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
  'application/pdf',
] as const;

export const IMAGE_MIMES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
]);

export const AttachmentOwnerTypeSchema = AttachmentOwnerTypeEnum;
export const AttachmentMimeSchema = AttachmentMimeEnum;
export const AttachmentStatusSchema = AttachmentStatusEnum;

export const PresignUploadInputSchema = PresignUploadInput;
export type PresignUploadDto = z.infer<typeof PresignUploadInputSchema>;

// Local — Express string-coercion variant of the core typed query shape.
export const ListAttachmentsQuerySchema = z.object({
  ownerType: AttachmentOwnerTypeEnum,
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

/** Wire shapes — shared `Attachment` types from core. */
export type AttachmentDTO = Attachment;
export type PresignUploadResponseDTO = PresignUploadResponseType;
export type AttachmentDownloadUrlResponseDTO = AttachmentDownloadUrlResponseType;
