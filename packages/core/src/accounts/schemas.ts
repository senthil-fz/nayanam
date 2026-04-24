// Zod schemas for the Account domain. Shared by web + mobile.
// Match `packages/contracts/openapi.yaml` exactly — bigints are strings on the wire.

import { z } from 'zod';

export const AccountTypeEnum = z.enum(['DEBIT', 'CREDIT', 'SAVINGS', 'CASH']);
export type AccountType = z.infer<typeof AccountTypeEnum>;

export const CurrencyCode = z.string().regex(/^[A-Z]{3}$/);
export type CurrencyCodeType = z.infer<typeof CurrencyCode>;

const MinorAmountString = z
  .string()
  .regex(/^-?\d+$/, 'must be a signed integer as a string');

export const AccountSchema = z.object({
  id: z.string().min(1),
  householdId: z.string().min(1),
  nickname: z.string().min(1).max(60),
  type: AccountTypeEnum,
  currencyCode: CurrencyCode,
  institution: z.string().max(80).nullable(),
  last4: z
    .string()
    .regex(/^[0-9]{4}$/)
    .nullable(),
  colorToken: z.string(),
  iconToken: z.string(),
  openingBalanceMinor: MinorAmountString,
  openingBalanceAt: z.string().datetime(),
  cachedBalanceMinor: MinorAmountString,
  cachedBalanceAt: z.string().datetime(),
  displayOrder: z.number().int().nonnegative(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Account = z.infer<typeof AccountSchema>;

export const CreateAccountInput = z.object({
  nickname: z.string().min(1).max(60),
  type: AccountTypeEnum,
  currencyCode: CurrencyCode,
  institution: z.string().max(80).nullable().optional(),
  last4: z
    .string()
    .regex(/^[0-9]{4}$/)
    .nullable()
    .optional(),
  colorToken: z.string().optional(),
  iconToken: z.string().optional(),
  openingBalanceMinor: MinorAmountString.optional(),
  openingBalanceAt: z.string().datetime().optional(),
});
export type CreateAccountInputType = z.infer<typeof CreateAccountInput>;

export const UpdateAccountInput = z
  .object({
    nickname: z.string().min(1).max(60),
    institution: z.string().max(80).nullable(),
    last4: z
      .string()
      .regex(/^[0-9]{4}$/)
      .nullable(),
    colorToken: z.string(),
    iconToken: z.string(),
    openingBalanceMinor: MinorAmountString,
    openingBalanceAt: z.string().datetime(),
  })
  .partial();
export type UpdateAccountInputType = z.infer<typeof UpdateAccountInput>;

export const BalanceHistoryPoint = z.object({
  bucket: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  asOf: z.string().datetime(),
  balanceMinor: MinorAmountString,
});
export type BalanceHistoryPointType = z.infer<typeof BalanceHistoryPoint>;

export const BalanceHistoryResponse = z.object({
  accountId: z.string(),
  currencyCode: CurrencyCode,
  points: z.array(BalanceHistoryPoint),
});
export type BalanceHistoryResponseType = z.infer<typeof BalanceHistoryResponse>;

export const AccountsSummaryBucket = z.object({
  currencyCode: CurrencyCode,
  totalMinor: MinorAmountString,
  accountCount: z.number().int().nonnegative(),
});
export type AccountsSummaryBucketType = z.infer<typeof AccountsSummaryBucket>;

export const AccountsSummary = z.object({
  byCurrency: z.array(AccountsSummaryBucket),
  totalAccounts: z.number().int().nonnegative(),
  asOf: z.string().datetime(),
});
export type AccountsSummaryType = z.infer<typeof AccountsSummary>;

export const ReorderAccountsEntry = z.object({
  id: z.string(),
  displayOrder: z.number().int().nonnegative(),
});

export const ReorderAccountsInput = z.object({
  order: z.array(ReorderAccountsEntry),
});
export type ReorderAccountsInputType = z.infer<typeof ReorderAccountsInput>;
