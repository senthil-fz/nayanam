/**
 * Singleton router reference for imperative navigation outside React components.
 *
 * Call `setRouter(router)` once in main.tsx immediately after `createRouter(...)`.
 * Then `getRouter()` is safe to call from module-level callbacks (e.g. the
 * onUnauthenticated handler in api.ts).
 */
import type { AnyRouter } from '@tanstack/react-router';

let _router: AnyRouter | null = null;

export function setRouter(router: AnyRouter): void {
  _router = router;
}

export function getRouter(): AnyRouter | null {
  return _router;
}
