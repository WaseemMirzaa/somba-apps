import { createHmac, timingSafeEqual } from 'crypto';

/** Mobile-money networks the platform accepts. */
export const MOBILE_MONEY_METHODS = [
  'airtel_money',
  'orange_money',
  'vodacom_mpesa',
] as const;
export type MobileMoneyMethod = (typeof MOBILE_MONEY_METHODS)[number];

export const isMobileMoney = (m: string): m is MobileMoneyMethod =>
  (MOBILE_MONEY_METHODS as readonly string[]).includes(m);

export interface MobileMoneyCharge {
  /** OUR payment reference — the aggregator echoes it back in the webhook. */
  reference: string;
  amountUsd: number;
  phone: string;
  network: MobileMoneyMethod;
}

/** A webhook, verified and normalised by the provider that received it. */
export interface MobileMoneyEvent {
  reference: string;
  outcome: 'succeeded' | 'failed';
  providerRef?: string;
  amountUsd?: number;
  reason?: string;
}

/**
 * Adapter for ONE mobile-money aggregator. The payment state machine
 * (PaymentsService) is provider-agnostic: to go live with a real aggregator
 * implement this interface (initiate the push request + verify/parse its
 * webhook) and register it in `createMobileMoneyProvider`.
 */
export interface MobileMoneyProvider {
  readonly name: string;
  /** Ask the network to prompt the subscriber to approve the charge. */
  initiate(charge: MobileMoneyCharge): Promise<{ providerRef: string }>;
  /** Verify authenticity of a webhook; throws if the signature is bad. */
  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): MobileMoneyEvent;
}

export const MOBILE_MONEY_PROVIDER = Symbol('MOBILE_MONEY_PROVIDER');

const header = (h: Record<string, string | string[] | undefined>, k: string) => {
  const v = h[k];
  return Array.isArray(v) ? v[0] : v;
};

/**
 * Development/test provider. It does NOT move money. `initiate` returns
 * immediately; the payment is then confirmed either by a signed webhook
 * (same code path as production) or, if `MM_SANDBOX_AUTOCONFIRM_MS` > 0,
 * by the service simulating the subscriber approving. A phone number ending
 * in `0000` simulates a declined charge. Refused outright in production.
 */
export class SandboxMobileMoneyProvider implements MobileMoneyProvider {
  readonly name = 'sandbox';
  constructor(private readonly secret: string) {}

  async initiate(charge: MobileMoneyCharge) {
    return { providerRef: `sbx_${charge.reference}` };
  }

  /** `x-sandbox-signature` = hex HMAC-SHA256(secret, rawBody). */
  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): MobileMoneyEvent {
    const given = header(headers, 'x-sandbox-signature') ?? '';
    const expected = createHmac('sha256', this.secret).update(rawBody).digest('hex');
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error('Invalid webhook signature.');
    }
    const body = JSON.parse(rawBody.toString('utf8'));
    return {
      reference: String(body.reference ?? ''),
      outcome: body.status === 'succeeded' ? 'succeeded' : 'failed',
      providerRef: body.providerRef,
      amountUsd: body.amountUsd != null ? Number(body.amountUsd) : undefined,
      reason: body.reason,
    };
  }
}

/** `MM_PROVIDER`: `sandbox` (dev default) | `none` (production default → refuse mobile money). */
export function createMobileMoneyProvider(): MobileMoneyProvider | null {
  const prod = process.env.NODE_ENV === 'production';
  const which = (process.env.MM_PROVIDER ?? (prod ? 'none' : 'sandbox')).toLowerCase();
  if (which === 'sandbox') {
    if (prod) {
      throw new Error('MM_PROVIDER=sandbox is not allowed in production.');
    }
    return new SandboxMobileMoneyProvider(process.env.MM_WEBHOOK_SECRET ?? 'dev-only-mm-webhook-secret');
  }
  return null; // no aggregator configured → mobile money is refused (fail closed)
}
