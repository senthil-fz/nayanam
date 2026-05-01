import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClient } from '../api/client';
import type { AuthStore } from '../stores/auth';

function genIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function ensureKey<V extends { idempotencyKey?: string }>(vars: V): V {
  if (!vars.idempotencyKey) vars.idempotencyKey = genIdempotencyKey();
  return vars;
}

export type RequestOtpVars = { email: string; idempotencyKey?: string };
export type VerifyOtpVars = {
  email: string;
  code: string;
  idempotencyKey?: string;
};
export type CreateHouseholdVars = {
  name: string;
  defaultCurrencyCode?: string;
  idempotencyKey?: string;
};
export type AcceptInviteVars = { token: string; idempotencyKey?: string };
export type CreateInviteVars = {
  email: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  idempotencyKey?: string;
};
export type RevokeInviteVars = { inviteId: string; idempotencyKey?: string };

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
      onMutate: (vars: RequestOtpVars | string) => {
        const v: RequestOtpVars =
          typeof vars === 'string' ? { email: vars } : { ...vars };
        return ensureKey<RequestOtpVars>(v);
      },
      mutationFn: (vars: RequestOtpVars | string) => {
        const v: RequestOtpVars =
          typeof vars === 'string' ? { email: vars } : vars;
        return client.authOtpRequest(v.email, v.idempotencyKey);
      },
    });
  }

  function useVerifyOtp() {
    const setSession = useAuthStore((s) => s.setSession);
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<VerifyOtpVars>,
      mutationFn: (vars: VerifyOtpVars) =>
        client.authOtpVerify(vars.email, vars.code, vars.idempotencyKey),
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
      // Logout always auto-generates its own key. Callsites do `logout.mutate()`
      // with no args, so the variable type must be `void`.
      mutationFn: () => client.authLogout(genIdempotencyKey()),
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
      onMutate: ensureKey<CreateHouseholdVars>,
      mutationFn: (vars: CreateHouseholdVars) => {
        const { idempotencyKey, ...body } = vars;
        return client.createHousehold(body, idempotencyKey);
      },
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ['households'] });
        void qc.invalidateQueries({ queryKey: ['me'] });
      },
    });
  }

  function useAcceptInvite() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: (vars: AcceptInviteVars | string) => {
        const v: AcceptInviteVars =
          typeof vars === 'string' ? { token: vars } : { ...vars };
        return ensureKey<AcceptInviteVars>(v);
      },
      mutationFn: (vars: AcceptInviteVars | string) => {
        const v: AcceptInviteVars =
          typeof vars === 'string' ? { token: vars } : vars;
        return client.acceptInvite(v.token, v.idempotencyKey);
      },
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
      onMutate: ensureKey<CreateInviteVars>,
      mutationFn: (vars: CreateInviteVars) => {
        const { idempotencyKey, ...body } = vars;
        return client.createInvite(householdId!, body, idempotencyKey);
      },
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ['households', householdId, 'invites'] });
      },
    });
  }

  function useRevokeInvite(householdId: string | null) {
    const qc = useQueryClient();
    return useMutation({
      onMutate: (vars: RevokeInviteVars | string) => {
        const v: RevokeInviteVars =
          typeof vars === 'string' ? { inviteId: vars } : { ...vars };
        return ensureKey<RevokeInviteVars>(v);
      },
      mutationFn: (vars: RevokeInviteVars | string) => {
        const v: RevokeInviteVars =
          typeof vars === 'string' ? { inviteId: vars } : vars;
        return client.revokeInvite(householdId!, v.inviteId, v.idempotencyKey);
      },
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
