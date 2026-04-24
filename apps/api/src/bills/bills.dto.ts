import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

/** Mirrors `packages/core/src/bills/schemas.ts`. Kept here for class-based DI. */

export const BillCycleEnum = z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM_DAYS']);
export const BillStatusEnum = z.enum(['ACTIVE', 'PAUSED']);
export const BillPaymentSourceEnum = z.enum(['MANUAL', 'AUTO_LOG', 'BACKFILL']);

const PositiveMinorSchema = z
  .string()
  .regex(/^[1-9]\d*$/, 'Amount must be a positive integer string in minor units.');
const NoteSchema = z.string().max(500).nullable();
const NameSchema = z.string().trim().min(1).max(80);
const ColorTokenSchema = z.string().max(40).nullable();
const IconTokenSchema = z.string().max(40).nullable();
const CustomDaysSchema = z.number().int().min(1).max(366).nullable();

export const CreateBillSchema = z
  .object({
    name: NameSchema,
    amountMinor: PositiveMinorSchema,
    accountId: z.string().min(1),
    categoryId: z.string().min(1),
    cycle: BillCycleEnum,
    customDays: CustomDaysSchema.optional(),
    startAt: z.string().datetime().optional(),
    autoLog: z.boolean().optional(),
    note: NoteSchema.optional(),
    colorToken: ColorTokenSchema.optional(),
    iconToken: IconTokenSchema.optional(),
    endAt: z.string().datetime().nullable().optional(),
    // `currencyCode` is accepted-but-ignored per contract to simplify clients.
    currencyCode: z.string().optional(),
  })
  .strict();
export class CreateBillDto extends createZodDto(CreateBillSchema) {}

export const UpdateBillSchema = z
  .object({
    name: NameSchema.optional(),
    amountMinor: PositiveMinorSchema.optional(),
    accountId: z.string().min(1).optional(),
    categoryId: z.string().min(1).optional(),
    cycle: BillCycleEnum.optional(),
    customDays: CustomDaysSchema.optional(),
    startAt: z.string().datetime().optional(),
    autoLog: z.boolean().optional(),
    note: NoteSchema.optional(),
    colorToken: ColorTokenSchema.optional(),
    iconToken: IconTokenSchema.optional(),
    endAt: z.string().datetime().nullable().optional(),
    // Reject at service layer with BILL_CURRENCY_IMMUTABLE if present.
    currencyCode: z.string().optional(),
  })
  .strict();
export class UpdateBillDto extends createZodDto(UpdateBillSchema) {}

export const MarkBillPaidSchema = z
  .object({
    amountMinor: PositiveMinorSchema.optional(),
    occurredAt: z.string().datetime().optional(),
    note: NoteSchema.optional(),
    source: BillPaymentSourceEnum.optional(),
  })
  .strict();
export class MarkBillPaidDto extends createZodDto(MarkBillPaidSchema) {}

export const ReorderBillsEntrySchema = z.object({
  id: z.string().min(1),
  displayOrder: z.number().int().min(0),
});
export const ReorderBillsSchema = z
  .object({ order: z.array(ReorderBillsEntrySchema).min(1).max(500) })
  .strict();
export class ReorderBillsDto extends createZodDto(ReorderBillsSchema) {}

export const ListBillsQuerySchema = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    filter: z.enum(['all', 'due-soon', 'active', 'paused']).optional(),
    status: BillStatusEnum.optional(),
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

export type BillDTO = {
  id: string;
  householdId: string;
  name: string;
  amountMinor: string;
  currencyCode: string;
  accountId: string;
  categoryId: string;
  cycle: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM_DAYS';
  customDays: number | null;
  startAt: string;
  nextDueAt: string;
  endAt: string | null;
  status: 'ACTIVE' | 'PAUSED';
  autoLog: boolean;
  lastPaidAt: string | null;
  note: string | null;
  colorToken: string | null;
  iconToken: string | null;
  displayOrder: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BillPaymentDTO = {
  id: string;
  householdId: string;
  billId: string;
  transactionId: string | null;
  cycleDueAt: string;
  paidAt: string;
  amountMinor: string;
  source: 'MANUAL' | 'AUTO_LOG' | 'BACKFILL';
  deletedAt: string | null;
  createdAt: string;
};
