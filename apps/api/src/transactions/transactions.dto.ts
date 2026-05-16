import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  TransactionTypeEnum as CoreTransactionTypeEnum,
  CreateTransactionTypeEnum as CoreCreateTransactionTypeEnum,
  CreateTransactionInput,
  UpdateTransactionInput,
  HomePeriodEnum,
  type Transaction,
} from '@nayanam/core/transactions/schemas';

/**
 * Transactions DTOs. Body schemas derive from the shared `@nayanam/core`
 * schemas (B4). Query schemas stay local — Express string-coercion variants.
 */

export const TransactionTypeEnum = CoreTransactionTypeEnum;
export const CreateTransactionTypeEnum = CoreCreateTransactionTypeEnum;

/**
 * Create body. The shared `CreateTransactionInput` restricts `type` to
 * INCOME|EXPENSE; the API widens it to also accept TRANSFER so the service
 * can emit a useful VALIDATION_ERROR message. Server-only widening — local
 * `.extend`, not pushed into core.
 */
export const CreateTransactionSchema = CreateTransactionInput.extend({
  type: CoreTransactionTypeEnum,
});
export class CreateTransactionDto extends createZodDto(CreateTransactionSchema) {}

/**
 * PATCH body. `type`, `currencyCode`, `transferId` are accepted-but-rejected
 * (service emits VALIDATION_ERROR). Server-only stubs — local `.extend`.
 */
export const UpdateTransactionSchema = UpdateTransactionInput.extend({
  type: z.string().optional(),
  currencyCode: z.string().optional(),
  transferId: z.string().optional(),
}).strict();
export class UpdateTransactionDto extends createZodDto(UpdateTransactionSchema) {}

export const BulkCreateTransactionsSchema = z.object({
  items: z.array(CreateTransactionSchema).min(1).max(500),
});
export class BulkCreateTransactionsDto extends createZodDto(BulkCreateTransactionsSchema) {}

export const PeriodEnum = HomePeriodEnum;

/**
 * `period` and `from`/`to` are mutually exclusive; if both land the service
 * rejects with VALIDATION_ERROR (controller passes raw fields through so the
 * service can distinguish "both supplied" from "neither supplied").
 */
export const PeriodSummaryQuerySchema = z
  .object({
    period: HomePeriodEnum.optional(),
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
    type: CoreTransactionTypeEnum.optional(),
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

/** Wire shape for a transaction row — the shared `Transaction` type from core. */
export type TransactionDTO = Transaction;
