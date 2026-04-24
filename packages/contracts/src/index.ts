// Consumers import all API types from `@nayanam/contracts`.
// The `generated.ts` file is the output of `openapi-typescript openapi.yaml -o src/generated.ts`.
// The hand-authored stand-in in this repo mirrors that shape.

export type { components, paths, operations } from './generated';
import type { components } from './generated';

// Convenience aliases — most code reads these.
export type ApiSchemas = components['schemas'];

export type ApiErrorShape = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type ApiMoney = { amountMinor: number; currencyCode: string };

export type ApiUser = ApiSchemas['User'];
export type ApiMe = ApiSchemas['Me'];
export type ApiTokenPair = ApiSchemas['TokenPair'];
export type ApiAuthSession = ApiSchemas['AuthSession'];
export type ApiHouseholdSummary = ApiSchemas['HouseholdSummary'];
export type ApiHousehold = ApiSchemas['Household'];
export type ApiHouseholdMember = ApiSchemas['HouseholdMember'];
export type ApiHouseholdInvite = ApiSchemas['HouseholdInvite'];
export type ApiHouseholdInviteWithToken = ApiSchemas['HouseholdInviteWithToken'];
export type ApiHouseholdRole = ApiSchemas['HouseholdRole'];
export type ApiPushToken = ApiSchemas['PushToken'];
