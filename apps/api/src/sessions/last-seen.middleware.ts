import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { hmacIp } from '../common/hash';
import type { AuthContext } from '../common/context';

/**
 * Phase 9 — session `last_seen_at` and `ip_address_hash` bump, debounced to at
 * most once per 60s per session per process. Hooks after the JWT guard so
 * only authenticated requests tick. A Map-in-memory deliberately keeps this
 * lightweight: losing state across restarts or across pods is acceptable —
 * the worst case is a single extra UPDATE per pod per session per minute.
 */
@Injectable()
export class LastSeenMiddleware implements NestMiddleware {
  private static readonly DEBOUNCE_MS = 60_000;
  private readonly lastTouch = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  use(req: Request & { user?: AuthContext }, _res: Response, next: NextFunction): void {
    const auth = req.user;
    if (!auth?.sessionId) {
      next();
      return;
    }
    const sessionId = auth.sessionId;
    const now = Date.now();
    const prev = this.lastTouch.get(sessionId) ?? 0;
    if (now - prev < LastSeenMiddleware.DEBOUNCE_MS) {
      next();
      return;
    }
    this.lastTouch.set(sessionId, now);

    const ip = extractIp(req);
    const ipHash = ip ? hmacIp(ip) : null;

    // Fire-and-forget; never block the request on the session bump.
    void this.prisma.session
      .update({
        where: { id: sessionId },
        data: {
          lastSeenAt: new Date(now),
          ...(ipHash ? { ipAddressHash: ipHash } : {}),
        },
      })
      .catch(() => {
        // Swallow: the session might have just been revoked/deleted.
      });

    next();
  }
}

function extractIp(req: Request): string | null {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0]!.trim();
  return req.socket?.remoteAddress ?? null;
}

