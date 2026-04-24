// Zod schemas for `/me/*` + auxiliary Phase 9 surfaces. Wire shapes mirror the
// OpenAPI contract; we infer TS types from the schemas so forms (RHF resolvers)
// and server payloads share one source of truth.

import { z } from 'zod';
import type { ApiSchemas } from '@nayanam/contracts';

// ─────────────────────────────────────────────────────────────
// Me
// ─────────────────────────────────────────────────────────────

export const UserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().nullable().optional(),
  primaryCurrencyCode: z.string().min(3),
  createdAt: z.string(),
});

export const HouseholdSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']),
  defaultCurrencyCode: z.string().min(3),
});

/**
 * Phase 9 `Me` response: `primaryCurrencyCode` at the top level is nullable
 * (`null` = "fall back to active household default"), while `user.primaryCurrencyCode`
 * keeps the Phase 1 non-null shape for backwards compatibility.
 */
export const MeSchema = z.object({
  user: UserSchema,
  households: z.array(HouseholdSummarySchema),
  primaryCurrencyCode: z.string().min(3).nullable().optional(),
  avatarAttachmentId: z.string().nullable().optional(),
});
export type Me = z.infer<typeof MeSchema>;

export const UpdateMeInput = z.object({
  name: z.string().trim().min(1).max(120).nullable().optional(),
  primaryCurrencyCode: z.string().min(3).max(3).nullable().optional(),
});
export type UpdateMeInputType = z.infer<typeof UpdateMeInput>;

// ─────────────────────────────────────────────────────────────
// Change email
// ─────────────────────────────────────────────────────────────

export const ChangeEmailRequestInput = z.object({
  newEmail: z.string().email(),
});
export type ChangeEmailRequestInputType = z.infer<typeof ChangeEmailRequestInput>;

export const ChangeEmailRequestResponse = z.object({
  expiresAt: z.string(),
  nextAllowedAt: z.string(),
});
export type ChangeEmailRequestResponseType = z.infer<
  typeof ChangeEmailRequestResponse
>;

export const ChangeEmailVerifyInput = z.object({
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});
export type ChangeEmailVerifyInputType = z.infer<typeof ChangeEmailVerifyInput>;

// ─────────────────────────────────────────────────────────────
// Sessions
// ─────────────────────────────────────────────────────────────

export const MeSessionDeviceKindEnum = z.enum(['web', 'ios', 'android', 'other']);
export type MeSessionDeviceKind = z.infer<typeof MeSessionDeviceKindEnum>;

export const MeSessionSchema = z.object({
  id: z.string().min(1),
  deviceName: z.string().nullable().optional(),
  deviceKind: MeSessionDeviceKindEnum,
  lastSeenAt: z.string(),
  ipAddressHash: z.string().nullable().optional(),
  isCurrent: z.boolean(),
  createdAt: z.string(),
});
export type MeSession = z.infer<typeof MeSessionSchema>;

export const MeSessionsResponseSchema = z.object({
  items: z.array(MeSessionSchema),
});

export const RevokeAllOtherSessionsResponseSchema = z.object({
  revokedCount: z.number().int().min(0),
});

// ─────────────────────────────────────────────────────────────
// Security
// ─────────────────────────────────────────────────────────────

export const MeSecurityResponseSchema = z.object({
  biometricEnabled: z.boolean(),
  pinSet: z.boolean(),
  pinLockedUntil: z.string().nullable().optional(),
});
export type MeSecurityResponse = z.infer<typeof MeSecurityResponseSchema>;

const PinString = z.string().regex(/^\d{6}$/, 'PIN must be 6 digits');

export const UpdateMeSecurityInput = z
  .object({
    biometricEnabled: z.boolean().optional(),
    pin: PinString.nullable().optional(),
    currentPin: PinString.optional(),
    otpToken: z.string().optional(),
  })
  .refine(
    (v) =>
      v.biometricEnabled !== undefined ||
      v.pin !== undefined ||
      v.currentPin !== undefined ||
      v.otpToken !== undefined,
    { message: 'At least one field is required' },
  );
