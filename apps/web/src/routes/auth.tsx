import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { ApiRequestError } from '@nayanam/core';
import { useRequestOtp, useVerifyOtp } from '../lib/hooks';

export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    switch (error.code) {
      case 'AUTH_OTP_INVALID':
        return 'Invalid or expired code. Please try again.';
      case 'AUTH_OTP_RATE_LIMITED':
        return 'Too many attempts. Please wait and try again.';
      case 'USER_NOT_FOUND':
        return 'No account found with this email.';
      case 'VALIDATION_ERROR':
        return 'Please check your input and try again.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }
  return 'Something went wrong. Please try again.';
}

export const Route = createFileRoute('/auth')({
  component: AuthScreen,
});

type Step = 'email' | 'code';

function AuthScreen() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const requestOtp = useRequestOtp();
  const verifyOtp = useVerifyOtp();
  const navigate = useNavigate();

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[var(--color-accent)] font-bold text-white">
          N
        </div>
        <div>
          <div className="text-xl font-semibold tracking-tight">Nayanam</div>
          <div className="font-mono text-[10px] uppercase tracking-wider opacity-60">
            Sign in
          </div>
        </div>
      </div>

      {step === 'email' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!email) return;
            requestOtp.mutate(email, {
              onSuccess: () => setStep('code'),
            });
          }}
          className="space-y-4"
        >
          <label className="block">
            <span className="mb-1 block text-sm opacity-70">Email</span>
            <input
              type="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
              placeholder="you@example.com"
            />
          </label>
          {requestOtp.isError && (
            <p className="text-sm text-[var(--color-negative)]">
              {getAuthErrorMessage(requestOtp.error)}
            </p>
          )}
          <button
            type="submit"
            disabled={requestOtp.isPending}
            className="w-full rounded-[var(--radius-md)] bg-[var(--color-accent)] py-2 font-medium text-white disabled:opacity-60"
          >
            {requestOtp.isPending ? 'Sending…' : 'Send code'}
          </button>
        </form>
      )}

      {step === 'code' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length !== 6) return;
            verifyOtp.mutate(
              { email, code },
              {
                onSuccess: () => {
                  void navigate({ to: '/', replace: true });
                },
              },
            );
          }}
          className="space-y-4"
        >
          <div className="text-sm opacity-70">
            We sent a 6-digit code to <span className="font-medium">{email}</span>.
          </div>
          <input
            inputMode="numeric"
            autoFocus
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 text-center font-mono text-xl tracking-[0.4em] outline-none focus:border-[var(--color-accent)]"
            placeholder="••••••"
          />
          {verifyOtp.isError && (
            <p className="text-sm text-[var(--color-negative)]">
              {getAuthErrorMessage(verifyOtp.error)}
            </p>
          )}
          <button
            type="submit"
            disabled={code.length !== 6 || verifyOtp.isPending}
            className="w-full rounded-[var(--radius-md)] bg-[var(--color-accent)] py-2 font-medium text-white disabled:opacity-60"
          >
            {verifyOtp.isPending ? 'Verifying…' : 'Sign in'}
          </button>
          <button
            type="button"
            onClick={() => {
              setCode('');
              setStep('email');
            }}
            className="w-full text-sm opacity-70 hover:opacity-100"
          >
            Use a different email
          </button>
        </form>
      )}
    </main>
  );
}
