import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  BillCycleEnum as CoreBillCycleEnum,
  BillStatusEnum as CoreBillStatusEnum,
  BillPaymentSourceEnum as CoreBillPaymentSourceEnum,
  CreateBillInput,
  UpdateBillInput,
  MarkBillPaidInput,
  ReorderBillsInput,
  type Bill,
  type BillPayment,
} from '@nayanam/core/bills/schemas';

/**
 * Bills DTOs. Body schemas derive from the shared `@nayanam/core` schemas
 * (B4). Query schemas stay local — Express string-coercion variants.
 */

export const BillCycleEnum = CoreBillCycleEnum;
export const BillStatusEnum = CoreBillStatusEnum;
export const BillPaymentSourceEnum = CoreBillPaymentSourceEnum;

/**
 * Create body. `currencyCode` is accepted-but-ignored per contract to simplify
 * clients — that server-only stub is not part of the shared form schema, so we
 * extend the shared `CreateBillInput` locally.
 */
export const CreateBillSchema = CreateBillInput.extend({
  currencyCode: z.string().optional(),
}).strict();
export class CreateBillDto extends createZodDto(CreateBillSchema) {}

/**
 * PATCH body. `currencyCode` is accepted-but-rejected with
 * BILL_CURRENCY_IMMUTABLE at the service layer. Server-only stub — local
 * `.extend`.
 */
export const UpdateBillSchema = UpdateBillInput.extend({
  currencyCode: z.string().optional(),
}).strict();
export class UpdateBillDto extends createZodDto(UpdateBillSchema) {}

export const MarkBillPaidSchema = MarkBillPaidInput.strict();
export class MarkBillPaidDto extends createZodDto(MarkBillPaidSchema) {}

export const ReorderBillsEntrySchema = z.object({
  id: z.string().min(1),
  displayOrder: z.number().int().min(0),
});
export const ReorderBillsSchema = ReorderBillsInput.strict();
export class ReorderBillsDto extends createZodDto(ReorderBillsSchema) {}

export const ListBillsQuerySchema = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    filter: z.enum(['all', 'due-soon', 'active', 'paused']).optional(),
    status: CoreBillStatusEnum.optional(),
    includeArchived: z
      .union([z.boolean(), z.string()])
      .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
      .optional(),
  })
  .passthrough();

export const ListBillPaymentsQuerySchema = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    includeDeleted: z
      .union([z.boolean(), z.string()])
      .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
      .optional(),
  })
  .passthrough();

export const UpcomingQuerySchema = z
  .object({
    days: z.coerce.number().int().min(1).max(60).optional(),
  })
  .passthrough();

/** Wire shapes — shared `Bill` / `BillPayment` types from core. */
export type BillDTO = Bill;
export type BillPaymentDTO = BillPayment;
