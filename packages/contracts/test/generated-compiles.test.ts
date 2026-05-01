import { describe, expectTypeOf, it } from 'vitest';

import type {
  ApiAuthSession,
  ApiErrorShape,
  ApiHousehold,
  ApiHouseholdInvite,
  ApiHouseholdMember,
  ApiHouseholdRole,
  ApiMe,
  ApiMoney,
  ApiPushToken,
  ApiSchemas,
  ApiTokenPair,
  ApiUser,
  components,
  operations,
  paths,
} from '../src/index';

/**
 * Type-level smoke tests for the generated TS client.
 *
 * `openapi-typescript` is a single point of failure: if the generator output
 * silently drops an operation or a schema (e.g. due to a bad merge or a
 * generator upgrade that changes its naming), every downstream consumer
 * (apps/api, apps/web, apps/mobile) breaks at runtime, not at compile time.
 *
 * These assertions force the TypeScript compiler to verify that the
 * load-bearing types still exist with the expected shape.
 *
 * No runtime assertions are necessary — `expectTypeOf` is fully erased at
 * runtime; the test passing means the file compiled.
 */
describe('generated.ts — type-level shape', () => {
  it('exports the three top-level OpenAPI artefacts', () => {
    expectTypeOf<paths>().not.toBeAny();
    expectTypeOf<operations>().not.toBeAny();
    expectTypeOf<components>().not.toBeAny();
  });

  it('keeps the ErrorResponse envelope shape stable', () => {
    type ErrorResponse = ApiSchemas['ErrorResponse'];
    expectTypeOf<ErrorResponse>().toHaveProperty('error');

    // Project rule: error envelope must always have code + message.
    expectTypeOf<ApiErrorShape>().toEqualTypeOf<{
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }>();
  });

  it('keeps Money as integer minor units + ISO currency code', () => {
    expectTypeOf<ApiMoney>().toEqualTypeOf<{
      amountMinor: number;
      currencyCode: string;
    }>();
  });

  it('exposes the auth surface', () => {
    expectTypeOf<ApiUser>().not.toBeAny();
    expectTypeOf<ApiMe>().not.toBeAny();
    expectTypeOf<ApiTokenPair>().not.toBeAny();
    expectTypeOf<ApiAuthSession>().not.toBeAny();
  });

  it('exposes the household surface', () => {
    expectTypeOf<ApiHousehold>().not.toBeAny();
    expectTypeOf<ApiHouseholdMember>().not.toBeAny();
    expectTypeOf<ApiHouseholdInvite>().not.toBeAny();
    expectTypeOf<ApiHouseholdRole>().not.toBeAny();
    expectTypeOf<ApiPushToken>().not.toBeAny();
  });

  it('keeps the core domain schemas present', () => {
    // If any of these references stop type-checking, the generator dropped
    // the schema or renamed it. Add new domain schemas here as they ship.
    expectTypeOf<ApiSchemas['Account']>().not.toBeAny();
    expectTypeOf<ApiSchemas['Transaction']>().not.toBeAny();
  });

  it('keeps load-bearing operation entries reachable', () => {
    // operationIds the api/web/mobile clients call by name. If openapi-ts
    // ever changes its naming convention, these break loud.
    expectTypeOf<operations['getMe']>().not.toBeAny();
    expectTypeOf<operations['authOtpRequest']>().not.toBeAny();
    expectTypeOf<operations['authOtpVerify']>().not.toBeAny();
    expectTypeOf<operations['authRefresh']>().not.toBeAny();
    expectTypeOf<operations['createHousehold']>().not.toBeAny();
    expectTypeOf<operations['listAccounts']>().not.toBeAny();
    expectTypeOf<operations['createTransaction']>().not.toBeAny();
  });

  it('keeps load-bearing paths reachable in the path map', () => {
    expectTypeOf<paths['/me']>().not.toBeAny();
    expectTypeOf<paths['/auth/otp/request']>().not.toBeAny();
    expectTypeOf<paths['/auth/otp/verify']>().not.toBeAny();
    expectTypeOf<paths['/health']>().not.toBeAny();
  });
});
