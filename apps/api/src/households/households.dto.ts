import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const Role = z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']);

export const HouseholdCreateSchema = z.object({
  name: z.string().min(1).max(100),
  defaultCurrencyCode: z.string().length(3).optional(),
});
export class HouseholdCreateDto extends createZodDto(HouseholdCreateSchema) {}

export const HouseholdUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  defaultCurrencyCode: z.string().length(3).optional(),
  iconToken: z.string().max(64).nullish(),
  colorToken: z.string().max(64).nullish(),
});
export class HouseholdUpdateDto extends createZodDto(HouseholdUpdateSchema) {}

export const MemberRoleUpdateSchema = z.object({
  role: Role,
});
export class MemberRoleUpdateDto extends createZodDto(MemberRoleUpdateSchema) {}

export const InviteCreateSchema = z.object({
  email: z.string().email(),
  role: Role,
});
export class InviteCreateDto extends createZodDto(InviteCreateSchema) {}

export const InviteAcceptSchema = z.object({
  token: z.string().min(10),
});
export class InviteAcceptDto extends createZodDto(InviteAcceptSchema) {}
