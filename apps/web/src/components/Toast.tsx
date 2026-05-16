// Minimal toast host. Keeps up to one toast at a time — sufficient for the
// archive/undo flow. Replace with a real toast lib when the design system lands.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { setShowToast } from '../lib/toast';

type ToastAction = { label: string; onClick: () => void };
type ToastPayload = { id: number; message: string; action?: ToastAction; tone?: 'default' | 'negative' };

type ToastContextValue = {
  show: (message: string, opts?: { action?: ToastAction; tone?: ToastPayload['tone']; durationMs?: number }) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const timerRef = useRef<number | null>(null);

  const dismiss = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast(null);
  }, []);

  const show = useCallback<ToastContextValue['show']>((message, opts) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const id = Date.now();
    setToast({ id, message, action: opts?.action, tone: opts?.tone ?? 'default' });
    timerRef.current = window.setTimeout(() => setToast(null), opts?.durationMs ?? 5000);
  }, []);

  // Expose the show function via the imperative singleton so QueryCache
  // error handlers (created outside React) can trigger toasts.
  useEffect(() => {
    setShowToast(show);
  }, [show]);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
        >
          <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-[var(--radius-md)] bg-[var(--color-text)] px-4 py-3 text-sm text-[var(--color-bg)] shadow-lg">
            <span>{toast.message}</span>
            {toast.action ? (
              <button
                onClick={() => {
                  toast.action?.onClick();
                  dismiss();
                }}
                className="font-medium text-[var(--color-accent-soft)] underline-offset-2 hover:underline"
              >
                {toast.action.label}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const v = useContext(ToastContext);
  if (!v) throw new Error('useToast must be used inside ToastProvider');
  return v;
}
