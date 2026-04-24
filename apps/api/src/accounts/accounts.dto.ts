import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

/**
 * Zod schemas for the Accounts endpoints. Mirrored by
 * `packages/core/src/accounts/schemas.ts` — keep the two in sync. DTOs here
 * wrap them for class-based DI injection and ZodValidationPipe.
 */

export const AccountTypeEnum = z.enum(['DEBIT', 'CREDIT', 'SAVINGS', 'CASH']);

export const CurrencyCodeSchema = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/, 'Currency code must be 3 uppercase letters.');

const NicknameSchema = z.string().min(1).max(60);
const InstitutionSchema = z.string().max(80).nullable().optional();
const Last4Schema = z
  .string()
  .regex(/^[0-9]{4}$/)
  .nullable()
  .optional();
const ColorTokenSchema = z.string().min(1).max(40).optional();
const IconTokenSchema = z.string().min(1).max(40).optional();

/** Signed decimal-string bigint in minor units. */
const MinorAmountStringSchema = z
  .string()
  .regex(/^-?\d+$/, 'Amount must be a signed integer string in minor units.');

export const CreateAccountSchema = z.object({
  nickname: NicknameSchema,
  type: AccountTypeEnum,
  currencyCode: CurrencyCodeSchema,
  institution: InstitutionSchema,
  last4: Last4Schema,
  colorToken: ColorTokenSchema,
  iconToken: IconTokenSchema,
  openingBalanceMinor: MinorAmountStringSchema.optional(),
  openingBalanceAt: z.string().datetime().optional(),
});
export class CreateAccountDto extends createZodDto(CreateAccountSchema) {}

/**
 * PATCH body. `type` and `currencyCode` are deliberately rejected when
 * present — the controller converts that to ACCOUNT_FIELD_IMMUTABLE. We use
 * `.passthrough()` then inspect keys in the service rather than
 * `.strict()`-ing here, because the error shape for that specific case is
 * ACCOUNT_FIELD_IMMUTABLE (422), not VALIDATION_ERROR.
 */
export const UpdateAccountSchema = z
  .object({
    nickname: NicknameSchema.optional(),
    institution: InstitutionSchema,
    last4: Last4Schema,
    colorToken: ColorTokenSchema,
    iconToken: IconTokenSchema,
    openingBalanceMinor: MinorAmountStringSchema.optional(),
    openingBalanceAt: z.string().datetime().optional(),
    // Deliberately allow-and-reject these fields in the service so the error
    // code is ACCOUNT_FIELD_IMMUTABLE not VALIDATION_ERROR.
    type: z.string().optional(),
    currencyCode: z.string().optional(),
  })
  .strict();
export class UpdateAccountDto extends createZodDto(UpdateAccountSchema) {}

export const ReorderEntrySchema = z.object({
  id: z.string().min(1),
  displayOrder: z.number().int().min(0),
});

export const ReorderAccountsSchema = z.object({
  order: z.array(ReorderEntrySchema).min(1).max(200),
});
export class ReorderAccountsDto extends createZodDto(ReorderAccountsSchema) {}

export const ListAccountsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  includeArchived: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .optional(),
});

export const BalanceHistoryQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).optional(),
});

export const BalanceHistoryAllQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).optional(),
});

export type AccountDTO = {
  id: string;
  householdId: string;
  nickname: string;
  type: 'DEBIT' | 'CREDIT' | 'SAVINGS' | 'CASH';
  currencyCode: string;
  institution: string | null;
  last4: string | null;
  colorToken: string;
  iconToken: string;
  openingBalanceMinor: string;
  openingBalanceAt: string;
  cachedBalanceMinor: string;
  cachedBalanceAt: string;
  displayOrder: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
