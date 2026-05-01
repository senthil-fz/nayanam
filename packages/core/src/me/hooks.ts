// TanStack Query hooks for the `/me/*` Phase 9 surface. Factory pattern so
// each platform (web, mobile) instantiates with its own shared API client.
//
// Mutation idempotency follows the attachments/bills pattern: an `onMutate`
// hook ensures every mutation carries an `Idempotency-Key` unless the caller
// already provided one.

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { ApiClient } from '../api/client';
import type { ApiSchemas } from '@nayanam/contracts';
import type {
  ChangeEmailRequestInputType,
  ChangeEmailVerifyInputType,
  PatchNotificationPreferencesInputType,
  UpdateMeInputType,
  UpdateMeSecurityInputType,
  VerifyPinInputType,
  VerifyOtpForSecurityInputType,
} from './schemas';

type ResetPinInputType = ApiSchemas['ResetPinInput'];

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

export const meKeys = {
  root: ['me'] as const,
  me: () => ['me'] as const,
  sessions: () => ['me', 'sessions'] as const,
  security: () => ['me', 'security'] as const,
  notificationPreferences: () => ['me', 'notification-preferences'] as const,
  metaLinks: () => ['me', 'meta-links'] as const,
  weeklySummaryPreview: (weekEndingAt?: string) =>
    ['me', 'weekly-summary-preview', weekEndingAt ?? 'default'] as const,
};

// Mutation variable shapes — each carries an optional idempotency key that the
// shared `ensureKey` onMutate auto-populates. Keeps callsites clean.

export type UpdateMeVars = UpdateMeInputType & { idempotencyKey?: string };
export type RequestChangeEmailVars = ChangeEmailRequestInputType & {
  idempotencyKey?: string;
};
export type VerifyChangeEmailVars = ChangeEmailVerifyInputType & {
  idempotencyKey?: string;
};
export type RevokeMeSessionVars = {
  sessionId: string;
  idempotencyKey?: string;
};
export type RevokeAllOtherSessionsVars = { idempotencyKey?: string };
export type UpdateMeSecurityVars = UpdateMeSecurityInputType & {
  idempotencyKey?: string;
};
export type VerifyMePinVars = VerifyPinInputType & { idempotencyKey?: string };
export type VerifyOtpForSecurityVars = VerifyOtpForSecurityInputType & {
  idempotencyKey?: string;
};
export type ResetMePinVars = ResetPinInputType & { idempotencyKey?: string };
export type UpdateNotificationPreferencesVars =
  PatchNotificationPreferencesInputType & { idempotencyKey?: string };

