import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  AccountTypeEnum as CoreAccountTypeEnum,
  CurrencyCode,
  CreateAccountInput,
  UpdateAccountInput,
  ReorderAccountsInput,
  type Account,
} from '@nayanam/core/accounts/schemas';

/**
 * Accounts DTOs. Request body schemas are the shared Zod schemas from
 * `@nayanam/core` — the single source of truth (B4). `createZodDto` wraps
 * them for class-based DI + the global `ZodValidationPipe`.
 *
 * Query schemas stay local: they are Express string-coercion variants
 * (`z.coerce`, string→boolean transforms) of the core typed query shapes and
 * are server-only — web/mobile pass already-typed objects.
 */

// Re-export the shared enum / currency schemas so existing importers keep
// resolving them from this module.
export const AccountTypeEnum = CoreAccountTypeEnum;
export const CurrencyCodeSchema = CurrencyCode;

export class CreateAccountDto extends createZodDto(CreateAccountInput) {}

/**
 * PATCH body. `type` and `currencyCode` are deliberately accepted-but-rejected
 * — the service converts their presence to ACCOUNT_FIELD_IMMUTABLE (422), not
 * a generic VALIDATION_ERROR. Those immutable-field stubs are server-only and
 * must NOT live in core (the client form schema should not offer them), so we
 * extend the shared `UpdateAccountInput` locally.
 */
export const UpdateAccountSchema = UpdateAccountInput.extend({
  type: z.string().optional(),
  currencyCode: z.string().optional(),
}).strict();
export class UpdateAccountDto extends createZodDto(UpdateAccountSchema) {}

export const ReorderEntrySchema = z.object({
  id: z.string().min(1),
  displayOrder: z.number().int().min(0),
});

export class ReorderAccountsDto extends createZodDto(ReorderAccountsInput) {}

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

/** Wire shape for an account row — the shared `Account` type from core. */
export type AccountDTO = Account;
