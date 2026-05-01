import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Per-IP throttler guard.
 *
 * Overrides `getTracker` to key the bucket on the client IP rather than the
 * default user-or-IP heuristic. IP extraction mirrors `extractIp` in
 * `auth.service.ts` and `last-seen.middleware.ts`: prefer the first hop in
 * `x-forwarded-for`, fall back to the socket address.
 *
 * Phase 11 ships in-memory storage. A Redis-backed throttler is Phase 11b
 * (see spec §Out-of-scope) along with hardening Express `trust proxy`.
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
