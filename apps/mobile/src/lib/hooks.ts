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

export { useHomeStore } from '../stores/home';
export { useAppearanceStore } from '../stores/appearance';

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

// Phase 9 `/me/*` surface. `isAuthed` gates the queries behind refresh-token
// presence so /me doesn't fire before hydration — mirrors the Phase 1
// `useMe` gating done inside `makeAuthHooks`.
export const {
  useMe: useMePhase9,
  useUpdateMe,
  useRequestChangeEmail,
  useVerifyChangeEmail,
  useMeSessions,
  useRevokeMeSession,
  useRevokeAllOtherSessions,
  useMeSecurity,
  useUpdateMeSecurity,
  useVerifyMePin,
  useVerifyOtpForSecurity,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  useMetaLinks,
  useWeeklySummaryPreview,
} = makeMeHooks(apiClient, {
  isAuthed: () => {
    const s = useAuthStore.getState();
    return Boolean(s.accessToken ?? s.refreshToken);
  },
});

// Phase 9 household-mutation surface. Phase 1 `makeAuthHooks` continues to
// own the household READ hooks (listHouseholds, members, invites).
export const {
  useUpdateHousehold,
  useUpdateHouseholdMemberRole,
  useRemoveHouseholdMember,
  useLeaveHousehold,
  useDeleteHousehold,
} = makeHouseholdHooks(apiClient);

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

export const {
  useStatsOverview,
  useMonthlyTrend,
  useCategoryBreakdown,
  useDailySpend,
  useCategorySparkline,
  useSankey,
} = makeStatsHooks(apiClient);

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
