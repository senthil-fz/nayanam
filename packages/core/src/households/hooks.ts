// Household-mutation hooks (Phase 9). Read hooks for households/members/
// invites remain in `hooks/auth.ts` for Phase 1 back-compat — this module
// adds the mutation surface.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiClient } from '../api/client';
import type { ApiSchemas } from '@nayanam/contracts';

type HouseholdUpdate = ApiSchemas['HouseholdUpdate'];
type HouseholdRole = ApiSchemas['HouseholdRole'];

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

export type UpdateHouseholdVars = {
  id: string;
  patch: HouseholdUpdate;
  idempotencyKey?: string;
};

export type UpdateHouseholdMemberRoleVars = {
  householdId: string;
  userId: string;
  role: HouseholdRole;
  idempotencyKey?: string;
};

export type RemoveHouseholdMemberVars = {
  householdId: string;
  userId: string;
  idempotencyKey?: string;
};

export type LeaveHouseholdVars = {
  householdId: string;
  idempotencyKey?: string;
};

export type DeleteHouseholdVars = {
  householdId: string;
  idempotencyKey?: string;
};

export function makeHouseholdHooks(client: ApiClient) {
  function invalidate(qc: ReturnType<typeof useQueryClient>, id: string | null) {
    void qc.invalidateQueries({ queryKey: ['households'] });
    if (id) {
      void qc.invalidateQueries({ queryKey: ['households', id] });
      void qc.invalidateQueries({ queryKey: ['households', id, 'members'] });
      void qc.invalidateQueries({ queryKey: ['households', id, 'invites'] });
    }
    void qc.invalidateQueries({ queryKey: ['me'] });
  }

  function useUpdateHousehold() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<UpdateHouseholdVars>,
      mutationFn: (vars: UpdateHouseholdVars) =>
        client.updateHousehold(vars.id, vars.patch, vars.idempotencyKey),
      onSuccess: (_res, vars) => {
        invalidate(qc, vars.id);
      },
    });
  }

  function useUpdateHouseholdMemberRole() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<UpdateHouseholdMemberRoleVars>,
      mutationFn: (vars: UpdateHouseholdMemberRoleVars) =>
        client.updateHouseholdMemberRole(
          vars.householdId,
          vars.userId,
          { role: vars.role },
          vars.idempotencyKey,
        ),
      onSuccess: (_res, vars) => {
        invalidate(qc, vars.householdId);
      },
    });
  }

  function useRemoveHouseholdMember() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<RemoveHouseholdMemberVars>,
      mutationFn: (vars: RemoveHouseholdMemberVars) =>
        client.removeHouseholdMember(
          vars.householdId,
          vars.userId,
          vars.idempotencyKey,
        ),
      onSuccess: (_res, vars) => {
        invalidate(qc, vars.householdId);
      },
    });
  }

  function useLeaveHousehold() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<LeaveHouseholdVars>,
      mutationFn: (vars: LeaveHouseholdVars) =>
        client.leaveHousehold(vars.householdId, vars.idempotencyKey),
      onSuccess: (_res, vars) => {
        invalidate(qc, vars.householdId);
      },
    });
  }

  function useDeleteHousehold() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<DeleteHouseholdVars>,
      mutationFn: (vars: DeleteHouseholdVars) =>
        client.deleteHousehold(vars.householdId, vars.idempotencyKey),
      onSuccess: (_res, vars) => {
        invalidate(qc, vars.householdId);
      },
    });
  }

  return {
    useUpdateHousehold,
    useUpdateHouseholdMemberRole,
    useRemoveHouseholdMember,
    useLeaveHousehold,
    useDeleteHousehold,
  };
}

export type HouseholdHooks = ReturnType<typeof makeHouseholdHooks>;
