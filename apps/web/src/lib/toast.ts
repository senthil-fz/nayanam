/**
 * Singleton toast reference for imperative notification outside React components.
 *
 * Call `setShowToast(toast.show)` once inside <ToastProvider> (see Toast.tsx).
 * Then `showToast(...)` is safe to call from module-level callbacks (e.g. the
 * QueryCache onError handler in main.tsx).
 */
type ShowToast = (message: string, opts?: { tone?: 'default' | 'negative' }) => void;

let _show: ShowToast | null = null;

export function setShowToast(fn: ShowToast): void {
  _show = fn;
}

export function showToast(message: string, opts?: { tone?: 'default' | 'negative' }): void {
  _show?.(message, opts);
}
