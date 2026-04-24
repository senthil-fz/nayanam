// Zod schemas for the Attachments domain. Wire shapes mirror the OpenAPI
// contract. Over-the-wire `size` is a decimal string (bigint-safe); we expose
// it to consumers as a string and let the platform-specific upload hook do
// the arithmetic.

import { z } from 'zod';

export const AttachmentOwnerTypeEnum = z.enum(['transaction', 'user', 'household']);
export type AttachmentOwnerType = z.infer<typeof AttachmentOwnerTypeEnum>;

export const AttachmentStatusEnum = z.enum(['PENDING', 'READY', 'FAILED']);
export type AttachmentStatus = z.infer<typeof AttachmentStatusEnum>;

export const AttachmentMimeEnum = z.enum([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
  'application/pdf',
]);
export type AttachmentMime = z.infer<typeof AttachmentMimeEnum>;

const BigIntString = z
  .string()
  .regex(/^\d+$/, 'must be a non-negative integer as a string');

export const AttachmentSchema = z.object({
  id: z.string().min(1),
  householdId: z.string().min(1),
  ownerType: AttachmentOwnerTypeEnum,
  ownerId: z.string().min(1),
  key: z.string().min(1),
  mime: AttachmentMimeEnum,
  size: BigIntString,
  originalFilename: z.string().min(1).max(255),
  thumbKey: z.string().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  status: AttachmentStatusEnum,
  createdBy: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
  // Transport-only (minted on URL endpoints)
  downloadUrl: z.string().optional(),
  thumbUrl: z.string().nullable().optional(),
  urlExpiresAt: z.string().optional(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

export const PresignUploadInput = z.object({
  ownerType: AttachmentOwnerTypeEnum,
  ownerId: z.string().min(1),
  filename: z.string().min(1).max(255),
  mime: AttachmentMimeEnum,
  size: BigIntString,
});
export type PresignUploadInputType = z.infer<typeof PresignUploadInput>;

export const PresignUploadResponse = z.object({
  attachmentId: z.string().min(1),
  key: z.string().min(1),
  uploadUrl: z.string().url(),
  requiredHeaders: z.record(z.string(), z.string()),
  expiresAt: z.string(),
});
export type PresignUploadResponseType = z.infer<typeof PresignUploadResponse>;

export const AttachmentListResponse = z.object({
  items: z.array(AttachmentSchema),
});
export type AttachmentListResponseType = z.infer<typeof AttachmentListResponse>;

export const AttachmentDownloadUrlResponse = z.object({
  url: z.string().url(),
  expiresAt: z.string(),
});
export type AttachmentDownloadUrlResponseType = z.infer<
  typeof AttachmentDownloadUrlResponse
>;

// Per-MIME size caps (bytes). Mirrors server enforcement.
export const ATTACHMENT_SIZE_CAPS: Record<AttachmentMime, number> = {
  'image/jpeg': 10 * 1024 * 1024,
  'image/png': 10 * 1024 * 1024,
  'image/heic': 10 * 1024 * 1024,
  'image/webp': 10 * 1024 * 1024,
  'application/pdf': 25 * 1024 * 1024,
};

export function isAllowedMime(mime: string): mime is AttachmentMime {
  return AttachmentMimeEnum.safeParse(mime).success;
}
