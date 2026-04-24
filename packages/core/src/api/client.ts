// A tiny typed fetch wrapper shared by web + mobile.
// Auth state is injected — each platform wires its own token storage.

import type {
  ApiAuthSession,
  ApiErrorShape,
  ApiHousehold,
  ApiHouseholdInvite,
  ApiHouseholdInviteWithToken,
  ApiHouseholdMember,
  ApiHouseholdSummary,
  ApiMe,
  ApiPushToken,
  ApiTokenPair,
  ApiSchemas,
} from '@nayanam/contracts';

type Account = ApiSchemas['Account'];
type AccountsPage = ApiSchemas['AccountsPage'];
type CreateAccountInput = ApiSchemas['CreateAccountInput'];
type UpdateAccountInput = ApiSchemas['UpdateAccountInput'];
type AccountsSummaryResponse = ApiSchemas['AccountsSummaryResponse'];
type BalanceHistoryResponse = ApiSchemas['BalanceHistoryResponse'];
type ReorderAccountsInput = ApiSchemas['ReorderAccountsInput'];
type ReorderAccountsResponse = ApiSchemas['ReorderAccountsResponse'];

export type ApiError = {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;
  constructor(err: ApiError) {
    super(err.message);
    this.status = err.status;
    this.code = err.code;
    this.details = err.details;
  }
}

export type TokenProvider = {
  getAccessToken(): string | null | Promise<string | null>;
  getRefreshToken(): string | null | Promise<string | null>;
  setTokens(pair: ApiTokenPair | null): void | Promise<void>;
  /** Called when refresh fails — platform should clear auth and redirect to login. */
  onUnauthenticated(): void | Promise<void>;
};

export type ApiClientOptions = {
  baseUrl: string;
  tokens: TokenProvider;
  /** Optional per-request headers. */
  defaultHeaders?: Record<string, string>;
  /**
   * Returns the currently active household's ULID. When set, the client
   * injects `X-Household-Id` on every request except those explicitly
   * marked as cross-household (the household listing endpoints).
   */
  getActiveHouseholdId?: () => string | null | undefined;
};

type RequestOpts = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Skip adding Authorization — used for auth endpoints. */
  anonymous?: boolean;
  idempotencyKey?: string;
  /** Skip the auto-injected X-Household-Id header. */
  crossHousehold?: boolean;
  query?: Record<string, string | number | boolean | undefined | null>;
};