export function makeMeHooks(
  client: ApiClient,
  opts?: {
    /**
     * If the host app's auth store gates `useMe`, pass a subscriber. When
     * omitted we always run the query and let the client's 401 handling
     * redirect anonymously.
     */
    isAuthed?: () => boolean;
  },
) {
  const isAuthed = opts?.isAuthed ?? (() => true);

  function useMe() {
    return useQuery({
      queryKey: meKeys.me(),
      enabled: isAuthed(),
      queryFn: () => client.getMe(),
    });
  }

  function useUpdateMe() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<UpdateMeVars>,
      mutationFn: (vars: UpdateMeVars) => {
        const { idempotencyKey, ...body } = vars;
        return client.updateMe(body, idempotencyKey);
      },
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: meKeys.me() });
      },
    });
  }

  function useRequestChangeEmail() {
    return useMutation({
      onMutate: ensureKey<RequestChangeEmailVars>,
      mutationFn: (vars: RequestChangeEmailVars) => {
        const { idempotencyKey, ...body } = vars;
        return client.requestChangeEmail(body, idempotencyKey);
      },
    });
  }

  function useVerifyChangeEmail() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<VerifyChangeEmailVars>,
      mutationFn: (vars: VerifyChangeEmailVars) => {
        const { idempotencyKey, ...body } = vars;
        return client.verifyChangeEmail(body, idempotencyKey);
      },
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: meKeys.me() });
      },
    });
  }

  function useMeSessions() {
    return useQuery({
      queryKey: meKeys.sessions(),
      enabled: isAuthed(),
      queryFn: () => client.listMeSessions().then((r) => r.items),
    });
  }

  function useRevokeMeSession() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<RevokeMeSessionVars>,
      mutationFn: (vars: RevokeMeSessionVars) =>
        client.revokeMeSession(vars.sessionId, vars.idempotencyKey),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: meKeys.sessions() });
      },
    });
  }

  function useRevokeAllOtherSessions() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<RevokeAllOtherSessionsVars>,
      mutationFn: (vars: RevokeAllOtherSessionsVars) =>
        client.revokeAllOtherMeSessions(vars.idempotencyKey),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: meKeys.sessions() });
      },
    });
  }

  function useMeSecurity() {
    return useQuery({
      queryKey: meKeys.security(),
      enabled: isAuthed(),
      queryFn: () => client.getMeSecurity(),
    });
  }

  function useUpdateMeSecurity() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<UpdateMeSecurityVars>,
      mutationFn: (vars: UpdateMeSecurityVars) => {
        const { idempotencyKey, ...body } = vars;
        return client.updateMeSecurity(body, idempotencyKey);
      },
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: meKeys.security() });
      },
    });
  }

  function useVerifyMePin() {
    return useMutation({
      onMutate: ensureKey<VerifyMePinVars>,
      mutationFn: (vars: VerifyMePinVars) => {
        const { idempotencyKey, ...body } = vars;
        return client.verifyMePin(body, idempotencyKey);
      },
    });
  }

  function useVerifyOtpForSecurity() {
    return useMutation({
      onMutate: ensureKey<VerifyOtpForSecurityVars>,
      mutationFn: (vars: VerifyOtpForSecurityVars) => {
        const { idempotencyKey, ...body } = vars;
        return client.authOtpVerifyForSecurity(body, idempotencyKey);
      },
    });
  }

  function useResetMePin() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<ResetMePinVars>,
      mutationFn: (vars: ResetMePinVars) => {
        const { idempotencyKey, ...body } = vars;
        return client.resetMePin(body, idempotencyKey);
      },
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: meKeys.security() });
      },
    });
  }

  function useNotificationPreferences() {
    return useQuery({
      queryKey: meKeys.notificationPreferences(),
      enabled: isAuthed(),
      queryFn: () => client.getNotificationPreferences(),
    });
  }

  function useUpdateNotificationPreferences() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<UpdateNotificationPreferencesVars>,
      mutationFn: (vars: UpdateNotificationPreferencesVars) => {
        const { idempotencyKey, ...body } = vars;
        return client.updateNotificationPreferences(body, idempotencyKey);
      },
      onSuccess: (data) => {
        qc.setQueryData(meKeys.notificationPreferences(), data);
      },
    });
  }

  function useMetaLinks() {
    return useQuery({
      queryKey: meKeys.metaLinks(),
      enabled: isAuthed(),
      queryFn: () => client.getMetaLinks(),
      // External-link URLs rarely change — keep them stable during a session.
      staleTime: 60 * 60_000,
    });
  }

  function useWeeklySummaryPreview(params?: { weekEndingAt?: string }) {
    return useQuery({
      queryKey: meKeys.weeklySummaryPreview(params?.weekEndingAt),
      enabled: isAuthed(),
      queryFn: () =>
        client.getWeeklySummaryPreview(
          params?.weekEndingAt ? { weekEndingAt: params.weekEndingAt } : undefined,
        ),
    });
  }

  return {
    useMe,
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
    useResetMePin,
    useNotificationPreferences,
    useUpdateNotificationPreferences,
    useMetaLinks,
    useWeeklySummaryPreview,
  };
}

export type MeHooks = ReturnType<typeof makeMeHooks>;
