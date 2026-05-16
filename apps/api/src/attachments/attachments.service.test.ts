/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/**
 * Regression tests for AttachmentsService — B1 finalize MIME-mismatch guard.
 *
 * These are unit tests: PrismaService and StorageService are mocked so no real
 * DB or S3 is needed. The tests verify:
 *   1. finalize() rejects with ATTACHMENT_MIME_MISMATCH when head.mime differs
 *      from row.mime.
 *   2. finalize() does not reject with ATTACHMENT_MIME_MISMATCH when MIME matches.
 *   3. householdId scoping: the initial findFirst scopes by householdId.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { requestContext } from '../common/context.js';
import { AttachmentsService } from './attachments.service.js';

vi.mock('../bills/bills.service', () => ({
  recordEvent: vi.fn().mockResolvedValue(undefined),
}));

// Provide a realistic request context so getAuthOrThrow / getHouseholdOrThrow
// return values instead of throwing. This mirrors the real request pipeline.
function withContext<T>(fn: () => Promise<T>): Promise<T> {
  return requestContext.run(
    {
      auth: { userId: 'user-1', sessionId: 'session-1' },
      householdId: 'household-1',
      householdRole: 'ADMIN',
    },
    fn,
  );
}

const baseRow = {
  id: 'att-1',
  householdId: 'household-1',
  ownerType: 'transaction',
  ownerId: 'txn-1',
  key: 'households/household-1/txn/txn-1/att-1.pdf',
  mime: 'application/pdf',
  size: BigInt(1024),
  originalFilename: 'receipt.pdf',
  status: 'PENDING',
  thumbKey: null,
  width: null,
  height: null,
  createdBy: 'user-1',
  updatedBy: 'user-1',
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
  deletedAt: null,
};

describe('AttachmentsService.finalize — MIME mismatch guard (B1)', () => {
  let service: AttachmentsService;
  let prismaMock: {
    attachment: {
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
    $executeRaw: ReturnType<typeof vi.fn>;
  };
  let storageMock: {
    headObject: ReturnType<typeof vi.fn>;
    presignGet: ReturnType<typeof vi.fn>;
    getObjectBytes: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    prismaMock = {
      attachment: {
        findFirst: vi.fn(),
        update: vi.fn().mockResolvedValue(baseRow),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: vi.fn((cb: (tx: typeof prismaMock) => Promise<unknown>) => cb(prismaMock)),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };

    storageMock = {
      headObject: vi.fn(),
      presignGet: vi.fn().mockResolvedValue('https://example.com/signed'),
      getObjectBytes: vi.fn().mockResolvedValue(Buffer.from('')),
    };

    service = new AttachmentsService(
      prismaMock as never,
      storageMock as never,
    );
  });

  it('rejects with ATTACHMENT_MIME_MISMATCH when stored MIME differs from declared MIME', async () => {
    // Row says application/pdf; S3 reports text/html (the XSS attack vector).
    prismaMock.attachment.findFirst.mockResolvedValue({
      ...baseRow,
      mime: 'application/pdf',
    });
    storageMock.headObject.mockResolvedValue({
      size: 1024,
      mime: 'text/html',           // MIME mismatch
      etag: '"abc"',
      lastModified: new Date(),
    });

    await expect(withContext(() => service.finalize('att-1'))).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ATTACHMENT_MIME_MISMATCH' }),
    });

    // Status must be set to FAILED so the client must re-presign.
    expect(prismaMock.attachment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });

  it('rejects with ATTACHMENT_MIME_MISMATCH for SVG uploaded as application/pdf', async () => {
    prismaMock.attachment.findFirst.mockResolvedValue({
      ...baseRow,
      mime: 'application/pdf',
    });
    storageMock.headObject.mockResolvedValue({
      size: 1024,
      mime: 'image/svg+xml',       // SVG masquerading as PDF
      etag: '"abc"',
      lastModified: new Date(),
    });

    await expect(withContext(() => service.finalize('att-1'))).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ATTACHMENT_MIME_MISMATCH' }),
    });
  });

  it('does NOT reject with ATTACHMENT_MIME_MISMATCH when MIME matches', async () => {
    prismaMock.attachment.findFirst.mockResolvedValue({
      ...baseRow,
      mime: 'application/pdf',
    });
    storageMock.headObject.mockResolvedValue({
      size: 1024,
      mime: 'application/pdf',    // Matches — should pass the MIME guard
      etag: '"abc"',
      lastModified: new Date(),
    });
    const readyRow = { ...baseRow, status: 'READY' };
    prismaMock.attachment.update.mockResolvedValue(readyRow);

    // Should not throw ATTACHMENT_MIME_MISMATCH. Other errors may occur in the
    // mocked environment (e.g. sharp not available) — we only check the MIME code.
    try {
      await withContext(() => service.finalize('att-1'));
    } catch (err: unknown) {
      const e = err as { response?: { code?: string } };
      expect(e.response?.code).not.toBe('ATTACHMENT_MIME_MISMATCH');
    }
  });

  it('does NOT reject with ATTACHMENT_MIME_MISMATCH when head.mime is null', async () => {
    // Some S3-compatible stores omit Content-Type on HEAD. Skip the check
    // rather than false-positive reject.
    prismaMock.attachment.findFirst.mockResolvedValue({
      ...baseRow,
      mime: 'application/pdf',
    });
    storageMock.headObject.mockResolvedValue({
      size: 1024,
      mime: null,                  // No Content-Type header
      etag: '"abc"',
      lastModified: new Date(),
    });
    const readyRow = { ...baseRow, status: 'READY' };
    prismaMock.attachment.update.mockResolvedValue(readyRow);

    try {
      await withContext(() => service.finalize('att-1'));
    } catch (err: unknown) {
      const e = err as { response?: { code?: string } };
      expect(e.response?.code).not.toBe('ATTACHMENT_MIME_MISMATCH');
    }
  });

  it('scopes the initial findFirst by householdId (household isolation)', async () => {
    // findFirst returns null → simulates cross-household isolation
    prismaMock.attachment.findFirst.mockResolvedValue(null);

    await expect(withContext(() => service.finalize('att-1'))).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'RESOURCE_NOT_FOUND' }),
    });

    // Verify the query included householdId scoping.
    expect(prismaMock.attachment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ householdId: 'household-1' }),
      }),
    );
  });
});
