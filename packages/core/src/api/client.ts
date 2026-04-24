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

type Category = ApiSchemas['Category'];
type CategoriesPage = ApiSchemas['CategoriesPage'];
type CreateCategoryInput = ApiSchemas['CreateCategoryInput'];
type UpdateCategoryInput = ApiSchemas['UpdateCategoryInput'];
type ReorderCategoriesInput = ApiSchemas['ReorderCategoriesInput'];
type ReorderCategoriesResponse = ApiSchemas['ReorderCategoriesResponse'];

type Transaction = ApiSchemas['Transaction'];
type TransactionsPage = ApiSchemas['TransactionsPage'];
type CreateTransactionInput = ApiSchemas['CreateTransactionInput'];
type UpdateTransactionInput = ApiSchemas['UpdateTransactionInput'];
type BulkCreateTransactionsInput = ApiSchemas['BulkCreateTransactionsInput'];
type BulkCreateTransactionsResponse = ApiSchemas['BulkCreateTransactionsResponse'];
type CreateTransferInput = ApiSchemas['CreateTransferInput'];
type TransferWithPairedTransactions = ApiSchemas['TransferWithPairedTransactions'];
type TransactionType = ApiSchemas['TransactionType'];

type AccountsBalanceHistoryAllResponse =
  ApiSchemas['AccountsBalanceHistoryAllResponse'];
type PeriodSummaryResponse = ApiSchemas['PeriodSummaryResponse'];
type PeriodEnum = ApiSchemas['PeriodEnum'];
type NotificationUnreadCountResponse =
  ApiSchemas['NotificationUnreadCountResponse'];
type Notification = ApiSchemas['Notification'];
type NotificationsPage = ApiSchemas['NotificationsPage'];
type NotificationCategory = ApiSchemas['NotificationCategory'];
type MarkAllNotificationsReadInput =
  ApiSchemas['MarkAllNotificationsReadInput'];
type MarkAllNotificationsReadResponse =
  ApiSchemas['MarkAllNotificationsReadResponse'];

type Attachment = ApiSchemas['Attachment'];
type AttachmentOwnerType = ApiSchemas['AttachmentOwnerType'];
type AttachmentListResponse = ApiSchemas['AttachmentListResponse'];
type AttachmentDownloadUrlResponse =
  ApiSchemas['AttachmentDownloadUrlResponse'];
type PresignUploadInput = ApiSchemas['PresignUploadInput'];
type PresignUploadResponse = ApiSchemas['PresignUploadResponse'];

type StatsPeriodKind = ApiSchemas['StatsPeriodKind'];
type StatsOverviewResponse = ApiSchemas['StatsOverviewResponse'];
type MonthlyTrendResponse = ApiSchemas['MonthlyTrendResponse'];
type CategoryBreakdownResponse = ApiSchemas['CategoryBreakdownResponse'];
type DailySpendResponse = ApiSchemas['DailySpendResponse'];
type CategorySparklineResponse = ApiSchemas['CategorySparklineResponse'];
type SankeyResponse = ApiSchemas['SankeyResponse'];

type Budget = ApiSchemas['Budget'];
type BudgetsPage = ApiSchemas['BudgetsPage'];
type BudgetScope = ApiSchemas['BudgetScope'];
type BudgetStatus = ApiSchemas['BudgetStatus'];
type CreateBudgetInput = ApiSchemas['CreateBudgetInput'];
type UpdateBudgetInput = ApiSchemas['UpdateBudgetInput'];
type ReorderBudgetsInput = ApiSchemas['ReorderBudgetsInput'];
type ReorderBudgetsResponse = ApiSchemas['ReorderBudgetsResponse'];
type BudgetsStatusResponse = ApiSchemas['BudgetsStatusResponse'];
type BudgetSuggestionsResponse = ApiSchemas['BudgetSuggestionsResponse'];
type BudgetHistoryResponse = ApiSchemas['BudgetHistoryResponse'];

