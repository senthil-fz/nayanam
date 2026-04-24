import { z } from 'zod';

export const moneySchema = z.object({
  amountMinor: z.number().int(),
  currencyCode: z.string().length(3),
});
export type Money = z.infer<typeof moneySchema>;

export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

// Auth / identity
export const emailSchema = z.string().email().transform((s) => s.trim().toLowerCase());

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
