import {
  makeAccountHooks,
  makeAuthHooks,
  makeBillHooks,
  makeCategoryHooks,
  makeNotificationHooks,
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

export const { useUnreadNotificationCount } = makeNotificationHooks(apiClient);

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
