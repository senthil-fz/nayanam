import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  UpdateMeInput,
  ChangeEmailRequestInput,
  ChangeEmailVerifyInput,
  PatchNotificationPreferencesInput,
  VerifyOtpForSecurityInput,
} from '@nayanam/core/me/schemas';

/**
 * `/me/*` DTOs. Body schemas derive from the shared `@nayanam/core` schemas
 * (B4) where a shared form exists.
 *
 * The PIN-related schemas (`UpdateSecuritySchema`, `VerifyPinSchema`,
 * `ResetPinSchema`) stay LOCAL on purpose: `SecurityService` validates the PIN
 * format itself and throws the stable `PIN_FORMAT_INVALID` code. If the DTO
 * Zod-rejected a malformed PIN it would collapse to a generic VALIDATION_ERROR
 * and lose that machine code — the accept-and-reject pattern. The shared
 * `UpdateMeSecurityInput` (which enforces `/^\d{6}$/`) is therefore not used
 * here; it remains the source of truth for the web/mobile PIN forms.
 */

export class UpdateMeDto extends createZodDto(UpdateMeInput) {}

export class RequestEmailChangeDto extends createZodDto(ChangeEmailRequestInput) {}

export class VerifyEmailChangeDto extends createZodDto(ChangeEmailVerifyInput) {}

// Local — PIN format is validated in SecurityService for a stable error code.
export const UpdateSecuritySchema = z.object({
  biometricEnabled: z.boolean().optional(),
  pin: z.string().nullish(),
  currentPin: z.string().optional(),
});
export class UpdateSecurityDto extends createZodDto(UpdateSecuritySchema) {}

// Local — see UpdateSecuritySchema note.
export const VerifyPinSchema = z.object({
  pin: z.string(),
});
export class VerifyPinDto extends createZodDto(VerifyPinSchema) {}

// Local — `otpToken` is a server-issued credential, not a shared form field.
export const ResetPinSchema = z.object({
  otpToken: z.string().min(10),
  newPin: z.string(),
});
export class ResetPinDto extends createZodDto(ResetPinSchema) {}

/**
 * Notification preferences. The shared `PatchNotificationPreferencesInput`
 * carries the eight switch fields; the API additionally `.strict()`s the body
 * so unknown keys are rejected. `.strict()` is a server hardening — applied as
 * a local extension rather than tightening the shared form schema.
 */
export const UpdateNotificationPreferencesSchema =
  PatchNotificationPreferencesInput.strict();
export class UpdateNotificationPreferencesDto extends createZodDto(
  UpdateNotificationPreferencesSchema,
) {}

export class VerifyOtpForSecurityDto extends createZodDto(VerifyOtpForSecurityInput) {}
