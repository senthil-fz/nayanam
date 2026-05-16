import { z } from 'zod';

export const moneySchema = z.object({
  // String-encoded integer to match the DB BigInt and ApiMoney wire format.
  // Use z.string().regex rather than z.number() — BigInt values exceed
  // Number.MAX_SAFE_INTEGER for very large amounts and JSON does not support BigInt natively.
  amountMinor: z.string().regex(/^-?\d+$/, 'amountMinor must be an integer string'),
  currencyCode: z.string().length(3),
});
export type Money = z.infer<typeof moneySchema>;

export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

// Auth / identity
// `.max(254)` is the RFC 5321 maximum email length — bounds the field before
// the body-size cap and keeps the API DTOs and the web/mobile forms identical.
export const emailSchema = z
  .string()
  .email()
  .max(254)
  .transform((s) => s.trim().toLowerCase());

export const otpRequestSchema = z.object({
  email: emailSchema,
});
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
  email: emailSchema,
  code: z.string().length(6).regex(/^\d{6}$/),
});
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

export const householdRoleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']);
export type HouseholdRole = z.infer<typeof householdRoleSchema>;

export const householdCreateSchema = z.object({
  name: z.string().min(1).max(100),
  defaultCurrencyCode: z.string().length(3).optional(),
});
export type HouseholdCreateInput = z.infer<typeof householdCreateSchema>;

export const inviteCreateSchema = z.object({
  email: emailSchema,
  role: householdRoleSchema,
});
export type InviteCreateInput = z.infer<typeof inviteCreateSchema>;
