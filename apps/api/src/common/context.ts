// Request-scoped auth + household context via AsyncLocalStorage.
// Services read from this instead of prop-drilling; Prisma middleware enforces
// household scoping against it on every query.

import { AsyncLocalStorage } from 'node:async_hooks';

export type AuthContext = {
  userId: string;
  sessionId: string;
};

export type RequestContext = {
  auth?: AuthContext;
  householdId?: string;
  householdRole?: string;
};

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getContext(): RequestContext | undefined {
  return requestContext.getStore();
}

export function getAuthOrThrow(): AuthContext {
  const ctx = requestContext.getStore();
  if (!ctx?.auth) {
    throw new Error('No auth context — call inside an authenticated request');
  }
  return ctx.auth;
}

export function getHouseholdOrThrow(): string {
  const ctx = requestContext.getStore();
  if (!ctx?.householdId) {
    throw new Error('No household context — route must be household-scoped');
  }
  return ctx.householdId;
}
