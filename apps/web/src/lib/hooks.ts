import {
  makeAccountHooks,
  makeAttachmentHooks,
  makeAuthHooks,
  makeBillHooks,
  makeBudgetHooks,
  makeCategoryHooks,
  makeHouseholdHooks,
  makeMeHooks,
  makeNotificationHooks,
  makeStatsHooks,
  makeTransactionHooks,
} from '@nayanam/core';
import { apiClient, useAuthStore } from './api';

export const {
  useMe,
  useRequestOtp,
  useVerifyOtp,
  useLogout,
  useHouseholds,
  useCreateHousehold,
  useAcceptInvite,
  useHouseholdMembers,
  useHouseholdInvites,
  useCreateInvite,
  useRevokeInvite,
} = makeAuthHooks(apiClient, useAuthStore);

export const {
  useAccounts,
  useAccount,
  useAccountsSummary,
  useBalanceHistory,
  useBalanceHistoryAll,
  useCreateAccount,
  useUpdateAccount,
  useArchiveAccount,
  useRestoreAccount,
  useReorderAccounts,
} = makeAccountHooks(apiClient);

export const {
  useUnreadNotificationCount,
  useNotifications,
  useNotification,
  useMarkNotificationRead,
  useMarkNotificationUnread,
  useMarkAllNotificationsRead,
  useDeleteNotification,
} = makeNotificationHooks(apiClient);

export const {
  useAttachments,
  useAttachment,
  usePresignUpload,
  useFinalizeAttachment,
  useDeleteAttachment,
  useRestoreAttachment,
  useRefreshDownloadUrl,
} = makeAttachmentHooks(apiClient);

export const {
  useCategories,
  useCategory,
  useCreateCategory,
  useUpdateCategory,
  useArchiveCategory,
  useRestoreCategory,
  useReorderCategories,
} = makeCategoryHooks(apiClient);

export const {
  useTransactions,
  usePeriodSummary,
  useTransaction,
  useCreateTransaction,
  useUpdateTransaction,
  useDeleteTransaction,
  useRestoreTransaction,
  useBulkCreateTransactions,
  useTransfer,
  useCreateTransfer,
  useDeleteTransfer,
  useRestoreTransfer,
} = makeTransactionHooks(apiClient);

export const {
  useBudgets,
  useBudget,
  useBudgetsStatus,
  useBudgetsSuggest,
  useBudgetHistory,
  useCreateBudget,
  useUpdateBudget,
  usePauseBudget,
  useResumeBudget,
  useArchiveBudget,
  useRestoreBudget,
  useReorderBudgets,
} = makeBudgetHooks(apiClient);

export const {
  useStatsOverview,
  useMonthlyTrend,
  useCategoryBreakdown,
  useDailySpend,
  useCategorySparkline,
  useSankey,
} = makeStatsHooks(apiClient);

// Phase 9 — Me (profile, sessions, security, notif prefs, meta).
// `useMe` is already exposed from `makeAuthHooks` above; we expose the rest
// of the `/me/*` surface here without re-exporting `useMe` to avoid shadowing.
const meHooks = makeMeHooks(apiClient, {
  isAuthed: () =>
    Boolean(useAuthStore.getState().accessToken ?? useAuthStore.getState().refreshToken),
});
export const useUpdateMe = meHooks.useUpdateMe;
export const useRequestChangeEmail = meHooks.useRequestChangeEmail;
export const useVerifyChangeEmail = meHooks.useVerifyChangeEmail;
export const useMeSessions = meHooks.useMeSessions;
export const useRevokeMeSession = meHooks.useRevokeMeSession;
export const useRevokeAllOtherSessions = meHooks.useRevokeAllOtherSessions;
export const useMeSecurity = meHooks.useMeSecurity;
export const useUpdateMeSecurity = meHooks.useUpdateMeSecurity;
export const useVerifyMePin = meHooks.useVerifyMePin;
export const useVerifyOtpForSecurity = meHooks.useVerifyOtpForSecurity;
export const useNotificationPreferences = meHooks.useNotificationPreferences;
export const useUpdateNotificationPreferences =
  meHooks.useUpdateNotificationPreferences;
export const useMetaLinks = meHooks.useMetaLinks;
export const useWeeklySummaryPreview = meHooks.useWeeklySummaryPreview;

// Phase 9 — Household management mutations.
export const {
  useUpdateHousehold,
  useUpdateHouseholdMemberRole,
  useRemoveHouseholdMember,
  useLeaveHousehold,
  useDeleteHousehold,
} = makeHouseholdHooks(apiClient);

export const {
  useBills,
  useBill,
  useBillsSummary,
  useBillsUpcoming,
  useBillPayments,
  useCreateBill,
  useUpdateBill,
  useArchiveBill,
  useRestoreBill,
  usePauseBill,
  useResumeBill,
  useReorderBills,
  useMarkBillPaid,
  useUndoBillPayment,
} = makeBillHooks(apiClient);
