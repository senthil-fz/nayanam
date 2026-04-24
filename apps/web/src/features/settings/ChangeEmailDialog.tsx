// Two-step OTP-verified email change. Step 1 = request OTP to the new
// address. Step 2 = verify. Resend is disabled until `nextAllowedAt`.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ChangeEmailRequestInput,
  ChangeEmailVerifyInput,
  type ChangeEmailRequestInputType,
  type ChangeEmailVerifyInputType,
} from '@nayanam/core';
import { Dialog } from '../../components/Dialog';
import { useRequestChangeEmail, useVerifyChangeEmail } from '../../lib/hooks';
import { useToast } from '../../components/Toast';

type Stage = 'request' | 'verify';

export function ChangeEmailDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<Stage>('request');
  const [pendingEmail, setPendingEmail] = useState('');
  const [nextAllowedAt, setNextAllowedAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const toast = useToast();

  const requestMut = useRequestChangeEmail();
  const verifyMut = useVerifyChangeEmail();

  // Reset the form state when the dialog closes. We guard on the previous
  // `open` value so the effect body only writes state on the close transition.
  const prevOpen = useRef(open);
  useEffect(() => {
    const wasOpen = prevOpen.current;
    prevOpen.current = open;
    if (wasOpen && !open) {
      setStage('request');
      setPendingEmail('');
      setNextAllowedAt(null);
    }
  }, [open]);

  // Lightweight clock for the cooldown countdown.
  useEffect(() => {
    if (!nextAllowedAt) return;
    const i = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(i);
  }, [nextAllowedAt]);

  const cooldownSec = useMemo(() => {
    if (!nextAllowedAt) return 0;
    const diff = Math.round((new Date(nextAllowedAt).getTime() - now) / 1000);
    return diff > 0 ? diff : 0;
  }, [nextAllowedAt, now]);

  const requestForm = useForm<ChangeEmailRequestInputType>({
    resolver: zodResolver(ChangeEmailRequestInput),
    defaultValues: { newEmail: '' },
  });
  const verifyForm = useForm<ChangeEmailVerifyInputType>({
    resolver: zodResolver(ChangeEmailVerifyInput),
    defaultValues: { otp: '' },
  });

  const onRequest = requestForm.handleSubmit(async (values) => {
    try {
      const res = await requestMut.mutateAsync({ newEmail: values.newEmail });
      setPendingEmail(values.newEmail);
      setNextAllowedAt(res.nextAllowedAt);
      setStage('verify');
    } catch (e) {
      toast.show(
        e instanceof Error ? e.message : 'Could not send code',
        { tone: 'negative' },
      );
    }
  });

  const onResend = async () => {
    if (cooldownSec > 0 || !pendingEmail) return;
    try {
      const res = await requestMut.mutateAsync({ newEmail: pendingEmail });
      setNextAllowedAt(res.nextAllowedAt);
      toast.show('Code resent');
    } catch (e) {
      toast.show(
        e instanceof Error ? e.message : 'Could not resend',
        { tone: 'negative' },
      );
    }
  };

  const onVerify = verifyForm.handleSubmit(async (values) => {
    try {
      await verifyMut.mutateAsync({ otp: values.otp });
      toast.show('Email updated');
      onClose();
    } catch (e) {
      toast.show(
        e instanceof Error ? e.message : 'Invalid code',
        { tone: 'negative' },
      );
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={stage === 'request' ? 'Change email' : `Enter the code we sent to ${pendingEmail}`}
      size="sm"
    >
      {stage === 'request' ? (
        <form onSubmit={onRequest} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--color-text-dim)]">
              New email
            </span>
            <input
              type="email"
              autoComplete="email"
              {...requestForm.register('newEmail')}
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
            />
            {requestForm.formState.errors.newEmail ? (
              <span className="text-xs text-[var(--color-negative)]">
                {requestForm.formState.errors.newEmail.message}
              </span>
            ) : null}
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-4 py-2 text-sm font-medium text-[var(--color-text-dim)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={requestMut.isPending}
              className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {requestMut.isPending ? 'Sending…' : 'Send code'}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={onVerify} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--color-text-dim)]">
              6-digit code
            </span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              {...verifyForm.register('otp')}
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-center font-mono text-lg tracking-[0.5em] outline-none focus:border-[var(--color-accent)]"
            />
            {verifyForm.formState.errors.otp ? (
              <span className="text-xs text-[var(--color-negative)]">
                {verifyForm.formState.errors.otp.message}
              </span>
            ) : null}
          </label>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => void onResend()}
              disabled={cooldownSec > 0 || requestMut.isPending}
              className="text-xs font-medium text-[var(--color-accent)] disabled:text-[var(--color-text-dim)]"
            >
              {cooldownSec > 0 ? `Send again in ${cooldownSec}s` : 'Send again'}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStage('request')}
                className="rounded-full px-3 py-2 text-sm font-medium text-[var(--color-text-dim)]"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={verifyMut.isPending}
                className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {verifyMut.isPending ? 'Verifying…' : 'Verify'}
              </button>
            </div>
          </div>
        </form>
      )}
    </Dialog>
  );
}