// Phase 9 — Settings (me / households / meta)
type UpdateMeInput = ApiSchemas['UpdateMeInput'];
type ChangeEmailRequestInput = ApiSchemas['ChangeEmailRequestInput'];
type ChangeEmailRequestResponse = ApiSchemas['ChangeEmailRequestResponse'];
type ChangeEmailVerifyInput = ApiSchemas['ChangeEmailVerifyInput'];
type UpdateMemberRoleInput = ApiSchemas['UpdateMemberRoleInput'];
type MeSessionsResponse = ApiSchemas['MeSessionsResponse'];
type RevokeAllOtherSessionsResponse =
  ApiSchemas['RevokeAllOtherSessionsResponse'];
type MeSecurityResponse = ApiSchemas['MeSecurityResponse'];
type UpdateMeSecurityInput = ApiSchemas['UpdateMeSecurityInput'];
type VerifyPinInput = ApiSchemas['VerifyPinInput'];
type VerifyPinResponse = ApiSchemas['VerifyPinResponse'];
type VerifyOtpForSecurityInput = ApiSchemas['VerifyOtpForSecurityInput'];
type VerifyOtpForSecurityResponse = ApiSchemas['VerifyOtpForSecurityResponse'];
type NotificationPreferences = ApiSchemas['NotificationPreferences'];
type PatchNotificationPreferencesInput =
  ApiSchemas['PatchNotificationPreferencesInput'];
type WeeklySummaryPreview = ApiSchemas['WeeklySummaryPreview'];
type MetaLinksResponse = ApiSchemas['MetaLinksResponse'];
type HouseholdUpdate = ApiSchemas['HouseholdUpdate'];

type Bill = ApiSchemas['Bill'];
type BillsPage = ApiSchemas['BillsPage'];
type BillPaymentsPage = ApiSchemas['BillPaymentsPage'];
type BillsSummaryResponse = ApiSchemas['BillsSummaryResponse'];
type BillsUpcomingResponse = ApiSchemas['BillsUpcomingResponse'];
type CreateBillInput = ApiSchemas['CreateBillInput'];
type UpdateBillInput = ApiSchemas['UpdateBillInput'];
type MarkBillPaidInput = ApiSchemas['MarkBillPaidInput'];
type MarkBillPaidResponse = ApiSchemas['MarkBillPaidResponse'];
type ReorderBillsInput = ApiSchemas['ReorderBillsInput'];
type ReorderBillsResponse = ApiSchemas['ReorderBillsResponse'];
type BillStatus = ApiSchemas['BillStatus'];
// Budget aliases are declared above to avoid a forward-reference reshuffle.

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
  query?: Record<
    string,
    string | number | boolean | undefined | null | ReadonlyArray<string | number>
  >;
};

