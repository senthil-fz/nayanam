import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClient } from '../api/client';
import type { AuthStore } from '../stores/auth';

export function makeAuthHooks(client: ApiClient, useAuthStore: AuthStore) {
  function useMe() {
    const accessToken = useAuthStore((s) => s.accessToken);
    const refreshToken = useAuthStore((s) => s.refreshToken);
    return useQuery({
      queryKey: ['me'],
      enabled: Boolean(accessToken ?? refreshToken),
      queryFn: () => client.getMe(),
    });
  }

  function useRequestOtp() {
    return useMutation({
      mutationFn: (email: string) => client.authOtpRequest(email),
    });
  }

  function useVerifyOtp() {
    const setSession = useAuthStore((s) => s.setSession);
    const qc = useQueryClient();
    return useMutation({
      mutationFn: ({ email, code }: { email: string; code: string }) =>
        client.authOtpVerify(email, code),
      onSuccess: (data) => {
        setSession({
          user: data.user,
          households: data.households,
          tokens: {
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            accessTokenExpiresAt: data.accessTokenExpiresAt,
          },
        });
        void qc.invalidateQueries({ queryKey: ['me'] });
      },
    });
  }

  function useLogout() {
    const clear = useAuthStore((s) => s.clear);
    const qc = useQueryClient();
    return useMutation({
      mutationFn: () => client.authLogout(),
      onSettled: () => {
        clear();
        qc.clear();
      },
    });
  }

  function useHouseholds() {
    const accessToken = useAuthStore((s) => s.accessToken);
    const refreshToken = useAuthStore((s) => s.refreshToken);
    return useQuery({
      queryKey: ['households'],
      enabled: Boolean(accessToken ?? refreshToken),
      queryFn: () => client.listHouseholds().then((r) => r.items),
    });
  }

  function useCreateHousehold() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (body: { name: string; defaultCurrencyCode?: string }) =>
        client.createHousehold(body),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ['households'] });
        void qc.invalidateQueries({ queryKey: ['me'] });
      },
    });
  }

  function useAcceptInvite() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (token: string) => client.acceptInvite(token),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ['households'] });
        void qc.invalidateQueries({ queryKey: ['me'] });
      },
    });
  }

  function useHouseholdMembers(householdId: string | null) {
    return useQuery({
      queryKey: ['households', householdId, 'members'],
      enabled: Boolean(householdId),
      queryFn: () => client.listMembers(householdId!).then((r) => r.items),
    });
  }

  function useHouseholdInvites(householdId: string | null) {
    return useQuery({
      queryKey: ['households', householdId, 'invites'],
      enabled: Boolean(householdId),
      queryFn: () => client.listInvites(householdId!).then((r) => r.items),
    });
  }

  function useCreateInvite(householdId: string | null) {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (body: { email: string; role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' }) =>
        client.createInvite(householdId!, body),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ['households', householdId, 'invites'] });
      },
    });
  }

  function useRevokeInvite(householdId: string | null) {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (inviteId: string) => client.revokeInvite(householdId!, inviteId),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ['households', householdId, 'invites'] });
      },
    });
  }

  return {
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
  };
}
