// Zod schemas for the Household domain. Shared by web + mobile.
// Wire shapes match `packages/contracts/openapi.yaml`.

import { z } from 'zod';
import {
  householdRoleSchema,
  householdCreateSchema,
  inviteCreateSchema,
} from '../schemas/index';

// Re-export the role enum so consumers can import from one place.
export { householdRoleSchema as HouseholdRoleEnum };
export type HouseholdRole = z.infer<typeof householdRoleSchema>;

export { householdCreateSchema as HouseholdCreateInput };
export type HouseholdCreateInputType = z.infer<typeof householdCreateSchema>;

export const HouseholdUpdateInput = z.object({
  name: z.string().min(1).max(100).optional(),
  defaultCurrencyCode: z.string().length(3).optional(),
  iconToken: z.string().max(64).nullish(),
  colorToken: z.string().max(64).nullish(),
});
export type HouseholdUpdateInputType = z.infer<typeof HouseholdUpdateInput>;

export const MemberRoleUpdateInput = z.object({
  role: householdRoleSchema,
});
export type MemberRoleUpdateInputType = z.infer<typeof MemberRoleUpdateInput>;

export { inviteCreateSchema as InviteCreateInput };
export type InviteCreateInputType = z.infer<typeof inviteCreateSchema>;

export const InviteAcceptInput = z.object({
  token: z.string().min(10),
});
export type InviteAcceptInputType = z.infer<typeof InviteAcceptInput>;
