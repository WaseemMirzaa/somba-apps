import { Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { last4, readStripeConfig, scrubSecrets, type StripeEnvConfig, type StripeMode } from './stripe.config';

/**
 * Stripe — bank-card collections and refunds back to the card. Docs: https://docs.stripe.com/payments/payment-sheet.
 * Configure with STRIPE_SECRET_KEY (sk_/rk_), STRIPE_PUBLISHABLE_KEY (pk_) and STRIPE_WEBHOOK_SECRET (whsec_); card
 * payments are off unless all three are present, well-formed and in the same mode (see docs/PAYMENTS-STRIPE.md).
 *
 * The app never sees a card number (PaymentSheet sends it from the phone straight to Stripe) and every webhook is
 * confirmed by re-reading the object from Stripe before anything changes, so a forged or replayed event can do nothing.
 * The SDK is wrapped in the small [StripeClient] interface so the payment state machine is tested against a fake.
 */

/** Injection token for the shared client (null unless Stripe is fully configured). */
export const STRIPE_CLIENT = Symbol('STRIPE_CLIENT');

/** A Stripe request that could not be answered (network, 5xx, rate limit): the object may or may not exist on their side. */
export class StripeUnavailableError extends Error {}

/** Stripe said no (bad request, declined, wrong key permission): the message is safe to show to staff, and carries no key. */
export class StripeRejectedError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** A PaymentIntent as the payment state machine needs it (no card data, and the client secret only when asked for the sheet). */
export interface StripePaymentIntent {
  id: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'requires_action' | 'processing' | 'requires_capture' | 'canceled' | 'succeeded';
  /** Cents asked for. */
  amount: number;
  /** Cents actually received (0 until it succeeds). */
  amountReceived: number;
  /** Lower case ISO code: 'usd'. */
  currency: string;
  clientSecret: string | null;
  metadata: Record<string, string>;
  /** The last decline / error Stripe reported for an attempt, in its own words. */
  lastError: string | null;
  cancellationReason: string | null;
}

export interface StripeRefund {
  id: string;
  /** pending | requires_action | succeeded | failed | canceled */
  status: string;
  amount: number;
  currency: string;
  paymentIntentId: string | null;
  failureReason: string | null;
  metadata: Record<string, string>;
}

/** A webhook, authenticated by its signature. Only ids are kept: the objects are re-read from Stripe. */
export interface StripeWebhookEvent {
  id: string;
  type: string;
  /** The id of the event's object (pi_…, re_…, ch_…). */
  objectId: string | null;
  /** The PaymentIntent the object belongs to, when it has one. */
  paymentIntentId: string | null;
}

export interface CreatePaymentIntentInput {
  amountCents: number;
  currency: 'usd';
  metadata: Record<string, string>;
  description?: string;
  idempotencyKey: string;
}

export interface CreateRefundInput {
  paymentIntentId: string;
  amountCents: number;
  metadata: Record<string, string>;
  idempotencyKey: string;
}

export interface StripeClient {
  readonly mode: StripeMode;
  /** Public by design; handed to the app with each PaymentIntent so it can be rotated without an app release. */
  readonly publishableKey: string;
  createPaymentIntent(input: CreatePaymentIntentInput): Promise<StripePaymentIntent>;
  retrievePaymentIntent(id: string): Promise<StripePaymentIntent>;
  cancelPaymentIntent(id: string): Promise<StripePaymentIntent>;
  createRefund(input: CreateRefundInput): Promise<StripeRefund>;
  retrieveRefund(id: string): Promise<StripeRefund>;
  /** Verify the signature over the RAW body (5-minute tolerance). Throws, with no detail, when it does not verify. */
  constructWebhookEvent(rawBody: Buffer, signature: string | string[] | undefined): StripeWebhookEvent;
}

const toIntent = (pi: Stripe.PaymentIntent): StripePaymentIntent => ({
  id: pi.id,
  status: pi.status as StripePaymentIntent['status'],
  amount: pi.amount,
  amountReceived: pi.amount_received ?? 0,
  currency: String(pi.currency ?? '').toLowerCase(),
  clientSecret: pi.client_secret ?? null,
  metadata: { ...(pi.metadata ?? {}) },
  lastError: pi.last_payment_error?.message ?? null,
  cancellationReason: pi.cancellation_reason ?? null,
});

const idOf = (v: unknown): string | null => (typeof v === 'string' ? v : v && typeof (v as { id?: unknown }).id === 'string' ? (v as { id: string }).id : null);

const toRefund = (r: Stripe.Refund): StripeRefund => ({
  id: r.id,
  status: String(r.status ?? 'pending'),
  amount: r.amount,
  currency: String(r.currency ?? '').toLowerCase(),
  paymentIntentId: idOf(r.payment_intent),
  failureReason: r.failure_reason ?? null,
  metadata: { ...(r.metadata ?? {}) },
});

export class StripeSdkClient implements StripeClient {
  readonly mode: StripeMode;
  readonly publishableKey: string;
  private readonly sdk: Stripe;
  private readonly webhookSecret: string;
  private readonly secrets: string[];

  constructor(cfg: StripeEnvConfig, sdk?: Stripe) {
    this.mode = cfg.mode;
    this.publishableKey = cfg.publishableKey;
    this.webhookSecret = cfg.webhookSecret;
    this.secrets = [cfg.secretKey, cfg.webhookSecret];
    this.sdk = sdk ?? new Stripe(cfg.secretKey, { timeout: 15_000, maxNetworkRetries: 1, appInfo: { name: 'KOMORIKO API' } });
  }

  /**
   * Turn an SDK error into one of ours. Only the (scrubbed) message survives: never the SDK error itself, whose
   * request/response details could carry more than we want in a log.
   */
  private fail(e: unknown): never {
    const err = e as { type?: string; message?: string; code?: string; statusCode?: number };
    const message = scrubSecrets(err?.message ?? 'Stripe request failed.', this.secrets);
    switch (err?.type) {
      case 'StripeConnectionError':
      case 'StripeAPIError':
      case 'StripeRateLimitError':
        throw new StripeUnavailableError(message);
      case 'StripeAuthenticationError':
        throw new StripeRejectedError('Stripe rejected our API key.', 'authentication');
      case 'StripePermissionError':
        throw new StripeRejectedError('The Stripe key does not have the permission this needs.', 'permission');
      default:
        if ((err?.statusCode ?? 0) >= 500) throw new StripeUnavailableError(message);
        throw new StripeRejectedError(message, err?.code);
    }
  }

  async createPaymentIntent(input: CreatePaymentIntentInput): Promise<StripePaymentIntent> {
    try {
      const pi = await this.sdk.paymentIntents.create(
        {
          amount: input.amountCents,
          currency: input.currency,
          payment_method_types: ['card'],
          metadata: input.metadata,
          ...(input.description ? { description: input.description } : {}),
        },
        { idempotencyKey: input.idempotencyKey },
      );
      return toIntent(pi);
    } catch (e) {
      return this.fail(e);
    }
  }

  async retrievePaymentIntent(id: string): Promise<StripePaymentIntent> {
    try {
      return toIntent(await this.sdk.paymentIntents.retrieve(id));
    } catch (e) {
      return this.fail(e);
    }
  }

  async cancelPaymentIntent(id: string): Promise<StripePaymentIntent> {
    try {
      return toIntent(await this.sdk.paymentIntents.cancel(id, { cancellation_reason: 'abandoned' }));
    } catch (e) {
      return this.fail(e);
    }
  }

  async createRefund(input: CreateRefundInput): Promise<StripeRefund> {
    try {
      const r = await this.sdk.refunds.create(
        { payment_intent: input.paymentIntentId, amount: input.amountCents, metadata: input.metadata },
        { idempotencyKey: input.idempotencyKey },
      );
      return toRefund(r);
    } catch (e) {
      return this.fail(e);
    }
  }

  async retrieveRefund(id: string): Promise<StripeRefund> {
    try {
      return toRefund(await this.sdk.refunds.retrieve(id));
    } catch (e) {
      return this.fail(e);
    }
  }

  constructWebhookEvent(rawBody: Buffer, signature: string | string[] | undefined): StripeWebhookEvent {
    const header = Array.isArray(signature) ? signature[0] : signature;
    if (!header) throw new Error('Missing Stripe-Signature header.');
    let event: Stripe.Event;
    try {
      event = this.sdk.webhooks.constructEvent(rawBody, header, this.webhookSecret);
    } catch {
      // The SDK error carries the header and payload: say nothing but the fact.
      throw new Error('Stripe signature does not verify.');
    }
    if (event.livemode !== (this.mode === 'live')) throw new Error(`Event is from the other Stripe mode (this server is in ${this.mode} mode).`);
    const object = (event.data?.object ?? {}) as unknown as { id?: unknown; object?: unknown; payment_intent?: unknown };
    const objectId = typeof object.id === 'string' ? object.id : null;
    return {
      id: event.id,
      type: event.type,
      objectId,
      paymentIntentId: object.object === 'payment_intent' ? objectId : idOf(object.payment_intent),
    };
  }
}

/**
 * The Stripe client from the environment, or null (card payments off) with a clear warning unless all three values are
 * present, well-formed and in the same mode. The boot log shows the mode and the last 4 characters of the secret key,
 * nothing more.
 */
export function createStripeClient(env: NodeJS.ProcessEnv = process.env, logger: Pick<Logger, 'log' | 'warn'> = new Logger('Stripe')): StripeClient | null {
  const read = readStripeConfig(env);
  if (!read.ok) {
    logger.warn(`Card payments are OFF: ${read.problems.join('; ')}. Set the three STRIPE_* values together (docs/PAYMENTS-STRIPE.md).`);
    return null;
  }
  const { config } = read;
  logger.log(`Card payments are ON (Stripe ${config.mode} mode, secret key …${last4(config.secretKey)}).`);
  if (config.mode === 'test' && env.NODE_ENV === 'production') {
    logger.warn('Stripe is in TEST mode on a production server: cards are accepted but no real money moves.');
  }
  return new StripeSdkClient(config);
}
