import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Per-IP throttler guard.
 *
 * Overrides `getTracker` to key ALL throttler buckets (short / medium / long)
 * on the client IP rather than the default user-or-IP heuristic.
 *
 * SECURITY: We use Express's derived `req.ip` which already honours the
 * `trust proxy 1` setting configured in main.ts. This means Express has
 * already validated the X-Forwarded-For chain and resolved the real last-trusted
 * hop — we do NOT parse the raw header ourselves, which would allow a client to
 * supply an arbitrary spoofed IP and bypass all throttling.
 *
 * Three buckets are registered in ThrottlerModule (app.module.ts):
 *   short  — 5 req / 60 s (auth and sensitive ops, overridden via @Throttle)
 *   medium — 30 req / 60 s (most mutations)
 *   long   — 120 req / 1 h (slow-drip enumeration guard)
 *
 * Phase 11 ships in-memory storage. A Redis-backed throttler is Phase 12
 * (multi-pod deployment).
 */
@Injectable()
export class IpThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const r = req as unknown as Request;
    // req.ip is set by Express after applying trust-proxy rules; it is the
    // last trusted hop in the X-Forwarded-For chain, NOT the raw header.
    return Promise.resolve(r.ip ?? r.socket?.remoteAddress ?? 'unknown');
  }
}