function buildQuery(q?: RequestOpts['query']): string {
  if (!q) return '';
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item === undefined || item === null) continue;
        usp.append(k, String(item));
      }
      continue;
    }
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
    updateHousehold: (id: string, body: HouseholdUpdate, idempotencyKey?: string) =>
      request<ApiHousehold>(`/households/${id}`, {
        method: 'PATCH',
        body,
        crossHousehold: true,
        idempotencyKey,
      }),
    updateHouseholdMemberRole: (
      id: string,
      userId: string,
      body: UpdateMemberRoleInput,
      idempotencyKey?: string,
    ) =>
      request<ApiHouseholdMember>(
        `/households/${id}/members/${userId}/role`,
        {
          method: 'PATCH',
          body,
          crossHousehold: true,
          idempotencyKey,
        },
      ),
    removeHouseholdMember: (id: string, userId: string, idempotencyKey?: string) =>
      request<void>(`/households/${id}/members/${userId}`, {
        method: 'DELETE',
        crossHousehold: true,
        idempotencyKey,
      }),
    leaveHousehold: (id: string, idempotencyKey?: string) =>
      request<void>(`/households/${id}/leave`, {
        method: 'POST',
        crossHousehold: true,
        idempotencyKey,
      }),
    deleteHousehold: (id: string, idempotencyKey?: string) =>
      request<void>(`/households/${id}/archive`, {
        method: 'DELETE',
        crossHousehold: true,
        idempotencyKey,
      }),

    // Me (Phase 9 extensions)
    updateMe: (body: UpdateMeInput, idempotencyKey?: string) =>
      request<ApiMe>('/me', { method: 'PATCH', body, idempotencyKey, crossHousehold: true }),
    requestChangeEmail: (body: ChangeEmailRequestInput, idempotencyKey?: string) =>
      request<ChangeEmailRequestResponse>('/me/change-email/request', {
        method: 'POST',
        body,
        idempotencyKey,
        crossHousehold: true,
      }),
    verifyChangeEmail: (body: ChangeEmailVerifyInput, idempotencyKey?: string) =>
      request<ApiMe>('/me/change-email/verify', {
        method: 'POST',
        body,
        idempotencyKey,
        crossHousehold: true,
      }),
    listMeSessions: () =>
      request<MeSessionsResponse>('/me/sessions', { crossHousehold: true }),
    revokeMeSession: (sessionId: string, idempotencyKey?: string) =>
      request<void>(`/me/sessions/${sessionId}`, {
        method: 'DELETE',
        idempotencyKey,
        crossHousehold: true,
      }),
    revokeAllOtherMeSessions: (idempotencyKey?: string) =>
      request<RevokeAllOtherSessionsResponse>('/me/sessions/revoke-all-others', {
        method: 'POST',
        idempotencyKey,
        crossHousehold: true,
      }),
    getMeSecurity: () =>
      request<MeSecurityResponse>('/me/security', { crossHousehold: true }),
    updateMeSecurity: (body: UpdateMeSecurityInput, idempotencyKey?: string) =>
      request<MeSecurityResponse>('/me/security', {
        method: 'PATCH',
        body,
        idempotencyKey,
        crossHousehold: true,
      }),
    verifyMePin: (body: VerifyPinInput, idempotencyKey?: string) =>
      request<VerifyPinResponse>('/me/security/verify-pin', {
        method: 'POST',
        body,
        idempotencyKey,
        crossHousehold: true,
      }),
    authOtpVerifyForSecurity: (body: VerifyOtpForSecurityInput) =>
      request<VerifyOtpForSecurityResponse>(
        '/auth/otp/verify-for-security',
        { method: 'POST', body, anonymous: true, crossHousehold: true },
      ),
    getNotificationPreferences: () =>
      request<NotificationPreferences>('/me/notification-preferences', {
        crossHousehold: true,
      }),
    updateNotificationPreferences: (
      body: PatchNotificationPreferencesInput,
      idempotencyKey?: string,
    ) =>
      request<NotificationPreferences>('/me/notification-preferences', {
        method: 'PATCH',
        body,
        idempotencyKey,
        crossHousehold: true,
      }),
    getWeeklySummaryPreview: (params?: { weekEndingAt?: string }) =>
      request<WeeklySummaryPreview>('/weekly-summaries/preview', {
        query: params,
        crossHousehold: true,
      }),
    getMetaLinks: () =>
      request<MetaLinksResponse>('/meta/links', { crossHousehold: true }),

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
    getAccountsBalanceHistoryAll: (days = 14) =>
      request<AccountsBalanceHistoryAllResponse>('/accounts/balance-history-all', {
        query: { days },
      }),

    // Categories (household-scoped; system rows share the same list)
    listCategories: (params?: {
      cursor?: string;
      limit?: number;
      type?: 'INCOME' | 'EXPENSE';
      includeArchived?: boolean;
    }) => request<CategoriesPage>('/categories', { query: params }),
    getCategory: (id: string) => request<Category>(`/categories/${id}`),
    createCategory: (body: CreateCategoryInput, idempotencyKey?: string) =>
      request<Category>('/categories', { method: 'POST', body, idempotencyKey }),
    updateCategory: (id: string, body: UpdateCategoryInput, idempotencyKey?: string) =>
      request<Category>(`/categories/${id}`, { method: 'PATCH', body, idempotencyKey }),
    archiveCategory: (id: string, idempotencyKey?: string) =>
      request<Category>(`/categories/${id}`, { method: 'DELETE', idempotencyKey }),
    restoreCategory: (id: string, idempotencyKey?: string) =>
      request<Category>(`/categories/${id}/restore`, { method: 'POST', idempotencyKey }),
    reorderCategories: (body: ReorderCategoriesInput, idempotencyKey?: string) =>
      request<ReorderCategoriesResponse>('/categories/reorder', {
        method: 'POST',
        body,
        idempotencyKey,
      }),

    // Transactions
    listTransactions: (params?: {
      cursor?: string;
      limit?: number;
      accountId?: readonly string[];
      categoryId?: readonly string[];
      type?: TransactionType;
      from?: string;
      to?: string;
      q?: string;
      includeDeleted?: boolean;
      transferId?: string;
    }) => request<TransactionsPage>('/transactions', { query: params }),
    getTransaction: (id: string) => request<Transaction>(`/transactions/${id}`),
    createTransaction: (body: CreateTransactionInput, idempotencyKey?: string) =>
      request<Transaction>('/transactions', { method: 'POST', body, idempotencyKey }),
    updateTransaction: (id: string, body: UpdateTransactionInput, idempotencyKey?: string) =>
      request<Transaction>(`/transactions/${id}`, { method: 'PATCH', body, idempotencyKey }),
    deleteTransaction: (id: string, idempotencyKey?: string) =>
      request<Transaction>(`/transactions/${id}`, { method: 'DELETE', idempotencyKey }),
    restoreTransaction: (id: string, idempotencyKey?: string) =>
      request<Transaction>(`/transactions/${id}/restore`, { method: 'POST', idempotencyKey }),
    bulkCreateTransactions: (body: BulkCreateTransactionsInput, idempotencyKey?: string) =>
      request<BulkCreateTransactionsResponse>('/transactions/bulk-create', {
        method: 'POST',
        body,
        idempotencyKey,
      }),
    getTransactionsPeriodSummary: (q: {
      period?: PeriodEnum;
      from?: string;
      to?: string;
    } = {}) =>
      request<PeriodSummaryResponse>('/transactions/period-summary', { query: q }),

    // Notifications (user-scoped; X-Household-Id ignored server-side but sent for consistency)
    getNotificationUnreadCount: () =>
      request<NotificationUnreadCountResponse>('/notifications/unread-count', {
        crossHousehold: true,
      }),
    listNotifications: (params?: {
      cursor?: string;
      limit?: number;
      unreadOnly?: boolean;
      category?: NotificationCategory;
    }) =>
      request<NotificationsPage>('/notifications', {
        crossHousehold: true,
        query: params,
      }),
    getNotification: (id: string) =>
      request<Notification>(`/notifications/${id}`, { crossHousehold: true }),
    markNotificationRead: (id: string, idempotencyKey?: string) =>
      request<Notification>(`/notifications/${id}/mark-read`, {
        method: 'POST',
        idempotencyKey,
        crossHousehold: true,
      }),
    markNotificationUnread: (id: string, idempotencyKey?: string) =>
      request<Notification>(`/notifications/${id}/mark-unread`, {
        method: 'POST',
        idempotencyKey,
        crossHousehold: true,
      }),
    markAllNotificationsRead: (
      body: MarkAllNotificationsReadInput,
      idempotencyKey?: string,
    ) =>
      request<MarkAllNotificationsReadResponse>(
        '/notifications/mark-all-read',
        { method: 'POST', body, idempotencyKey, crossHousehold: true },
      ),
    deleteNotification: (id: string, idempotencyKey?: string) =>
      request<void>(`/notifications/${id}`, {
        method: 'DELETE',
        idempotencyKey,
        crossHousehold: true,
      }),

    // Attachments (household-scoped)
    presignUploadAttachment: (body: PresignUploadInput, idempotencyKey?: string) =>
      request<PresignUploadResponse>('/attachments/presign-upload', {
        method: 'POST',
        body,
        idempotencyKey,
      }),
    finalizeAttachment: (id: string, idempotencyKey?: string) =>
      request<Attachment>(`/attachments/${id}/finalize`, {
        method: 'POST',
        idempotencyKey,
      }),
    listAttachments: (params: {
      ownerType: AttachmentOwnerType;
      ownerId: string;
      includeFailed?: boolean;
      includeDeleted?: boolean;
    }) => request<AttachmentListResponse>('/attachments', { query: params }),
    getAttachment: (id: string) => request<Attachment>(`/attachments/${id}`),
    refreshAttachmentDownloadUrl: (id: string) =>
      request<AttachmentDownloadUrlResponse>(`/attachments/${id}/download-url`),
    deleteAttachment: (id: string, idempotencyKey?: string) =>
      request<void>(`/attachments/${id}`, {
        method: 'DELETE',
        idempotencyKey,
      }),
    restoreAttachment: (id: string, idempotencyKey?: string) =>
      request<Attachment>(`/attachments/${id}/restore`, {
        method: 'POST',
        idempotencyKey,
      }),

    // Transfers
    getTransfer: (id: string) =>
      request<TransferWithPairedTransactions>(`/transfers/${id}`),
    createTransfer: (body: CreateTransferInput, idempotencyKey?: string) =>
      request<TransferWithPairedTransactions>('/transfers', {
        method: 'POST',
        body,
        idempotencyKey,
      }),
    deleteTransfer: (id: string, idempotencyKey?: string) =>
      request<TransferWithPairedTransactions>(`/transfers/${id}`, {
        method: 'DELETE',
        idempotencyKey,
      }),
    restoreTransfer: (id: string, idempotencyKey?: string) =>
      request<TransferWithPairedTransactions>(`/transfers/${id}/restore`, {
        method: 'POST',
        idempotencyKey,
      }),

    // Bills (household-scoped)
    listBills: (params?: {
      cursor?: string;
      limit?: number;
      filter?: 'all' | 'due-soon' | 'active' | 'paused';
      status?: BillStatus;
      includeArchived?: boolean;
    }) => request<BillsPage>('/bills', { query: params }),
    getBill: (id: string) => request<Bill>(`/bills/${id}`),
    createBill: (body: CreateBillInput, idempotencyKey?: string) =>
      request<Bill>('/bills', { method: 'POST', body, idempotencyKey }),
    updateBill: (id: string, body: UpdateBillInput, idempotencyKey?: string) =>
      request<Bill>(`/bills/${id}`, { method: 'PATCH', body, idempotencyKey }),
    archiveBill: (id: string, idempotencyKey?: string) =>
      request<Bill>(`/bills/${id}`, { method: 'DELETE', idempotencyKey }),
    restoreBill: (id: string, idempotencyKey?: string) =>
      request<Bill>(`/bills/${id}/restore`, { method: 'POST', idempotencyKey }),
    pauseBill: (id: string, idempotencyKey?: string) =>
      request<Bill>(`/bills/${id}/pause`, { method: 'POST', idempotencyKey }),
    resumeBill: (id: string, idempotencyKey?: string) =>
      request<Bill>(`/bills/${id}/resume`, { method: 'POST', idempotencyKey }),
    reorderBills: (body: ReorderBillsInput, idempotencyKey?: string) =>
      request<ReorderBillsResponse>('/bills/reorder', {
        method: 'POST',
        body,
        idempotencyKey,
      }),
    markBillPaid: (id: string, body: MarkBillPaidInput, idempotencyKey?: string) =>
      request<MarkBillPaidResponse>(`/bills/${id}/mark-paid`, {
        method: 'POST',
        body,
        idempotencyKey,
      }),
    listBillPayments: (id: string, params?: { cursor?: string; limit?: number }) =>
      request<BillPaymentsPage>(`/bills/${id}/payments`, { query: params }),
    undoBillPayment: (id: string, paymentId: string, idempotencyKey?: string) =>
      request<Bill>(`/bills/${id}/payments/${paymentId}/undo`, {
        method: 'POST',
        idempotencyKey,
      }),
    getBillsSummary: () => request<BillsSummaryResponse>('/bills/summary'),
    getBillsUpcoming: (days = 14) =>
      request<BillsUpcomingResponse>('/bills/upcoming', { query: { days } }),

    // Budgets (household-scoped)
    listBudgets: (params?: {
      cursor?: string;
      limit?: number;
      scope?: BudgetScope;
      status?: BudgetStatus;
      includeArchived?: boolean;
    }) => request<BudgetsPage>('/budgets', { query: params }),
    getBudget: (id: string) => request<Budget>(`/budgets/${id}`),
    createBudget: (body: CreateBudgetInput, idempotencyKey?: string) =>
      request<Budget>('/budgets', { method: 'POST', body, idempotencyKey }),
    updateBudget: (id: string, body: UpdateBudgetInput, idempotencyKey?: string) =>
      request<Budget>(`/budgets/${id}`, { method: 'PATCH', body, idempotencyKey }),
    archiveBudget: (id: string, idempotencyKey?: string) =>
      request<Budget>(`/budgets/${id}`, { method: 'DELETE', idempotencyKey }),
    restoreBudget: (id: string, idempotencyKey?: string) =>
      request<Budget>(`/budgets/${id}/restore`, { method: 'POST', idempotencyKey }),
    pauseBudget: (id: string, idempotencyKey?: string) =>
      request<Budget>(`/budgets/${id}/pause`, { method: 'POST', idempotencyKey }),
    resumeBudget: (id: string, idempotencyKey?: string) =>
      request<Budget>(`/budgets/${id}/resume`, { method: 'POST', idempotencyKey }),
    reorderBudgets: (body: ReorderBudgetsInput, idempotencyKey?: string) =>
      request<ReorderBudgetsResponse>('/budgets/reorder', {
        method: 'POST',
        body,
        idempotencyKey,
      }),
    getBudgetsStatus: (params?: {
      scope?: BudgetScope;
      includeArchived?: boolean;
      asOf?: string;
    }) => request<BudgetsStatusResponse>('/budgets/status', { query: params }),
    getBudgetsSuggest: () =>
      request<BudgetSuggestionsResponse>('/budgets/suggest'),
    getBudgetHistory: (id: string, periods = 6) =>
      request<BudgetHistoryResponse>(`/budgets/${id}/history`, {
        query: { periods },
      }),

    // Stats (read-only; household-scoped via X-Household-Id)
    getStatsOverview: (q: {
      period: StatsPeriodKind;
      from?: string;
      to?: string;
      topCategoriesLimit?: number;
    }) => request<StatsOverviewResponse>('/stats/overview', { query: q }),
    getStatsMonthlyTrend: (q: { months?: number; currencyCode?: string } = {}) =>
      request<MonthlyTrendResponse>('/stats/monthly-trend', { query: q }),
    getStatsCategoryBreakdown: (q: {
      period: StatsPeriodKind;
      from?: string;
      to?: string;
      type?: 'INCOME' | 'EXPENSE';
      currencyCode?: string;
    }) => request<CategoryBreakdownResponse>('/stats/category-breakdown', { query: q }),
    getStatsDailySpend: (q: { days?: number; currencyCode?: string } = {}) =>
      request<DailySpendResponse>('/stats/daily-spend', { query: q }),
    getStatsCategorySparkline: (q: {
      categoryIds: readonly string[];
      days?: number;
    }) =>
      request<CategorySparklineResponse>('/stats/category-sparkline', {
        query: { categoryIds: q.categoryIds, days: q.days },
      }),
    getStatsSankey: (q: {
      period: StatsPeriodKind;
      from?: string;
      to?: string;
      currencyCode?: string;
    }) => request<SankeyResponse>('/stats/sankey', { query: q }),

    // Generic escape hatch
    raw: request,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
