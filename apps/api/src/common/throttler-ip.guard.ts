import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Per-IP throttler guard.
 *
 * Overrides `getTracker` to key ALL throttler buckets (short / medium / long)
 * on the client IP rather than the default user-or-IP heuristic. IP extraction
 * mirrors `extractIp` in `auth.service.ts` and `last-seen.middleware.ts`:
 * prefer the first hop in `x-forwarded-for`, fall back to the socket address.
 *
 * Three buckets are registered in ThrottlerModule (app.module.ts):
 *   short  — 5 req / 10 s  (auth and sensitive ops, overridden via @Throttle)
 *   medium — 30 req / 60 s (most mutations)
 *   long   — 120 req / 1 h (slow-drip enumeration guard)
 *
 * Phase 11 ships in-memory storage. A Redis-backed throttler is Phase 12
 * (multi-pod deployment), along with hardening Express `trust proxy`.
 */
@Injectable()
export class IpThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const r = req as unknown as Request;
    const xf = r.headers?.['x-forwarded-for'];
    if (typeof xf === 'string' && xf.length) {
      const first = xf.split(',')[0];
      if (first) return first.trim();
    }
    return r.socket?.remoteAddress ?? 'unknown';
  }
}
