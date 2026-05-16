import { createZodDto } from 'nestjs-zod';
import {
  HouseholdCreateInput,
  HouseholdUpdateInput,
  MemberRoleUpdateInput,
  InviteCreateInput,
  InviteAcceptInput,
} from '@nayanam/core/households/schemas';

/**
 * Households DTOs. Every request body is a shared `@nayanam/core` schema (B4).
 * `HouseholdCreateInput` / `InviteCreateInput` are the canonical schemas from
 * `@nayanam/core/schemas` re-exported through the households domain module.
 */

export class HouseholdCreateDto extends createZodDto(HouseholdCreateInput) {}

export class HouseholdUpdateDto extends createZodDto(HouseholdUpdateInput) {}

export class MemberRoleUpdateDto extends createZodDto(MemberRoleUpdateInput) {}

export class InviteCreateDto extends createZodDto(InviteCreateInput) {}

export class InviteAcceptDto extends createZodDto(InviteAcceptInput) {}
