import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import type { Socket } from 'socket.io';

/**
 * Per-socket rate limiting + payload guard for every `@SubscribeMessage`
 * handler. The gateway uses a request→ack contract (handlers reply with
 * `{ ok, data | error }`), so on rejection this returns the fail envelope
 * through the ack instead of throwing — the client always gets a clean answer.
 *
 * Defaults: a sliding window of WINDOW_MS with MAX_EVENTS per socket. Generous
 * for a real UI, tight enough to stop a flood. Tune via env.
 */
const WINDOW_MS = Number(process.env.WS_RATE_WINDOW_MS ?? 1000);
const MAX_EVENTS = Number(process.env.WS_RATE_MAX ?? 40);
/** Reject absurdly large payloads outright (bytes of the JSON body). */
const MAX_PAYLOAD_BYTES = Number(process.env.WS_MAX_PAYLOAD_BYTES ?? 64 * 1024);

interface Bucket {
  count: number;
  windowStart: number;
}

@Injectable()
export class WsThrottleInterceptor implements NestInterceptor {
  private readonly logger = new Logger('WsThrottle');
  private readonly buckets = new Map<string, Bucket>();

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'ws') return next.handle();

    const client = context.switchToWs().getClient<Socket>();
    const data = context.switchToWs().getData<unknown>();

    // ── Payload guard ──
    if (data !== undefined && data !== null && typeof data !== 'object') {
      return of(fail('Invalid payload: expected an object.'));
    }
    if (data != null) {
      let size = 0;
      try {
        size = JSON.stringify(data).length;
      } catch {
        return of(fail('Invalid payload: not serialisable.'));
      }
      if (size > MAX_PAYLOAD_BYTES) {
        return of(fail('Payload too large.'));
      }
    }

    // ── Sliding-window rate limit, keyed by socket id ──
    const key = client.id;
    const now = Date.now();
    const b = this.buckets.get(key);
    if (!b || now - b.windowStart >= WINDOW_MS) {
      this.buckets.set(key, { count: 1, windowStart: now });
    } else {
      b.count += 1;
      if (b.count > MAX_EVENTS) {
        const user = (client as { data?: { user?: { id?: string } } }).data?.user
          ?.id;
        this.logger.warn(
          `rate limit hit · socket=${key}${user ? ` user=${user}` : ''}`,
        );
        return of(fail('Too many requests — slow down.'));
      }
    }

    return next.handle();
  }

  /** Drop a disconnected socket's bucket (called from the gateway). */
  release(socketId: string): void {
    this.buckets.delete(socketId);
  }
}

function fail(error: string) {
  return { ok: false as const, error };
}
