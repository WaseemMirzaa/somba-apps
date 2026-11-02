import Stripe from 'stripe';
import {
  StripeRejectedError,
  StripeSdkClient,
  StripeUnavailableError,
  type CreatePaymentIntentInput,
  type CreateRefundInput,
  type StripeClient,
  type StripePaymentIntent,
  type StripeRefund,
  type StripeWebhookEvent,
} from '../payments/stripe.provider';

/** Test support (jest only, not built): obviously fake keys that have the right shape, and a Stripe that lives in memory. */
export const SK = 'sk_' + 'test_FAKEsecretKEY0123456789abcd';
export const RK = 'rk_' + 'test_FAKErestrictedKEY0123456789wxyz';
export const PK = 'pk_' + 'test_FAKEpublishableKEY0123456789efgh';
export const WHSEC = 'whsec_FAKEwebhookSECRET0123456789ijkl';
export const GOOD_ENV = { STRIPE_SECRET_KEY: SK, STRIPE_PUBLISHABLE_KEY: PK, STRIPE_WEBHOOK_SECRET: WHSEC };
export const STRIPE_CFG = { secretKey: SK, publishableKey: PK, webhookSecret: WHSEC, mode: 'test' as const };

/** A StripeClient with no network: PaymentIntents and Refunds in maps, calls recorded, failures on demand. Webhook signatures are REAL. */
export class FakeStripe implements StripeClient {
  readonly mode = 'test' as const;
  readonly publishableKey = PK;
  readonly intents = new Map<string, StripePaymentIntent>();
  readonly refunds = new Map<string, StripeRefund>();
  readonly created: CreatePaymentIntentInput[] = [];
  readonly cancelled: string[] = [];
  readonly refundCalls: CreateRefundInput[] = [];
  /** Idempotency: the same key answers with the same object. */
  private readonly byKey = new Map<string, string>();
  private seq = { pi: 0, re: 0, evt: 0 };
  /** Set to make the next call of that kind fail. */
  failNext: { create?: Error; refund?: Error; retrieve?: Error; cancel?: Error } = {};
  private readonly signer = new StripeSdkClient(STRIPE_CFG, new Stripe(SK));
  private readonly stripe = new Stripe(SK);

  private take<K extends keyof FakeStripe['failNext']>(kind: K): void {
    const err = this.failNext[kind];
    if (err) {
      delete this.failNext[kind];
      throw err;
    }
  }

  async createPaymentIntent(input: CreatePaymentIntentInput): Promise<StripePaymentIntent> {
    this.take('create');
    this.created.push(input);
    const known = this.byKey.get(input.idempotencyKey);
    if (known) return { ...this.intents.get(known)! };
    const id = `pi_${++this.seq.pi}`;
    this.byKey.set(input.idempotencyKey, id);
    const pi: StripePaymentIntent = {
      id,
      status: 'requires_payment_method',
      amount: input.amountCents,
      amountReceived: 0,
      currency: input.currency,
      clientSecret: `${id}_secret_FAKE${this.seq.pi}`,
      metadata: { ...input.metadata },
      lastError: null,
      cancellationReason: null,
    };
    this.intents.set(id, pi);
    return { ...pi };
  }

  async retrievePaymentIntent(id: string): Promise<StripePaymentIntent> {
    this.take('retrieve');
    const pi = this.intents.get(id);
    if (!pi) throw new StripeRejectedError(`No such payment_intent: '${id}'`, 'resource_missing');
    return { ...pi };
  }

  async cancelPaymentIntent(id: string): Promise<StripePaymentIntent> {
    this.take('cancel');
    const pi = this.intents.get(id);
    if (!pi) throw new StripeRejectedError(`No such payment_intent: '${id}'`, 'resource_missing');
    if (pi.status === 'succeeded') throw new StripeRejectedError('You cannot cancel this PaymentIntent because it has a status of succeeded.', 'payment_intent_unexpected_state');
    this.cancelled.push(id);
    pi.status = 'canceled';
    pi.cancellationReason = 'abandoned';
    return { ...pi };
  }

  async createRefund(input: CreateRefundInput): Promise<StripeRefund> {
    this.refundCalls.push(input);
    this.take('refund');
    const known = this.byKey.get(input.idempotencyKey);
    if (known) return { ...this.refunds.get(known)! };
    const id = `re_${++this.seq.re}`;
    this.byKey.set(input.idempotencyKey, id);
    const refund: StripeRefund = { id, status: 'pending', amount: input.amountCents, currency: 'usd', paymentIntentId: input.paymentIntentId, failureReason: null, metadata: { ...input.metadata } };
    this.refunds.set(id, refund);
    return { ...refund };
  }

  async retrieveRefund(id: string): Promise<StripeRefund> {
    const refund = this.refunds.get(id);
    if (!refund) throw new StripeRejectedError(`No such refund: '${id}'`, 'resource_missing');
    return { ...refund };
  }

  constructWebhookEvent(rawBody: Buffer, signature: string | string[] | undefined): StripeWebhookEvent {
    return this.signer.constructWebhookEvent(rawBody, signature);
  }

  // ── the other side: what the customer and Stripe do ─────────────────────────

  /** The customer completes the card sheet. `received`: cents Stripe took (default: what was asked for). */
  succeed(id: string, received?: number, currency?: string): void {
    const pi = this.intents.get(id)!;
    pi.status = 'succeeded';
    pi.amountReceived = received ?? pi.amount;
    if (currency) pi.currency = currency;
  }

  /** A card was declined; the PaymentIntent is open for another attempt. */
  decline(id: string, message = 'Your card was declined.'): void {
    this.intents.get(id)!.lastError = message;
  }

  settleRefund(id: string, status: 'succeeded' | 'failed' | 'canceled', failureReason: string | null = null): void {
    const refund = this.refunds.get(id)!;
    refund.status = status;
    refund.failureReason = failureReason;
  }

  /** A signed webhook request body + header, as Stripe would send it. */
  signedEvent(type: string, object: Record<string, unknown>): { body: Buffer; header: string } {
    const payload = JSON.stringify({ id: `evt_${++this.seq.evt}`, object: 'event', type, livemode: false, data: { object } });
    return { body: Buffer.from(payload), header: this.stripe.webhooks.generateTestHeaderString({ payload, secret: WHSEC }) };
  }

  /** The signed event for a PaymentIntent (`payment_intent.succeeded`…). */
  intentEvent(type: string, id: string) {
    return this.signedEvent(type, { id, object: 'payment_intent' });
  }

  refundEvent(type: string, id: string) {
    return this.signedEvent(type, { id, object: 'refund', payment_intent: this.refunds.get(id)?.paymentIntentId ?? null });
  }
}

export { StripeUnavailableError };