function buildQuery(q?: RequestOpts['query']): string {
  if (!q) return '';
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null) continue;
    usp.append(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export function createApiClient(opts: ApiClientOptions) {
  let refreshInFlight: Promise<string | null> | null = null;

  async function refresh(): Promise<string | null> {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      try {
        const rt = await opts.tokens.getRefreshToken();
        if (!rt) return null;
        const res = await fetch(`${opts.baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
        });
        if (!res.ok) {
          await opts.tokens.setTokens(null);
          await opts.tokens.onUnauthenticated();
          return null;
        }
        const pair = (await res.json()) as ApiTokenPair;
        await opts.tokens.setTokens(pair);
        return pair.accessToken;
      } catch {
        await opts.tokens.setTokens(null);
        await opts.tokens.onUnauthenticated();
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
    return refreshInFlight;
  }

  async function request<T>(path: string, o: RequestOpts = {}): Promise<T> {
    const method = o.method ?? 'GET';
    const headers: Record<string, string> = {
      ...(opts.defaultHeaders ?? {}),
      ...(o.headers ?? {}),
    };
    if (o.body !== undefined) headers['content-type'] = 'application/json';
    if (o.idempotencyKey) headers['idempotency-key'] = o.idempotencyKey;
    if (!o.anonymous) {
      const token = await opts.tokens.getAccessToken();
      if (token) headers['authorization'] = `Bearer ${token}`;
    }
    if (!o.crossHousehold && opts.getActiveHouseholdId) {
      const hid = opts.getActiveHouseholdId();
      if (hid) headers['x-household-id'] = hid;
    }

    const url = `${opts.baseUrl}${path}${buildQuery(o.query)}`;
    const doFetch = async () =>
      fetch(url, {
        method,
        headers,
        body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
        signal: o.signal,
      });

    let res = await doFetch();

    if (res.status === 401 && !o.anonymous) {
      const newToken = await refresh();
      if (newToken) {
        headers['authorization'] = `Bearer ${newToken}`;
        res = await doFetch();
      }
    }

    if (res.status === 204) return undefined as T;

    const text = await res.text();
    const json = text ? (JSON.parse(text) as unknown) : null;

    if (!res.ok) {
      const err = (json as { error?: ApiErrorShape } | null)?.error;
      throw new ApiRequestError({
        status: res.status,
        code: err?.code ?? `HTTP_${res.status}`,
        message: err?.message ?? res.statusText,
        details: err?.details,
      });
    }

    return json as T;
  }

  return {
    // Auth
    authOtpRequest: (email: string) =>
      request<{ sent: boolean; expiresInSeconds: number }>('/auth/otp/request', {
        method: 'POST',
        body: { email },
        anonymous: true,
      }),
    authOtpVerify: (email: string, code: string) =>
      request<ApiAuthSession>('/auth/otp/verify', {
        method: 'POST',
        body: { email, code },
        anonymous: true,
      }),
    authLogout: () => request<void>('/auth/logout', { method: 'POST' }),

    // Me
    getMe: () => request<ApiMe>('/me'),
    registerPushToken: (body: { platform: 'ios' | 'android' | 'web'; token: string; expoPushToken?: string | null }) =>
      request<ApiPushToken>('/me/push-tokens', { method: 'POST', body }),
    deletePushToken: (id: string) => request<void>(`/me/push-tokens/${id}`, { method: 'DELETE' }),

    // Households (operate across households; no X-Household-Id)
    listHouseholds: () =>
      request<{ items: ApiHouseholdSummary[] }>('/households', { crossHousehold: true }),
    createHousehold: (body: { name: string; defaultCurrencyCode?: string }) =>
      request<ApiHousehold>('/households', { method: 'POST', body, crossHousehold: true }),
    getHousehold: (id: string) =>
      request<ApiHousehold>(`/households/${id}`, { crossHousehold: true }),
    updateHousehold: (id: string, body: { name?: string; defaultCurrencyCode?: string }) =>
      request<ApiHousehold>(`/households/${id}`, { method: 'PATCH', body, crossHousehold: true }),

    listMembers: (id: string) =>
      request<{ items: ApiHouseholdMember[] }>(`/households/${id}/members`, { crossHousehold: true }),
    listInvites: (id: string) =>
      request<{ items: ApiHouseholdInvite[] }>(`/households/${id}/invites`, { crossHousehold: true }),
    createInvite: (id: string, body: { email: string; role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' }) =>
      request<ApiHouseholdInviteWithToken>(`/households/${id}/invites`, {
        method: 'POST',
        body,
        crossHousehold: true,
      }),
    revokeInvite: (id: string, inviteId: string) =>
      request<void>(`/households/${id}/invites/${inviteId}`, {
        method: 'DELETE',
        crossHousehold: true,
      }),
    acceptInvite: (token: string) =>
      request<ApiHouseholdSummary>('/invites/accept', {
        method: 'POST',
        body: { token },
        crossHousehold: true,
      }),

    // Accounts (household-scoped; X-Household-Id injected automatically)
    listAccounts: (params?: { cursor?: string; limit?: number; includeArchived?: boolean }) =>
      request<AccountsPage>('/accounts', { query: params }),
    getAccount: (id: string) => request<Account>(`/accounts/${id}`),
    createAccount: (body: CreateAccountInput, idempotencyKey?: string) =>
      request<Account>('/accounts', { method: 'POST', body, idempotencyKey }),
    updateAccount: (id: string, body: UpdateAccountInput, idempotencyKey?: string) =>
      request<Account>(`/accounts/${id}`, { method: 'PATCH', body, idempotencyKey }),
    archiveAccount: (id: string, idempotencyKey?: string) =>
      request<Account>(`/accounts/${id}`, { method: 'DELETE', idempotencyKey }),
    restoreAccount: (id: string, idempotencyKey?: string) =>
      request<Account>(`/accounts/${id}/restore`, { method: 'POST', idempotencyKey }),
    reorderAccounts: (body: ReorderAccountsInput, idempotencyKey?: string) =>
      request<ReorderAccountsResponse>('/accounts/reorder', {
        method: 'POST',
        body,
        idempotencyKey,
      }),
    getAccountsSummary: () => request<AccountsSummaryResponse>('/accounts/summary'),
    getAccountBalanceHistory: (id: string, months = 6) =>
      request<BalanceHistoryResponse>(`/accounts/${id}/balance-history`, { query: { months } }),

    // Generic escape hatch
    raw: request,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
