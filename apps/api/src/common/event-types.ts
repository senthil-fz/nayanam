/**
 * Canonical event-type registry. Re-exported from `@nayanam/core` — the single
 * source of truth (B4 / event-type consolidation). API services import from
 * here so the import path stays stable; the values live in
 * `packages/core/src/events/types.ts`.
 *
 * TODO: Add per-event-type Zod payload schemas for compile-time validation.
 * Currently payloads are untyped JSON.
 */
export { EventType } from '@nayanam/core/events';
