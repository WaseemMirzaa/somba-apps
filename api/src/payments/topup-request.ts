import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { QueryFailedError } from 'typeorm';

/** The key an app may send with a wallet top-up so a retry of the same tap is the same top-up. */
export const TOPUP_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Without a key, an identical top-up (same method, amount and phone) still pending within this window is the same tap. */
export const TOPUP_DEDUP_MS = 60_000;

export interface TopUpClaim {
  /** What goes in `payments.requestKey` (UNIQUE with the user): the app's key, or a fingerprint of the top-up plus the minute. */
  key: string;
  /** True when the app sent the key itself; a fingerprint claim never blocks a later, deliberate retry. */
  explicit: boolean;
}

/**
 * The idempotency claim of one top-up request (C-01, same idea as an order's checkout key). The database enforces it with a
 * unique index, so two taps that arrive at the same moment cannot both create a payment.
 */
export function topUpClaim(
  userId: string,
  input: { amountUsd: number; method: string; phone: string; clientRequestId?: unknown },
  now: number,
): TopUpClaim {
  const given = input.clientRequestId;
  if (given != null && given !== '') {
    const id = String(given).trim();
    if (!TOPUP_REQUEST_ID.test(id)) throw new BadRequestException('Invalid top-up reference. Please try again.');
    return { key: `k:${id}`, explicit: true };
  }
  const fp = createHash('sha256').update(JSON.stringify([userId, input.method, input.amountUsd.toFixed(2), input.phone])).digest('hex').slice(0, 40);
  return { key: `fp:${fp}:${Math.floor(now / TOPUP_DEDUP_MS)}`, explicit: false };
}

export const isDuplicateKey = (e: unknown): boolean =>
  e instanceof QueryFailedError && /UNIQUE|Duplicate entry|ER_DUP_ENTRY|SQLITE_CONSTRAINT/i.test(String((e as Error).message));
