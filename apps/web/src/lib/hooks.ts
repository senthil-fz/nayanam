import { makeAccountHooks, makeAuthHooks } from '@nayanam/core';
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
  useCreateAccount,
  useUpdateAccount,
  useArchiveAccount,
  useRestoreAccount,
  useReorderAccounts,
} = makeAccountHooks(apiClient);
