import { Injectable, Logger } from '@nestjs/common';
import { Expo, type ExpoPushMessage, type ExpoPushTicket } from 'expo-server-sdk';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Thin wrapper around the Expo Push SDK. Used by the bills scheduler to
 * enqueue per-user push notifications after writing a `notifications` row.
 *
 * Design:
 *   - Best-effort: failure to deliver does not roll back the notifications row.
 *   - On `DeviceNotRegistered` / token-malformed errors, we LOG the token for
 *     cleanup. A `revoked_at` column on `notification_tokens` does not exist
 *     yet; cleanup is a logged follow-up.
 *   - Messages are chunked via the SDK helper. No receipt polling in v1
 *     (Phase 9 notification preferences can add it).
 */
@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);
  private readonly expo: Expo;

  constructor(private readonly prisma: PrismaService) {
    this.expo = new Expo({
      accessToken: process.env.EXPO_ACCESS_TOKEN,
      useFcmV1: true,
    });
  }

  /**
   * Deliver a push to every non-revoked Expo token for `userId`. Safe to call
   * when the user has no tokens — this is a no-op in that case.
   */
  async send(
    userId: string,
    payload: {
      title: string;
      body: string;
      data: Record<string, unknown>;
      sound?: 'default' | null;
      priority?: 'default' | 'normal' | 'high';
    },
  ): Promise<void> {
    const tokens = await this.prisma.notificationToken.findMany({
      where: { userId },
      select: { id: true, expoPushToken: true },
    });

    const valid: Array<{ id: string; to: string }> = [];
    for (const t of tokens) {
      if (!t.expoPushToken) continue;
      if (!Expo.isExpoPushToken(t.expoPushToken)) {
        this.logger.warn(
          `invalid-token token_id=${t.id} user_id=${userId} flagged for cleanup`,
        );
        continue;
      }
      valid.push({ id: t.id, to: t.expoPushToken });
    }
    if (valid.length === 0) return;

    const messages: ExpoPushMessage[] = valid.map((v) => ({
      to: v.to,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      sound: payload.sound === null ? undefined : (payload.sound ?? 'default'),
      priority: payload.priority ?? 'high',
    }));

    const chunks = this.expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        const tickets: ExpoPushTicket[] = await this.expo.sendPushNotificationsAsync(chunk);
        for (const [idx, ticket] of tickets.entries()) {
          if (ticket.status === 'error') {
            const target = chunk[idx]?.to;
            const tokenStr = Array.isArray(target) ? target[0] : target;
            this.logger.warn(
              `push-error user_id=${userId} token=${String(tokenStr ?? '')} error=${ticket.message} details=${JSON.stringify(ticket.details ?? {})}`,
            );
            // DeviceNotRegistered ⇒ the token is invalid; flag for cleanup.
            if (ticket.details && ticket.details.error === 'DeviceNotRegistered') {
              this.logger.warn(
                `token-not-registered user_id=${userId} token=${String(tokenStr ?? '')} — follow-up: add revoked_at to notification_tokens and set it here`,
              );
            }
          }
        }
      } catch (err: unknown) {
        this.logger.error(
          `push-send-failed user_id=${userId} error=${String(err)}`,
        );
      }
    }
  }
}
