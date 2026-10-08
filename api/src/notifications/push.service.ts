import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { DeviceToken } from '../database/entities';
import type { DeviceApp, DevicePlatform } from '../database/entities';

export interface PushPayload {
  title: string;
  body: string;
  /** Small string map delivered with the push (deep-link: type + entityId). */
  data?: Record<string, string>;
}

/** FCM error codes meaning the token is dead and should be forgotten. */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * Firebase Cloud Messaging push delivery.
 *
 * Credentials (any ONE of):
 *   FIREBASE_SERVICE_ACCOUNT_JSON   raw JSON or base64 of the service-account key
 *   GOOGLE_APPLICATION_CREDENTIALS  path to the key file on the server
 *
 * With no credentials configured the service is a deliberate no-op (logged once)
 * so dev/CI and unconfigured deployments run normally; in-app realtime delivery
 * over the socket is unaffected. Push is best-effort: a send failure is logged,
 * never thrown into the business flow that triggered the notification.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private messaging: Messaging | null | undefined; // undefined = not yet initialised

  constructor(
    @InjectRepository(DeviceToken)
    private readonly tokens: Repository<DeviceToken>,
  ) {}

  /** True when Firebase credentials are present and initialised. */
  get enabled(): boolean {
    return this.getMessaging() !== null;
  }

  private getMessaging(): Messaging | null {
    if (this.messaging !== undefined) return this.messaging;
    try {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
      if (raw) {
        const json = raw.startsWith('{')
          ? raw
          : Buffer.from(raw, 'base64').toString('utf8');
        const app = getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(json)) });
        this.messaging = getMessaging(app);
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        const app = getApps()[0] ?? initializeApp();
        this.messaging = getMessaging(app);
      } else {
        this.logger.warn(
          'Push disabled: set FIREBASE_SERVICE_ACCOUNT_JSON (or GOOGLE_APPLICATION_CREDENTIALS) to enable FCM.',
        );
        this.messaging = null;
      }
    } catch (err) {
      this.logger.error(`Firebase init failed — push disabled: ${(err as Error).message}`);
      this.messaging = null;
    }
    return this.messaging;
  }

  // ── Device registry ──────────────────────────────────────────────────────
  /** Register (or re-assign) a device token to the signed-in user. Idempotent. */
  async register(
    user: { id: string; role: string },
    input: { token: string; platform?: DevicePlatform; app?: DeviceApp },
  ): Promise<DeviceToken> {
    const token = input.token?.trim();
    if (!token || token.length > 255) throw new Error('A valid device token is required.');
    const existing = await this.tokens.findOne({ where: { token } });
    if (!existing) {
      // Keep the registry bounded: a user keeps their 10 most recent devices.
      const mine = await this.tokens.find({ where: { userId: user.id }, order: { updatedAt: 'ASC' } });
      for (const old of mine.slice(0, Math.max(0, mine.length - 9))) await this.tokens.delete({ token: old.token });
    }
    // The same physical device can change hands (logout → another login): the
    // token always follows the CURRENT user so pushes never leak to the old one.
    const row = existing ?? this.tokens.create({ token });
    row.userId = user.id;
    row.role = user.role;
    row.platform = input.platform ?? row.platform ?? 'android';
    row.app = input.app ?? row.app ?? 'customer';
    return this.tokens.save(row);
  }

  /** Scoped to the owner so one user can't unregister another's device. */
  async unregister(token: string, userId: string): Promise<void> {
    await this.tokens.delete({ token, userId });
  }

  /** Forget every device of a user (account deletion / sign-out everywhere). */
  async unregisterUser(userId: string): Promise<void> {
    await this.tokens.delete({ userId });
  }

  // ── Delivery ─────────────────────────────────────────────────────────────
  sendToUser(userId: string, payload: PushPayload): Promise<number> {
    return this.deliver({ userId }, payload);
  }

  sendToRole(role: string, payload: PushPayload): Promise<number> {
    return this.deliver({ role }, payload);
  }

  /** Returns the number of devices successfully reached. */
  private async deliver(
    where: { userId: string } | { role: string },
    payload: PushPayload,
  ): Promise<number> {
    const messaging = this.getMessaging();
    if (!messaging) return 0;
    try {
      const rows = await this.tokens.find({ where });
      if (!rows.length) return 0;
      // FCM multicast accepts up to 500 tokens per call.
      let reached = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const res = await messaging.sendEachForMulticast({
          tokens: batch.map((r) => r.token),
          notification: { title: payload.title, body: payload.body },
          data: payload.data,
          android: { priority: 'high' },
        });
        reached += res.successCount;
        const dead = batch
          .filter((_, idx) => {
            const code = res.responses[idx]?.error?.code;
            return !!code && DEAD_TOKEN_CODES.has(code);
          })
          .map((r) => r.token);
        if (dead.length) {
          await this.tokens.delete({ token: In(dead) });
          this.logger.log(`Pruned ${dead.length} dead device token(s)`);
        }
      }
      return reached;
    } catch (err) {
      this.logger.error(`Push delivery failed: ${(err as Error).message}`);
      return 0;
    }
  }
}