export type UpdateMeSecurityInputType = z.infer<typeof UpdateMeSecurityInput>;

export const VerifyPinInput = z.object({ pin: PinString });
export type VerifyPinInputType = z.infer<typeof VerifyPinInput>;

export const VerifyPinResponseSchema = z.object({ ok: z.boolean() });

export const VerifyOtpForSecurityInput = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/),
});
export type VerifyOtpForSecurityInputType = z.infer<
  typeof VerifyOtpForSecurityInput
>;

export const VerifyOtpForSecurityResponseSchema = z.object({
  otpToken: z.string().min(1),
  expiresAt: z.string(),
});

// ─────────────────────────────────────────────────────────────
// Notification preferences (8 switches)
// ─────────────────────────────────────────────────────────────

export const NotificationPreferencesSchema = z.object({
  pushBillsEnabled: z.boolean(),
  pushBudgetsEnabled: z.boolean(),
  pushHouseholdActivityEnabled: z.boolean(),
  pushWeeklySummaryEnabled: z.boolean(),
  emailBillsEnabled: z.boolean(),
  emailBudgetsEnabled: z.boolean(),
  emailHouseholdActivityEnabled: z.boolean(),
  emailWeeklySummaryEnabled: z.boolean(),
  updatedAt: z.string(),
});
export type NotificationPreferences = z.infer<
  typeof NotificationPreferencesSchema
>;

export const PatchNotificationPreferencesInput = z.object({
  pushBillsEnabled: z.boolean().optional(),
  pushBudgetsEnabled: z.boolean().optional(),
  pushHouseholdActivityEnabled: z.boolean().optional(),
  pushWeeklySummaryEnabled: z.boolean().optional(),
  emailBillsEnabled: z.boolean().optional(),
  emailBudgetsEnabled: z.boolean().optional(),
  emailHouseholdActivityEnabled: z.boolean().optional(),
  emailWeeklySummaryEnabled: z.boolean().optional(),
});
export type PatchNotificationPreferencesInputType = z.infer<
  typeof PatchNotificationPreferencesInput
>;

// ─────────────────────────────────────────────────────────────
// Meta links + weekly summary preview
// ─────────────────────────────────────────────────────────────

export const MetaLinksResponseSchema = z.object({
  helpUrl: z.string().url().nullable().optional(),
  contactUrl: z.string().url().nullable().optional(),
  termsUrl: z.string().url().nullable().optional(),
  privacyUrl: z.string().url().nullable().optional(),
  appVersion: z.string(),
  apiVersion: z.string(),
});
export type MetaLinksResponse = z.infer<typeof MetaLinksResponseSchema>;

export const WeeklySummaryCurrencyBucketSchema = z.object({
  currencyCode: z.string().min(3),
  incomeMinor: z.string(),
  expenseMinor: z.string(),
  netMinor: z.string(),
  transactionCount: z.number().int().min(0),
});

export const WeeklySummaryHouseholdSchema = z.object({
  householdId: z.string().min(1),
  householdName: z.string(),
  byCurrency: z.array(WeeklySummaryCurrencyBucketSchema),
});

export const WeeklySummaryPreviewSchema = z.object({
  userId: z.string().min(1),
  weekStart: z.string(),
  weekEnd: z.string(),
  perHousehold: z.array(WeeklySummaryHouseholdSchema),
});
export type WeeklySummaryPreview = z.infer<typeof WeeklySummaryPreviewSchema>;

// Re-export the contract's derived types for consumers that prefer contract types
// directly. Schemas are the source of truth for form validation; contract types
// keep callers aligned with exactly what the wire carries.
export type ContractMe = ApiSchemas['Me'];
export type ContractMeSession = ApiSchemas['MeSession'];
export type ContractMeSecurity = ApiSchemas['MeSecurityResponse'];
