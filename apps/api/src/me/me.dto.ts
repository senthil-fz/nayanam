import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const UpdateMeSchema = z.object({
  name: z.string().min(1).max(120).nullish(),
  primaryCurrencyCode: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/)
    .nullish(),
});
export class UpdateMeDto extends createZodDto(UpdateMeSchema) {}

export const RequestEmailChangeSchema = z.object({
  newEmail: z.string().email().max(320),
});
export class RequestEmailChangeDto extends createZodDto(RequestEmailChangeSchema) {}

export const VerifyEmailChangeSchema = z.object({
  otp: z.string().regex(/^\d{6}$/),
});
export class VerifyEmailChangeDto extends createZodDto(VerifyEmailChangeSchema) {}

export const UpdateSecuritySchema = z.object({
  biometricEnabled: z.boolean().optional(),
  pin: z.string().nullish(),
  currentPin: z.string().optional(),
});
export class UpdateSecurityDto extends createZodDto(UpdateSecuritySchema) {}

export const VerifyPinSchema = z.object({
  pin: z.string(),
});
export class VerifyPinDto extends createZodDto(VerifyPinSchema) {}

export const ResetPinSchema = z.object({
  otpToken: z.string().min(10),
  newPin: z.string(),
});
export class ResetPinDto extends createZodDto(ResetPinSchema) {}

export const UpdateNotificationPreferencesSchema = z
  .object({
    pushBillsEnabled: z.boolean().optional(),
    pushBudgetsEnabled: z.boolean().optional(),
    pushHouseholdActivityEnabled: z.boolean().optional(),
    pushWeeklySummaryEnabled: z.boolean().optional(),
    emailBillsEnabled: z.boolean().optional(),
    emailBudgetsEnabled: z.boolean().optional(),
    emailHouseholdActivityEnabled: z.boolean().optional(),
    emailWeeklySummaryEnabled: z.boolean().optional(),
  })
  .strict();
export class UpdateNotificationPreferencesDto extends createZodDto(
  UpdateNotificationPreferencesSchema,
) {}

export const VerifyOtpForSecuritySchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/),
});
export class VerifyOtpForSecurityDto extends createZodDto(VerifyOtpForSecuritySchema) {}
