import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const TransactionTypeEnum = z.enum(['INCOME', 'EXPENSE', 'TRANSFER']);
export const CreateTransactionTypeEnum = z.enum(['INCOME', 'EXPENSE']);

const PositiveMinorSchema = z
  .string()
  .regex(/^[1-9]\d*$/, 'Amount must be a positive integer string in minor units.');

const CurrencyCodeSchema = z.string().regex(/^[A-Z]{3}$/);
const NoteSchema = z.string().max(500).nullable();

export const CreateTransactionSchema = z.object({
  accountId: z.string().min(1),
  categoryId: z.string().min(1),
  // Accept TRANSFER here so service emits VALIDATION_ERROR with a useful message.
  type: TransactionTypeEnum,
  amountMinor: PositiveMinorSchema,
  currencyCode: CurrencyCodeSchema,
  occurredAt: z.string().datetime().optional(),
  note: NoteSchema.optional(),
});
export class CreateTransactionDto extends createZodDto(CreateTransactionSchema) {}

export const UpdateTransactionSchema = z
  .object({
    accountId: z.string().min(1).optional(),
    categoryId: z.string().min(1).optional(),
    amountMinor: PositiveMinorSchema.optional(),
    occurredAt: z.string().datetime().optional(),
    note: NoteSchema.optional(),
    // Any of these trigger VALIDATION_ERROR at service layer.
    type: z.string().optional(),
    currencyCode: z.string().optional(),
    transferId: z.string().optional(),
  })
  .strict();
export class UpdateTransactionDto extends createZodDto(UpdateTransactionSchema) {}

export const BulkCreateTransactionsSchema = z.object({
  items: z.array(CreateTransactionSchema).min(1).max(500),
});
export class BulkCreateTransactionsDto extends createZodDto(BulkCreateTransactionsSchema) {}

export const PeriodEnum = z.enum(['day', 'week', 'month', 'year']);

/**
 * `period` and `from`/`to` are mutually exclusive; if both land the service
 * rejects with VALIDATION_ERROR (controller passes raw fields through so the
 * service can distinguish "both supplied" from "neither supplied").
 */
export const PeriodSummaryQuerySchema = z
  .object({
    period: PeriodEnum.optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  })
  .passthrough();

export const ListTransactionsQuerySchema = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    accountId: z.union([z.array(z.string()), z.string()]).optional(),
    categoryId: z.union([z.array(z.string()), z.string()]).optional(),
    type: TransactionTypeEnum.optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    q: z.string().trim().min(1).max(100).optional(),
    includeDeleted: z
      .union([z.boolean(), z.string()])
      .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
      .optional(),
    transferId: z.string().optional(),
  })
  .passthrough();

export type TransactionDTO = {
  id: string;
  householdId: string;
  accountId: string;
  categoryId: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  amountMinor: string;
  currencyCode: string;
  occurredAt: string;
  note: string | null;
  transferId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
