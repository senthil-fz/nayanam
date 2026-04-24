// Wraps the Phase 1 invite endpoint. On success the invite link is surfaced
// so the owner can share it manually (email delivery ships via MailService
// server-side; showing the link is a belt-and-suspenders).

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ApiHouseholdRole } from '@nayanam/contracts';
import { Dialog } from '../../components/Dialog';
import { useCreateInvite } from '../../lib/hooks';
import { useToast } from '../../components/Toast';

const Schema = z.object({
  email: z.string().email(),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']),
});
type FormValues = z.infer<typeof Schema>;

export function InviteMemberDialog({
  open,
  onClose,
  householdId,
}: {
  open: boolean;
  onClose: () => void;
  householdId: string;
}) {
  const [lastToken, setLastToken] = useState<string | null>(null);
  const toast = useToast();
  const createInvite = useCreateInvite(householdId);
  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: { email: '', role: 'MEMBER' as ApiHouseholdRole },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const res = await createInvite.mutateAsync(values);
      setLastToken(res.token);
      toast.show('Invite sent');
      form.reset({ email: '', role: 'MEMBER' });
    } catch (e) {
      toast.show(
        e instanceof Error ? e.message : 'Could not invite',
        { tone: 'negative' },
      );
    }
  });

  return (
    <Dialog open={open} onClose={onClose} title="Invite member" size="sm">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--color-text-dim)]">Email</span>
          <input
            type="email"
            {...form.register('email')}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          {form.formState.errors.email ? (
            <span className="text-xs text-[var(--color-negative)]">
              {form.formState.errors.email.message}
            </span>
          ) : null}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--color-text-dim)]">Role</span>
          <select
            {...form.register('role')}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          >
            <option value="OWNER">Owner</option>
            <option value="ADMIN">Admin</option>
            <option value="MEMBER">Member</option>
            <option value="VIEWER">Viewer</option>
          </select>
        </label>
        {lastToken ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
              Invite token
            </div>
            <code className="mt-1 block break-all text-[11px] text-[var(--color-text)]">
              {lastToken}
            </code>
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-medium text-[var(--color-text-dim)]"
          >
            Done
          </button>
          <button
            type="submit"
            disabled={createInvite.isPending}
            className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {createInvite.isPending ? 'Sending…' : 'Send invite'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
