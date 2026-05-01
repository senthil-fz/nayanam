import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const OtpRequestSchema = z.object({
  email: z.string().email(),
});
export class OtpRequestDto extends createZodDto(OtpRequestSchema) {}

export const OtpVerifySchema = z.object({
  email: z.string().email(),
  code: z.string().length(6).regex(/^\d{6}$/),
});
export class OtpVerifyDto extends createZodDto(OtpVerifySchema) {}

export const RefreshSchema = z.object({
  refreshToken: z.string().min(10),
});
export class RefreshDto extends createZodDto(RefreshSchema) {}

export const OtpVerifyForSecuritySchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6).regex(/^\d{6}$/),
});
export class OtpVerifyForSecurityDto extends createZodDto(OtpVerifyForSecuritySchema) {}

export const OtpVerifyForSecurityResponseSchema = z.object({
  otpToken: z.string(),
  expiresAt: z.string().datetime(),
});
