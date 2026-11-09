import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { EntityManager, In, LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import { AuditLog, DeliveryTask, Order, Payment, PaymentRefund } from '../database/entities';
import type { RefundKind } from '../database/entities';
import type { PaymentPurpose, PaymentStatus } from '../database/entities';
import {
  ADMIN_ROLES,
  NotificationsService,
} from '../notifications/notifications.service';
import { pushOrderToOps } from '../logistics/hub-scope';
import { DESK_ROLES } from '../logistics/tiers';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { WalletService } from '../wallet/wallet.service';
import { SettingsService } from '../content/settings.service';
import { ProductsService } from '../products/products.service';
import { DEFAULT_LIMIT, pageOf } from '../common/paging';
import { paymentMethodLabel } from '../common/payment-method';
import {
  InitiationUncertainError,
  MOBILE_MONEY_METHODS,
  MOBILE_MONEY_PROVIDER,
  isMobileMoney,
  type MobileMoneyEvent,
  type MobileMoneyProvider,
  type WebhookRequest,
} from './mobile-money.provider';
import { PAWAPAY_CLIENT, PawapayClient, PawapayRejectedError, PawapayUnavailableError } from './pawapay.provider';
import { isDuplicateKey, TOPUP_DEDUP_MS, topUpClaim } from './topup-request';
import {
  STRIPE_CLIENT,
  StripeRejectedError,
  StripeUnavailableError,
  type StripeClient,
  type StripePaymentIntent,
  type StripeRefund,
  type StripeWebhookEvent,
} from './stripe.provider';
import { NOTHING_LEFT_TO_REFUND, recordParkedPayment, recordRefund, refundableUsd, revertRefund } from './refund-ledger';

/** Why a refund is made, when it is not the plain order refund of finance (`orders:refund`). */
export interface RefundSource {
  kind?: Extract<RefundKind, 'admin' | 'dispute'>;
  disputeId?: string;
  disputeReference?: string;
}

/** The payment after a refund, with the ledger row this refund wrote (its `amountUsd` is what THIS refund paid back). */
export type RefundResult = Payment & { refund: PaymentRefund };

/** Where "back to the original method" goes for a payment: the paying phone, the card, or nowhere (then: the wallet). */
export type RefundOriginal = 'phone' | 'card';

/** A payment as clients see it: the phone masked, what can still be refunded on it, and where an original-method refund would go. */
export type PaymentView = Payment & { refundableUsd: number; refundToOriginal: RefundOriginal | null };

/** What the customer app needs to open Stripe's PaymentSheet for one pending card payment. */
export interface CardSheet {
  reference: string;
  clientSecret: string;
  publishableKey: string;
  amountUsd: number;
  currency: 'usd';
  merchantName: string;
}

/** Stripe definitively refused a card refund (not "no answer"): nothing was refunded. */
export class CardRefundRefusedError extends Error {}

export const CARD_MERCHANT_NAME = 'Somba & Teka';
/** Prefix of Stripe refund ids. Until we hold one, a card refund is known by the idempotency key we generated. */
const STRIPE_REFUND_ID = /^re_/;
/** Stripe forgets an idempotency key after 24 hours: an unanswered refund is only retried with its key well inside that. */
const REFUND_REPLAY_WINDOW_MS = 20 * 3_600_000;

/** The cash record of a COD delivery, as the payment's audit line reports it. */
export interface CodReceipt {
  amountUsd: number;
  byId: string;
  byName: string;
  byRole: string;
  at: Date;
  taskId: string;
  /** `rider`: the rider confirmed the cash at the door; `admin_close`: an admin closed the delivery by hand. */
  source: 'rider' | 'admin_close';
}

/** Called when pawaPay reports on a seller payout (set by PayoutsService, which owns payouts). */
export type PayoutCallbackHandler = (payoutId: string) => Promise<void>;

/** Called once when an ORDER payment reaches a final state (set by OrdersService). */
export type OrderPaymentSettledHandler = (
  payment: Payment,
  outcome: 'succeeded' | 'failed',
) => Promise<void>;

/** Called once when a seller-plan payment succeeds (set by SellersService), including a wallet purchase. */
export type PlanPaymentSettledHandler = (payment: Payment) => Promise<void>;

/** Only these admin roles see payment records (live pushes included). */
const FINANCE_ROLES = ['admin', 'admin_finance'];

const mask = (phone: string | null) =>
  phone ? `${phone.slice(0, 4)}…${phone.slice(-2)}` : null;

@Injectable()
export class PaymentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentsService.name);
  private orderSettled: OrderPaymentSettledHandler | null = null;
  private planSettled: PlanPaymentSettledHandler | null = null;
  private payoutCallback: PayoutCallbackHandler | null = null;
  private readonly manualInFlight = new Set<string>();
  private sweeper: NodeJS.Timeout | null = null;
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly wallet: WalletService,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
    private readonly settings: SettingsService,
    @Inject(MOBILE_MONEY_PROVIDER)
    private readonly mobileMoney: MobileMoneyProvider | null,
    @InjectRepository(DeliveryTask) private readonly deliveries: Repository<DeliveryTask>,
    private readonly products: ProductsService,
    @Optional() @Inject(PAWAPAY_CLIENT) private readonly pawapay: PawapayClient | null = null,
    @Optional() @Inject(STRIPE_CLIENT) private readonly stripe: StripeClient | null = null,
  ) {}

  onModuleInit() {
    this.logger.log(
      this.mobileMoney
        ? `Mobile money provider: ${this.mobileMoney.name}`
        : 'Mobile money provider: none (mobile-money payments are refused)',
    );
    this.logger.log(this.stripe ? `Card payments: Stripe (${this.stripe.mode} mode)` : 'Card payments: none (Stripe is not configured)');
    // Abandoned approvals must not hold stock forever; with an aggregator, missed callbacks are caught up first.
    this.sweeper = setInterval(
      () =>
        void this.reconcilePending()
          .then(() => this.expireStale())
          .catch(() => undefined),
      60_000,
    );
    this.sweeper.unref();
  }

  onModuleDestroy() {
    if (this.sweeper) clearInterval(this.sweeper);
    this.timers.forEach(clearTimeout);
  }

  registerOrderSettledHandler(fn: OrderPaymentSettledHandler) {
    this.orderSettled = fn;
  }

  registerPlanSettledHandler(fn: PlanPaymentSettledHandler) {
    this.planSettled = fn;
  }

  registerPayoutCallbackHandler(fn: PayoutCallbackHandler) {
    this.payoutCallback = fn;
  }

  /** Which mobile-money provider is live ('pawapay', 'sandbox', 'manual'), or null. */
  get providerName(): string | null {
    return this.mobileMoney?.name ?? null;
  }

  /** Which payment methods may be used right now (policy + configuration). */
  async assertMethodAllowed(method: string): Promise<void> {
    if (method === 'wallet') return;
    if (method === 'cod') {
      if ((await this.settings.get('codEnabled')) !== 'true') {
        throw new BadRequestException('Cash on delivery is not available.');
      }
      return;
    }
    if (isMobileMoney(method)) {
      if (!this.mobileMoney) {
        throw new BadRequestException('Mobile money is not available yet. Please use another method.');
      }
      return;
    }
    if (method === 'stripe_card') {
      if (this.stripe) return;
      // Stripe is not configured: allow the mock only outside production
      // so production can never "sell" against a card that was never charged.
      if (process.env.NODE_ENV === 'production') {
        throw new BadRequestException('Card payments are not available.');
      }
      return;
    }
    throw new BadRequestException('Unknown payment method.');
  }

  static normalisePhone(raw: unknown): string {
    const phone = String(raw ?? '').replace(/[\s().-]/g, '');
    if (!/^\+?[0-9]{9,15}$/.test(phone)) {
      throw new BadRequestException('Enter a valid mobile-money phone number, e.g. +243 81 234 5678.');
    }
    return phone;
  }

  /**
   * Charge for an order according to its payment method:
   *  - wallet        → debit the balance now (caller pre-checks funds)
   *  - mobile money  → `pending` until the subscriber approves (webhook settles)
   *  - card          → a Stripe PaymentIntent, `pending` until the customer completes the card sheet (the webhook
   *                    settles it); without Stripe, a mock authorize (non-production only)
   *  - cod           → pending; collected on delivery
   */
  async processForOrder(order: Order, phone?: string): Promise<Payment> {
    await this.assertMethodAllowed(order.paymentMethod);

    let status: PaymentStatus = 'succeeded';
    let failureReason: string | null = null;
    let normalisedPhone: string | null = null;
    if (isMobileMoney(order.paymentMethod)) {
      normalisedPhone = PaymentsService.normalisePhone(phone);
      status = 'pending';
    }
    const realCard = order.paymentMethod === 'stripe_card' && !!this.stripe;
    if (realCard) status = 'pending';

    try {
      if (order.paymentMethod === 'wallet') {
        await this.wallet.debit(order.customerId, order.totalUsd, `Order ${order.reference}`);
      } else if (order.paymentMethod === 'cod') {
        status = 'pending';
      }
    } catch (err) {
      status = 'failed';
      failureReason = (err as Error).message;
    }

    let payment = await this.payments.save(
      this.payments.create({
        reference: PaymentsService.newReference(),
        orderId: order.id,
        orderReference: order.reference,
        purpose: 'order',
        userId: order.customerId,
        method: order.paymentMethod,
        amountUsd: order.totalUsd,
        status,
        failureReason,
        phone: normalisedPhone,
      }),
    );

    if (status === 'pending' && normalisedPhone) {
      payment = await this.startMobileMoney(payment);
    } else if (status === 'pending' && realCard) {
      payment = await this.startCard(payment, order);
    }

    this.emitter.toUser(order.customerId, 'payment:created', this.view(payment));
    this.emitter.toRoles(FINANCE_ROLES, 'payment:created', this.view(payment));
    await this.notifications.toRole('admin_finance', {
      title: 'Payment',
      body: `${payment.reference} · ${paymentMethodLabel(order.paymentMethod)} · $${order.totalUsd.toFixed(2)} · ${payment.status}`,
      type: 'payment',
      entityId: order.id,
    });

    if (payment.status === 'failed') {
      throw new BadRequestException(payment.failureReason ?? 'Payment failed.');
    }
    return payment;
  }

  /**
   * Start a wallet top-up through mobile money. Credits the wallet only when confirmed. One tap is one top-up: a request
   * with the same `clientRequestId` (or, from an older app, the same method, amount and phone while the first is still
   * pending) gets the FIRST payment back instead of a second approval prompt, so a double tap or a retry cannot charge twice.
   */
  async startTopUp(userId: string, amountUsd: number, method: string, phone: unknown, clientRequestId?: unknown): Promise<Payment> {
    if (!isMobileMoney(method)) {
      throw new BadRequestException(`Top-up method must be one of: ${MOBILE_MONEY_METHODS.join(', ')}.`);
    }
    await this.assertMethodAllowed(method);
    const subscriber = PaymentsService.normalisePhone(phone);
    const claim = topUpClaim(userId, { amountUsd, method, phone: subscriber, clientRequestId }, Date.now());
    const same = { amountUsd, method, phone: subscriber };
    const earlier = await this.earlierTopUp(userId, claim.key, claim.explicit, same);
    if (earlier) return earlier;
    // Don't let one account fire unlimited approval prompts at arbitrary numbers.
    const open = await this.payments.count({ where: { userId, purpose: 'topup', status: 'pending' } });
    if (open >= 3) {
      throw new BadRequestException('You already have pending top-ups. Approve or wait for them to expire first.');
    }
    const insert = (requestKey: string | null) =>
      this.payments.save(
        this.payments.create({
          reference: PaymentsService.newReference(),
          orderId: null,
          orderReference: null,
          purpose: 'topup',
          userId,
          method,
          amountUsd,
          status: 'pending',
          phone: subscriber,
          requestKey,
        }),
      );
    let payment: Payment;
    try {
      payment = await insert(claim.key);
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
      // Another request with the same key got in between our look and our insert: that one is the top-up.
      const winner = await this.earlierTopUp(userId, claim.key, claim.explicit, same);
      if (winner) return winner;
      // A fingerprint of an earlier top-up that is over (failed, expired): this is a deliberate retry, not a repeat.
      if (claim.explicit) throw e;
      payment = await insert(null);
    }
    const started = await this.startMobileMoney(payment);
    this.emitter.toUser(userId, 'payment:created', this.view(started));
    if (started.status === 'failed') {
      throw new BadRequestException(started.failureReason ?? 'Payment failed.');
    }
    return started;
  }

  /**
   * The top-up this request repeats, if any. With the app's own key: that payment, whatever became of it (a failed one
   * answers with its reason, as the first request did; a key reused for a different top-up is refused). Without a key: a
   * still-pending identical top-up from the last minute. A fingerprint claim never blocks a deliberate retry after a failure.
   */
  private async earlierTopUp(
    userId: string,
    key: string,
    explicit: boolean,
    want: { amountUsd: number; method: string; phone: string },
  ): Promise<Payment | null> {
    const byKey = await this.payments.findOne({ where: { userId, purpose: 'topup', requestKey: key } });
    if (byKey) {
      if (explicit) {
        if (byKey.method !== want.method || Math.abs(byKey.amountUsd - want.amountUsd) > 0.005) {
          throw new BadRequestException('This top-up reference was already used for a different top-up.');
        }
        if (byKey.status === 'failed') throw new BadRequestException(byKey.failureReason ?? 'Payment failed.');
        return byKey;
      }
      if (byKey.status === 'pending') return byKey;
    }
    if (explicit) return null;
    const recent = await this.payments.find({
      where: { userId, purpose: 'topup', status: 'pending', createdAt: MoreThanOrEqual(new Date(Date.now() - TOPUP_DEDUP_MS)) },
      order: { createdAt: 'DESC' },
      take: 5,
    });
    return recent.find((p) => p.method === want.method && Math.abs(p.amountUsd - want.amountUsd) <= 0.005 && p.phone === want.phone) ?? null;
  }

  /**
   * Buy a seller plan. `wallet` is charged at once (and the plan activates);
   * mobile money stays `pending` until the network / finance confirms, and the
   * plan activates through the normal settle path (payment:updated -> succeeded).
   */
  async startPlanPayment(
    userId: string,
    plan: { id: string; priceUsd: number },
    method: string,
    phone: unknown,
  ): Promise<Payment> {
    const amount = Number(plan.priceUsd.toFixed(2));
    if (method === 'wallet') {
      const payment = await this.payments.manager.transaction(async (m) => {
        await this.wallet.apply(userId, 'debit', amount, `Seller plan ${plan.id}`, m);
        return m.save(
          this.payments.create({
            reference: PaymentsService.newReference(),
            orderId: null,
            orderReference: null,
            purpose: 'plan',
            subject: plan.id,
            userId,
            method: 'wallet',
            amountUsd: amount,
            status: 'succeeded',
          }),
        );
      });
      this.emitter.toUser(userId, 'payment:created', this.view(payment));
      this.emitter.toRoles(FINANCE_ROLES, 'payment:created', this.view(payment));
      if (this.planSettled) await this.planSettled(payment);
      return this.view(payment);
    }
    if (!isMobileMoney(method)) {
      throw new BadRequestException(`Pay with your wallet or mobile money (${MOBILE_MONEY_METHODS.join(', ')}).`);
    }
    await this.assertMethodAllowed(method);
    const open = await this.payments.count({ where: { userId, purpose: 'plan', status: 'pending' } });
    if (open >= 2) {
      throw new BadRequestException('You already have a pending plan payment. Approve it or wait for it to expire first.');
    }
    const created = await this.payments.save(
      this.payments.create({
        reference: PaymentsService.newReference(),
        orderId: null,
        orderReference: null,
        purpose: 'plan',
        subject: plan.id,
        userId,
        method,
        amountUsd: amount,
        status: 'pending',
        phone: PaymentsService.normalisePhone(phone),
      }),
    );
    const started = await this.startMobileMoney(created);
    this.emitter.toUser(userId, 'payment:created', this.view(started));
    this.emitter.toRoles(FINANCE_ROLES, 'payment:created', this.view(started));
    if (started.status === 'failed') {
      throw new BadRequestException(started.failureReason ?? 'Payment failed.');
    }
    return this.view(started);
  }

  /** Ask the network to prompt the subscriber; a provider error fails the payment. */
  private async startMobileMoney(payment: Payment): Promise<Payment> {
    try {
      const { providerRef } = await this.mobileMoney!.initiate({
        reference: payment.reference,
        amountUsd: payment.amountUsd,
        phone: payment.phone!,
        network: payment.method as (typeof MOBILE_MONEY_METHODS)[number],
      });
      payment.providerRef = providerRef;
      payment = await this.payments.save(payment);
    } catch (err) {
      if (err instanceof InitiationUncertainError) {
        // No answer from the aggregator: the charge may exist. Stay pending; the status check settles it.
        this.logger.warn(`Mobile money initiate unconfirmed for ${payment.reference}: ${err.message}`);
        payment.providerRef = err.providerRef;
        return this.payments.save(payment);
      }
      this.logger.error(`Mobile money initiate failed for ${payment.reference}: ${(err as Error).message}`);
      payment.status = 'failed';
      payment.failureReason =
        err instanceof PawapayRejectedError
          ? `The mobile-money network refused the payment: ${err.message}`
          : 'Could not reach the mobile-money network. Please try again.';
      return this.payments.save(payment);
    }
    this.maybeAutoConfirmSandbox(payment);
    return payment;
  }

  /**
   * Create the Stripe PaymentIntent for a card payment. The amount is OURS (the order total in cents, USD); the client
   * secret is never stored: the app asks for it with `payments:card-sheet`. A refusal fails the payment (the customer
   * can try again); an unanswered request fails it too, because nobody holds a client secret for an intent we never saw.
   */
  private async startCard(payment: Payment, order: Pick<Order, 'reference'>): Promise<Payment> {
    try {
      const pi = await this.stripe!.createPaymentIntent({
        amountCents: Math.round(payment.amountUsd * 100),
        currency: 'usd',
        description: `Somba & Teka order ${order.reference}`,
        metadata: {
          reference: payment.reference,
          orderReference: payment.orderReference ?? '',
          purpose: payment.purpose,
          userId: payment.userId,
        },
        idempotencyKey: `pi-${payment.reference}`,
      });
      payment.providerRef = pi.id;
      return await this.payments.save(payment);
    } catch (err) {
      this.logger.error(`Card payment could not be started for ${payment.reference}: ${(err as Error).message}`);
      payment.status = 'failed';
      payment.failureReason =
        err instanceof StripeUnavailableError
          ? 'Could not reach the card processor. Please try again.'
          : 'Could not start the card payment. Please try again.';
      return this.payments.save(payment);
    }
  }

  /** Dev convenience: simulate the subscriber approving, through the SAME settle path. */
  private maybeAutoConfirmSandbox(payment: Payment) {
    if (this.mobileMoney?.name !== 'sandbox') return;
    const ms = Number(process.env.MM_SANDBOX_AUTOCONFIRM_MS ?? 1500);
    if (!(ms > 0)) return;
    const declined = (payment.phone ?? '').endsWith('0000');
    const t = setTimeout(() => {
      this.timers.delete(t);
      void this.settle({
        reference: payment.reference,
        outcome: declined ? 'failed' : 'succeeded',
        providerRef: payment.providerRef ?? undefined,
        reason: declined ? 'Declined by subscriber.' : undefined,
      }).catch((e) => this.logger.error(`sandbox settle failed: ${(e as Error).message}`));
    }, ms);
    t.unref();
    this.timers.add(t);
  }

  /**
   * Finance confirms (or declines) a pending mobile-money payment by hand —
   * the fallback when no aggregator is connected (`MM_PROVIDER=manual`) and a
   * convenient test hook with the sandbox. Uses the same atomic settle path.
   */
  async decideManually(reference: string, outcome: 'succeeded' | 'failed', reason?: string): Promise<Payment> {
    if (!['manual', 'sandbox'].includes(this.mobileMoney?.name ?? '')) {
      throw new BadRequestException('Manual confirmation is only available with MM_PROVIDER=manual.');
    }
    // Two finance users clicking at once: only one request is handled, the other is told so.
    if (this.manualInFlight.has(reference)) throw new BadRequestException('This payment is being processed right now.');
    this.manualInFlight.add(reference);
    try {
      const payment = await this.payments.findOne({ where: { reference } });
      if (!payment) throw new NotFoundException('Payment not found.');
      if (payment.status !== 'pending') throw new BadRequestException(`This payment is already ${payment.status}.`);
      // A real card is confirmed by Stripe alone: a hand-made "paid" here would sell goods nobody paid for.
      if (payment.method === 'stripe_card' && payment.providerRef) throw new BadRequestException('Card payments are confirmed by Stripe, not by hand.');
      const done = await this.settle({
        reference,
        outcome,
        providerRef: payment.providerRef ?? undefined,
        reason: outcome === 'failed' ? (reason?.trim() || 'Declined by finance.') : undefined,
      });
      return this.view(done ?? payment) as Payment;
    } finally {
      this.manualInFlight.delete(reference);
    }
  }

  /** Entry point for the aggregator webhook (signature already verified by the provider). */
  async verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
    req?: WebhookRequest,
  ): Promise<MobileMoneyEvent> {
    if (!this.mobileMoney) throw new Error('Mobile money is not configured.');
    return this.mobileMoney.parseWebhook(rawBody, headers, req);
  }

  /**
   * pawaPay callback (deposits, refunds and payouts share one URL). The signature is checked when signatures are on,
   * then the operation's real status is read from pawaPay before anything changes. Returns what it was about.
   */
  async handlePawapayCallback(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
    req: WebhookRequest,
  ): Promise<{ kind: string; id: string }> {
    if (!this.pawapay) throw new Error('pawaPay is not configured.');
    if (this.pawapay.verifySignatures) await this.pawapay.verifyCallback(rawBody, headers, req);
    const target = PawapayClient.callbackTarget(rawBody);
    if (target.kind === 'deposits') {
      const payment = await this.payments.findOne({ where: { providerRef: target.id } });
      if (payment) await this.reconcileOne(payment);
    } else if (target.kind === 'refunds') {
      await this.reconcileRefund(target.id);
    } else if (this.payoutCallback) {
      await this.payoutCallback(target.id);
    }
    return target;
  }

  // ── Stripe cards ──────────────────────────────────────────────────────────

  /**
   * What the app needs to open the card sheet for the caller's OWN pending card payment (found by `reference` or by
   * `orderId`). The PaymentIntent is re-read from Stripe for its client secret, which is never stored or logged. A
   * payment that Stripe already finished is settled on the spot and reported as no longer waiting.
   */
  async cardSheet(userId: string, body: { orderId?: unknown; reference?: unknown }): Promise<CardSheet> {
    if (!this.stripe) throw new BadRequestException('Card payments are not available.');
    const reference = typeof body?.reference === 'string' ? body.reference.trim() : '';
    const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
    const payment = reference
      ? await this.payments.findOne({ where: { reference } })
      : orderId
        ? await this.payments.findOne({ where: { orderId, method: 'stripe_card' }, order: { createdAt: 'DESC' } })
        : null;
    // Same answer for "missing" and "not yours".
    if (!payment || payment.userId !== userId || (orderId && payment.orderId !== orderId)) throw new NotFoundException('Payment not found.');
    const waiting = new BadRequestException('This payment is not waiting for a card.');
    if (payment.method !== 'stripe_card' || payment.status !== 'pending' || !payment.providerRef) throw waiting;
    let pi: StripePaymentIntent;
    try {
      pi = await this.stripe.retrievePaymentIntent(payment.providerRef);
    } catch (e) {
      this.logger.warn(`Card sheet for ${payment.reference}: ${(e as Error).message}`);
      throw new BadRequestException('Could not reach the card processor. Please try again.');
    }
    if (pi.metadata.reference !== payment.reference) throw waiting;
    if (pi.status === 'succeeded' || pi.status === 'canceled') {
      await this.applyCardIntent(payment, pi);
      throw waiting;
    }
    if (!pi.clientSecret) throw waiting;
    return {
      reference: payment.reference,
      clientSecret: pi.clientSecret,
      publishableKey: this.stripe.publishableKey,
      amountUsd: payment.amountUsd,
      currency: 'usd',
      merchantName: CARD_MERCHANT_NAME,
    };
  }

  /** Verify a Stripe webhook by its signature over the raw body. Throws when it does not verify. */
  verifyStripeWebhook(rawBody: Buffer, signature: string | string[] | undefined): StripeWebhookEvent {
    if (!this.stripe) throw new Error('Stripe is not configured.');
    return this.stripe.constructWebhookEvent(rawBody, signature);
  }

  /**
   * Act on a verified Stripe event. The event is only a hint: the PaymentIntent or Refund is read from Stripe again, and
   * only that decides. Errors (Stripe unreachable, database) propagate, so Stripe retries the webhook; an event about
   * something that is not ours is ignored.
   */
  async handleStripeEvent(event: StripeWebhookEvent): Promise<void> {
    if (!this.stripe) return;
    switch (event.type) {
      case 'payment_intent.succeeded':
      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled': {
        if (!event.objectId) return;
        const payment = await this.payments.findOne({ where: { providerRef: event.objectId } });
        if (!payment) {
          this.logger.warn(`Stripe ${event.type} for a PaymentIntent that is not ours (${event.objectId})`);
          return;
        }
        const pi = await this.readForEvent(() => this.stripe!.retrievePaymentIntent(event.objectId!));
        if (pi) await this.applyCardIntent(payment, pi);
        return;
      }
      case 'refund.updated':
      case 'refund.failed': {
        if (!event.objectId) return;
        const refund = await this.readForEvent(() => this.stripe!.retrieveRefund(event.objectId!));
        if (!refund) return;
        const payment =
          (await this.payments.findOne({ where: { refundRef: refund.id } })) ??
          (refund.metadata.refundRef ? await this.payments.findOne({ where: { refundRef: refund.metadata.refundRef } }) : null);
        if (!payment) {
          this.logger.warn(`Stripe ${event.type} for a refund that is not ours (${refund.id})`);
          return;
        }
        await this.reconcileCardRefund(payment, refund);
        return;
      }
      case 'charge.refunded': {
        // The charge does not name the refund: look at the one we have in flight on that PaymentIntent.
        const payment = event.paymentIntentId ? await this.payments.findOne({ where: { providerRef: event.paymentIntentId } }) : null;
        if (payment?.refundTo === 'card') await this.reconcileCardRefund(payment);
        return;
      }
      default:
        return; // not an event we act on
    }
  }

  /** Read an object from Stripe for a webhook. One that does not exist there is not ours: the event is acknowledged, not retried. */
  private async readForEvent<T>(read: () => Promise<T>): Promise<T | null> {
    try {
      return await read();
    } catch (e) {
      if (e instanceof StripeRejectedError && e.code === 'resource_missing') return null;
      throw e;
    }
  }

  /**
   * Apply what Stripe says about a card payment's PaymentIntent:
   *  - succeeded → settle as paid (the amount and currency Stripe RECEIVED must match what we asked for);
   *  - canceled  → failed;
   *  - anything else stays pending. A declined attempt is not final (the customer can try another card in the sheet),
   *    so only its reason is recorded.
   */
  private async applyCardIntent(payment: Payment, pi: StripePaymentIntent): Promise<Payment> {
    if (pi.status === 'succeeded') {
      if (pi.currency !== 'usd') {
        this.logger.error(`Currency mismatch on ${payment.reference}: got ${pi.currency}, expected usd`);
        await this.notifications.toRole('admin_finance', {
          title: 'Payment amount mismatch',
          body: `${payment.reference}: card payment was made in ${pi.currency.toUpperCase()}, expected USD. Review manually.`,
          type: 'payment',
          entityId: payment.id,
        });
        return payment;
      }
      return (await this.settle({ reference: payment.reference, outcome: 'succeeded', providerRef: pi.id, amountUsd: pi.amountReceived / 100 })) ?? payment;
    }
    if (pi.status === 'canceled') {
      return (await this.settle({ reference: payment.reference, outcome: 'failed', providerRef: pi.id, reason: 'The card payment was cancelled.' })) ?? payment;
    }
    const reason = pi.lastError?.slice(0, 200) ?? null;
    if (payment.status === 'pending' && reason && payment.failureReason !== reason) {
      await this.payments.update({ id: payment.id, status: 'pending' }, { failureReason: reason });
      const saved = (await this.payments.findOne({ where: { id: payment.id } }))!;
      this.publish(saved);
      return saved;
    }
    return payment;
  }

  /** Ask Stripe about one pending card payment and apply its answer (no-op while the customer is still paying). */
  private async reconcileCard(payment: Payment): Promise<Payment> {
    if (payment.status !== 'pending' || !this.stripe || !payment.providerRef) return payment;
    try {
      return await this.applyCardIntent(payment, await this.stripe.retrievePaymentIntent(payment.providerRef));
    } catch (e) {
      this.logger.warn(`Status check failed for ${payment.reference}: ${(e as Error).message}`);
      return payment;
    }
  }

  /** Cancel card PaymentIntents nobody completed within the window (default 30 min); one Stripe already completed is settled as paid instead. */
  private async expireStaleCards(): Promise<number> {
    if (!this.stripe) return 0;
    const ttlMin = Number(process.env.STRIPE_PENDING_TTL_MIN) > 0 ? Number(process.env.STRIPE_PENDING_TTL_MIN) : 30;
    const cutoff = new Date(Date.now() - ttlMin * 60_000);
    const stale = await this.payments.find({
      where: { status: 'pending', method: 'stripe_card', createdAt: LessThan(cutoff) },
      order: { createdAt: 'ASC' },
      take: 50,
    });
    for (const p of stale) {
      try {
        if (p.providerRef) {
          let pi = await this.stripe.retrievePaymentIntent(p.providerRef);
          if (pi.status !== 'succeeded' && pi.status !== 'canceled') {
            try {
              pi = await this.stripe.cancelPaymentIntent(p.providerRef);
            } catch {
              pi = await this.stripe.retrievePaymentIntent(p.providerRef); // it may have succeeded in the meantime
            }
          }
          if (pi.status === 'succeeded') {
            await this.applyCardIntent(p, pi);
            continue;
          }
          if (pi.status !== 'canceled') continue; // still being processed by the bank: leave it to the next sweep
        }
        await this.settle({ reference: p.reference, outcome: 'failed', reason: 'Timed out waiting for the card payment.' });
      } catch (e) {
        this.logger.warn(`Could not expire ${p.reference}: ${(e as Error).message}`);
      }
    }
    return stale.length;
  }

  /**
   * Ask Stripe to refund (part of) a card payment back to the card. `refundRef` is the key the refund is recorded under
   * until Stripe's own id (re_…) replaces it. Returns that id, or null when Stripe gave no answer (the refund may exist:
   * the sweep asks again with the same key). Throws [CardRefundRefusedError] when Stripe says no, so the caller undoes it.
   */
  async sendCardRefund(payment: Pick<Payment, 'id' | 'reference' | 'orderReference' | 'providerRef'>, amountUsd: number, refundRef: string): Promise<string | null> {
    try {
      const refund = await this.stripe!.createRefund({
        paymentIntentId: payment.providerRef!,
        amountCents: Math.round(amountUsd * 100),
        idempotencyKey: refundRef,
        metadata: { refundRef, reference: payment.reference, orderReference: payment.orderReference ?? '' },
      });
      await this.adoptCardRefundId(payment.id, refundRef, refund.id);
      return refund.id;
    } catch (e) {
      if (e instanceof StripeRejectedError) throw new CardRefundRefusedError(e.message);
      if (e instanceof StripeUnavailableError) {
        this.logger.warn(`Card refund ${refundRef} for ${payment.reference} unconfirmed: ${e.message}`);
        return null;
      }
      throw e;
    }
  }

  static newCardRefundRef(): string {
    return `rfd_${randomUUID()}`;
  }

  /** The refund is known by Stripe's id from now on (payment and ledger row). */
  private async adoptCardRefundId(paymentId: string, from: string, to: string): Promise<void> {
    if (from === to) return;
    await this.payments.manager.transaction(async (m) => {
      await m.update(Payment, { id: paymentId, refundRef: from }, { refundRef: to });
      await m.update(PaymentRefund, { refundRef: from }, { refundRef: to });
    });
  }

  /**
   * Apply Stripe's word on a card refund in flight: succeeded → completed; failed / canceled → the amount goes to the
   * wallet instead (once) and finance is told. A refund we only know by our own key (Stripe never answered when we
   * asked) is asked for again with that key, inside the window Stripe remembers keys for.
   */
  private async reconcileCardRefund(payment: Payment, known?: StripeRefund): Promise<void> {
    if (!this.stripe || payment.refundStatus !== 'sending' || !payment.refundRef) return;
    let refund = known ?? null;
    try {
      if (!refund && STRIPE_REFUND_ID.test(payment.refundRef)) refund = await this.stripe.retrieveRefund(payment.refundRef);
      if (!refund) {
        const entry = await this.payments.manager.findOne(PaymentRefund, { where: { refundRef: payment.refundRef } });
        if (!entry || !payment.providerRef) return;
        if (Date.now() - entry.createdAt.getTime() > REFUND_REPLAY_WINDOW_MS) {
          this.logger.error(`Card refund ${payment.refundRef} for ${payment.reference} was never confirmed by Stripe: check it in the Stripe dashboard.`);
          return;
        }
        refund = await this.stripe.createRefund({
          paymentIntentId: payment.providerRef,
          amountCents: Math.round(entry.amountUsd * 100),
          idempotencyKey: payment.refundRef,
          metadata: { refundRef: payment.refundRef, reference: payment.reference, orderReference: payment.orderReference ?? '' },
        });
      }
    } catch (e) {
      this.logger.warn(`Refund status check failed for ${payment.refundRef}: ${(e as Error).message}`);
      return;
    }
    let refundRef = payment.refundRef;
    if (refund.id !== refundRef) {
      await this.adoptCardRefundId(payment.id, refundRef, refund.id);
      refundRef = refund.id;
    }
    if (refund.status !== 'succeeded' && refund.status !== 'failed' && refund.status !== 'canceled') return; // still in progress
    await this.finishRefund(payment, refundRef, refund.status === 'succeeded', refund.failureReason ?? undefined, 'card');
  }

  /** Ask the aggregator about one pending charge and apply its final result (no-op while still in progress). */
  private async reconcileOne(payment: Payment): Promise<Payment> {
    if (payment.method === 'stripe_card') return this.reconcileCard(payment);
    if (payment.status !== 'pending' || !this.mobileMoney?.checkStatus || !payment.providerRef) return payment;
    try {
      const event = await this.mobileMoney.checkStatus({ reference: payment.reference, providerRef: payment.providerRef });
      if (!event) return payment;
      return (await this.settle({ ...event, reference: payment.reference })) ?? payment;
    } catch (e) {
      this.logger.warn(`Status check failed for ${payment.reference}: ${(e as Error).message}`);
      return payment;
    }
  }

  /** Catch up on callbacks that never arrived: pending charges older than two minutes (mobile money and cards), plus phone and card refunds in flight. */
  async reconcilePending(): Promise<void> {
    const cutoff = new Date(Date.now() - 120_000);
    if (this.mobileMoney?.checkStatus) {
      const pending = await this.payments.find({
        where: { status: 'pending', method: In([...MOBILE_MONEY_METHODS]), createdAt: LessThan(cutoff) },
        order: { createdAt: 'ASC' },
        take: 25,
      });
      for (const p of pending) await this.reconcileOne(p);
    }
    if (this.stripe) {
      const cards = await this.payments.find({
        where: { status: 'pending', method: 'stripe_card', createdAt: LessThan(cutoff) },
        order: { createdAt: 'ASC' },
        take: 25,
      });
      for (const p of cards) await this.reconcileCard(p);
    }
    if (this.pawapay || this.stripe) {
      const sending = await this.payments.find({ where: { refundStatus: 'sending' }, take: 25 });
      for (const p of sending) if (p.refundRef) await this.reconcileRefund(p.refundRef);
    }
  }

  /** Move a payment between states ONLY if it is still in one of `from` (atomic). */
  private async claim(
    m: EntityManager,
    id: string,
    from: PaymentStatus[],
    to: PaymentStatus,
    failureReason?: string | null,
  ): Promise<boolean> {
    const res = await m
      .createQueryBuilder()
      .update(Payment)
      .set({ status: to, ...(failureReason !== undefined ? { failureReason } : {}) })
      .where('id = :id AND status IN (:...from)', { id, from })
      .execute();
    return !!res.affected;
  }

  /**
   * Apply a final result to a payment. Idempotent AND race-free: each state
   * change is a conditional UPDATE (so a retried webhook arriving at the same
   * instant as another can only win once), and the money movement happens in the
   * same transaction as the state change.
   */
  async settle(event: MobileMoneyEvent): Promise<Payment | null> {
    const payment =
      (event.reference ? await this.payments.findOne({ where: { reference: event.reference } }) : null) ??
      (event.providerRef ? await this.payments.findOne({ where: { providerRef: event.providerRef } }) : null);
    if (!payment) return null;
    event = { ...event, reference: payment.reference };
    if (payment.status === 'succeeded' || payment.status === 'refunded') return payment;

    // An amount that doesn't match what we asked for is never accepted as success.
    if (
      event.outcome === 'succeeded' &&
      event.amountUsd != null &&
      Math.abs(event.amountUsd - payment.amountUsd) > 0.009
    ) {
      this.logger.error(`Amount mismatch on ${payment.reference}: got ${event.amountUsd}, expected ${payment.amountUsd}`);
      await this.notifications.toRole('admin_finance', {
        title: 'Payment amount mismatch',
        body: `${payment.reference}: provider reported $${event.amountUsd}, expected $${payment.amountUsd}. Review manually.`,
        type: 'payment',
        entityId: payment.id,
      });
      return payment;
    }

    if (event.providerRef && payment.providerRef !== event.providerRef) {
      await this.payments.update({ id: payment.id }, { providerRef: event.providerRef });
    }

    if (event.outcome === 'failed') {
      const won = await this.claim(this.payments.manager, payment.id, ['pending'], 'failed', event.reason ?? 'Payment was not approved.');
      const saved = (await this.payments.findOne({ where: { id: payment.id } }))!;
      if (!won) return saved; // already settled by someone else
      this.publish(saved);
      if (saved.purpose === 'order' && this.orderSettled) await this.orderSettled(saved, 'failed');
      await this.notifications.toUser(saved.userId, {
        title: 'Payment failed',
        body: `${saved.failureReason}`,
        type: 'payment',
        entityId: saved.orderId ?? saved.id,
      });
      return saved;
    }

    // Success. If it arrives AFTER we gave up (timeout / cancelled order), the
    // customer's money is real, so it must not vanish: credit it to their wallet.
    let wasPending = false;
    const won = await this.payments.manager.transaction(async (m) => {
      if (payment.purpose === 'topup') {
        if (!(await this.claim(m, payment.id, ['pending', 'failed'], 'succeeded', null))) return false;
        await this.wallet.apply(payment.userId, 'topup', payment.amountUsd, `Wallet top-up via ${paymentMethodLabel(payment.method)}`, m);
        return true;
      }
      if (await this.claim(m, payment.id, ['pending'], 'succeeded', null)) {
        wasPending = true;
        return true;
      }
      // Late success on a payment we already failed: park the money in the wallet.
      if (!(await this.claim(m, payment.id, ['failed'], 'refunded'))) return false;
      const memo = `Payment ${payment.reference} arrived after order ${payment.orderReference} was closed`;
      await this.wallet.apply(payment.userId, 'refund', payment.amountUsd, memo, m);
      await recordParkedPayment(m, payment, memo); // C-refund: recorded like every refund
      return true;
    });
    const saved = (await this.payments.findOne({ where: { id: payment.id } }))!;
    if (!won) return saved;
    this.publish(saved);
    if (saved.purpose === 'order' && wasPending && this.orderSettled) {
      await this.orderSettled(saved, 'succeeded');
    }
    if (saved.purpose === 'plan' && wasPending && this.planSettled) {
      await this.planSettled(saved);
    }
    await this.notifications.toUser(saved.userId, {
      title: 'Payment received',
      body:
        saved.purpose === 'topup'
          ? `$${saved.amountUsd.toFixed(2)} added to your wallet.`
          : saved.purpose === 'plan'
            ? `Payment for your ${saved.subject ?? ''} seller plan confirmed.`
            : `Payment for ${saved.orderReference} confirmed.`,
      type: 'payment',
      entityId: saved.orderId ?? saved.id,
    });
    return saved;
  }

  /** Fail mobile-money charges nobody approved within the window (default 15 min), and cancel card payments nobody completed (default 30 min). */
  async expireStale(): Promise<number> {
    const ttlMin = Number(process.env.MM_PENDING_TTL_MIN ?? (this.mobileMoney?.name === 'manual' ? 1440 : 15));
    const cutoff = new Date(Date.now() - ttlMin * 60_000);
    const stale = await this.payments.find({
      where: { status: 'pending', method: In([...MOBILE_MONEY_METHODS]), createdAt: LessThan(cutoff) },
    });
    for (const p of stale) {
      // The aggregator has the last word: a charge it completed is settled, not expired.
      const checked = await this.reconcileOne(p);
      if (checked.status !== 'pending') continue;
      await this.settle({ reference: p.reference, outcome: 'failed', reason: 'Timed out waiting for approval.' });
    }
    return stale.length + (await this.expireStaleCards());
  }

  /** The order's payment (latest), if any. */
  forOrder(orderId: string): Promise<Payment | null> {
    return this.payments.findOne({ where: { orderId }, order: { createdAt: 'DESC' } });
  }

  /**
   * COD collected when the parcel is delivered. `receipt` is the cash record the delivery wrote (how much, who took it,
   * when): it goes into the audit trail on the payment, so finance sees the amount and the person where the payment turns
   * "succeeded". Only the call that actually flips the payment writes it, so a repeated call records nothing twice.
   */
  async markCollected(orderId: string, receipt?: CodReceipt): Promise<void> {
    const payment = await this.payments.findOne({ where: { orderId } });
    if (!payment || payment.status !== 'pending' || payment.method !== 'cod') return;
    const claim = await this.payments
      .createQueryBuilder()
      .update(Payment)
      .set({ status: 'succeeded' })
      .where("id = :id AND status = 'pending'", { id: payment.id })
      .execute();
    if (!claim.affected) return; // another request collected it a moment ago
    payment.status = 'succeeded';
    if (receipt) {
      const detail = `${payment.orderReference ?? payment.reference}: ${receipt.amountUsd.toFixed(2)} USD cash collected by ${receipt.byName} (${receipt.byRole}) on ${receipt.at.toISOString()}${receipt.source === 'admin_close' ? ' - delivery closed by hand' : ''}; due ${payment.amountUsd.toFixed(2)} USD; task ${receipt.taskId}`;
      const log = await this.payments.manager.getRepository(AuditLog).save(
        this.payments.manager.getRepository(AuditLog).create({ actor: receipt.byName, role: receipt.byRole, action: 'payment.cod_collected', entity: 'payment', entityId: payment.id, detail }),
      );
      this.emitter.toRoles(ADMIN_ROLES, 'audit:created', log);
    }
    this.publish((await this.payments.findOne({ where: { id: payment.id } })) ?? payment);
  }

  /**
   * Called when an order is cancelled. If we actually collected money for it
   * (prepaid, not COD), the payment is marked refunded and the wallet credited in
   * ONE transaction; a pending payment is simply abandoned (a late approval is
   * then credited to the wallet by [settle]). Returns the amount credited to the wallet (0 when none).
   */
  async refundCancelledOrder(order: Order): Promise<number> {
    const payment = await this.forOrder(order.id);
    if (!payment) return 0;
    if (payment.status === 'pending') {
      if (isMobileMoney(payment.method) || payment.method === 'stripe_card') {
        await this.claim(this.payments.manager, payment.id, ['pending'], 'failed', 'Cancelled by customer.');
        this.publish((await this.payments.findOne({ where: { id: payment.id } }))!);
        if (payment.method === 'stripe_card' && payment.providerRef && this.stripe) {
          // Nobody should be able to pay a cancelled order. If the customer paid in this very moment the cancel is refused
          // and the late success is parked in the wallet by [settle], like a late mobile-money approval.
          await this.stripe.cancelPaymentIntent(payment.providerRef).catch((e) => this.logger.warn(`Could not cancel the card payment of ${payment.reference}: ${(e as Error).message}`));
        }
      }
      return 0;
    }
    if (payment.status !== 'succeeded' || order.paymentMethod === 'cod') return 0;
    // C-refund: only what is left on the payment goes back (lines a seller or a return already refunded are out).
    const due = refundableUsd(payment, order.items);
    const won = await this.payments.manager.transaction(async (m) => {
      if (due < 0.01) return this.claim(m, payment.id, ['succeeded'], 'refunded'); // nothing left to pay back: the payment is just closed
      try {
        await recordRefund(m, { payment, amountUsd: due, to: 'wallet', kind: 'cancellation', memo: `Refund for cancelled order ${order.reference}` });
      } catch (e) {
        if (e instanceof BadRequestException) return false; // a concurrent cancel refunded it first: exactly one wins
        throw e;
      }
      await this.wallet.apply(payment.userId, 'refund', due, `Refund for cancelled order ${order.reference}`, m);
      return true;
    });
    if (won) this.publish((await this.payments.findOne({ where: { id: payment.id } }))!);
    return won ? due : 0;
  }

  /**
   * What is still refundable on an order's payment by its lines alone: lines a seller already cancelled were refunded
   * on their own, so they are never paid back twice. (`refundableUsd` in refund-ledger.ts also counts the payment's own
   * running total of refunds, which is what every refund path is capped by.)
   */
  static outstanding(amountUsd: number, order: Pick<Order, 'items'>): number {
    const already = (order.items ?? []).reduce((t, i) => t + (i.refundedUsd ?? 0), 0);
    return Math.max(0, Number((amountUsd - already).toFixed(2)));
  }

  /**
   * Where "back to the original method" can go for a payment: the paying phone through pawaPay (mobile-money payments),
   * the card through Stripe (a real Stripe card payment: it has a PaymentIntent), or null (then only the wallet).
   */
  refundToOriginal(payment: Pick<Payment, 'method' | 'providerRef'>): RefundOriginal | null {
    if (!payment.providerRef) return null;
    if (payment.method === 'stripe_card') return this.stripe && payment.providerRef.startsWith('pi_') ? 'card' : null;
    if (isMobileMoney(payment.method)) return this.pawapay && this.mobileMoney?.name === 'pawapay' ? 'phone' : null;
    return null;
  }

  /**
   * Refund an order: to the customer's wallet (instant store credit, the default) or, when the payment can go back
   * where it came from, to the original method (`toWallet === false`): the phone that paid (pawaPay mobile money) or the
   * card (Stripe). Such a refund is "sending" until the processor confirms it; if it fails, the amount goes to the
   * wallet instead so the customer is never left out.
   *
   * A parcel that was never delivered is called off: the order becomes `cancelled`, its stock goes back on the
   * shelf and any open delivery is voided. A delivered order becomes `returned`. Never pays back more than what is
   * still left on the payment (C-refund: lines a seller cancelled and items already returned were refunded on their
   * own); the refund is recorded in the ledger like every other, `result.refund` being this one.
   */
  async refund(orderId: string, toWallet: boolean, source: RefundSource = {}): Promise<RefundResult> {
    const payment = await this.payments.findOne({ where: { orderId } });
    if (!payment) throw new NotFoundException('No payment for this order.');
    if (payment.status === 'refunded') {
      throw new BadRequestException('Already refunded.');
    }
    if (payment.status !== 'succeeded') {
      throw new BadRequestException('Only a completed payment can be refunded.');
    }
    const original = toWallet === false ? this.refundToOriginal(payment) : null;
    if (toWallet === false && !original) {
      throw new BadRequestException(
        isMobileMoney(payment.method)
          ? "Refunds to the phone need pawaPay to be connected. Refund to the customer's wallet."
          : payment.method === 'stripe_card'
            ? "Refunds to the card need Stripe to be connected. Refund to the customer's wallet."
            : "Only mobile-money payments can be refunded to a phone. Refund to the customer's wallet.",
      );
    }
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (order?.status === 'cancelled') {
      throw new BadRequestException('This order was cancelled and has already been settled.');
    }
    // C-refund (service): refuse with the real figure; recordRefund checks it again in the database, in the transaction.
    const due = refundableUsd(payment, order?.items);
    if (due < 0.01) throw new BadRequestException(NOTHING_LEFT_TO_REFUND);
    const refundRef = original === 'phone' ? this.pawapay!.newId() : original === 'card' ? PaymentsService.newCardRefundRef() : null;
    // Atomic: of two concurrent refunds exactly one wins.
    const entry = await this.payments.manager.transaction(async (m) => {
      const { entry: recorded } = await recordRefund(m, {
        payment,
        amountUsd: due,
        to: original ?? 'wallet',
        kind: source.kind ?? 'admin',
        memo: `Refund for ${payment.orderReference}`,
        refundRef,
        disputeId: source.disputeId,
        disputeReference: source.disputeReference,
      });
      if (!original) await this.wallet.apply(payment.userId, 'refund', due, `Refund for ${payment.orderReference}`, m);
      return recorded;
    });

    if (original === 'phone') {
      try {
        await this.pawapay!.refund({ refundId: refundRef!, depositId: payment.providerRef!, amountUsd: due, reference: payment.reference });
      } catch (e) {
        if (!(e instanceof PawapayUnavailableError)) {
          // pawaPay said no: undo, so finance can refund to the wallet instead.
          await this.payments.manager.transaction((m) => revertRefund(m, entry));
          throw new BadRequestException(`pawaPay refused the refund: ${(e as Error).message}`);
        }
        // No answer: the refund may exist; the status check settles it.
        this.logger.warn(`Refund ${refundRef} for ${payment.reference} unconfirmed: ${e.message}`);
      }
    } else if (original === 'card') {
      try {
        const stripeId = await this.sendCardRefund(payment, due, refundRef!);
        if (stripeId) entry.refundRef = stripeId;
      } catch (e) {
        if (!(e instanceof CardRefundRefusedError)) throw e;
        // Stripe said no: undo, so finance can refund to the wallet instead.
        await this.payments.manager.transaction((m) => revertRefund(m, entry));
        throw new BadRequestException(`Stripe refused the refund: ${e.message}`);
      }
    }

    const saved = (await this.payments.findOne({ where: { id: payment.id } }))!;
    if (order) await this.closeRefundedOrder(order);
    this.publish(saved);
    await this.notifications.toUser(saved.userId, {
      title: 'Refund issued',
      body:
        original === 'phone'
          ? `$${due.toFixed(2)} for ${saved.orderReference} is on its way back to your mobile-money number.`
          : original === 'card'
            ? `$${due.toFixed(2)} for ${saved.orderReference} is on its way back to your card.`
            : `$${due.toFixed(2)} for ${saved.orderReference} → wallet.`,
      type: 'payment',
      entityId: orderId,
    });
    return { ...saved, refund: entry };
  }

  /** A refunded order: delivered → returned; otherwise cancelled, restocked, and its open deliveries voided. */
  private async closeRefundedOrder(order: Order): Promise<void> {
    const delivered = order.status === 'delivered' || order.status === 'returned';
    order.status = delivered ? 'returned' : 'cancelled';
    await this.orders.save(order);
    if (!delivered) {
      // The goods never reached the customer: back on the shelf, and no rider should still go for them.
      for (const item of order.items ?? []) {
        // A line a seller already cancelled was restocked then.
        if (!item.productId.startsWith('ext:') && item.fulfilment !== 'cancelled') {
          await this.products.restock(item.productId, item.qty, { variant: item.variant, orderId: order.id, reason: 'cancel_restock' });
        }
      }
      const tasks = await this.deliveries.find({
        where: { orderId: order.id, status: In(['unassigned', 'assigned', 'picked_up', 'in_transit']) },
      });
      for (const task of tasks) {
        task.status = 'failed';
        task.failureReason = 'Refunded';
        await this.deliveries.save(task);
        // Admins, the warehouses at the ends of the leg (not every warehouse) and the rider hear that it was voided.
        this.emitter.toRoles(DESK_ROLES, 'delivery:updated', task);
        for (const hub of new Set([task.hubId, task.fromHubId, task.toHubId])) if (hub) this.emitter.toHub(hub, 'delivery:updated', task);
        if (task.riderId) this.emitter.toUser(task.riderId, 'delivery:updated', task);
      }
    }
    this.emitter.toUser(order.customerId, 'order:updated', order);
    pushOrderToOps(this.emitter, 'order:updated', order);
  }

  /**
   * Apply the processor's final word on a refund in flight (phone: pawaPay, card: Stripe): completed → done; failed →
   * the amount is credited to the wallet instead (once), and finance is told.
   */
  async reconcileRefund(refundRef: string): Promise<void> {
    const payment = await this.payments.findOne({ where: { refundRef } });
    if (!payment || payment.refundStatus !== 'sending') return;
    if (payment.refundTo === 'card') return this.reconcileCardRefund(payment);
    if (!this.pawapay) return;
    let s;
    try {
      s = await this.pawapay.check('refunds', refundRef);
    } catch (e) {
      this.logger.warn(`Refund status check failed for ${refundRef}: ${(e as Error).message}`);
      return;
    }
    if (!s.found || !s.final) return;
    await this.finishRefund(payment, refundRef, s.succeeded, s.failureMessage, 'phone');
  }

  /** A phone or card refund reached its final state: record it and, when it failed, give the money to the wallet (once). */
  private async finishRefund(payment: Payment, refundRef: string, succeeded: boolean, failureMessage: string | undefined, via: RefundOriginal): Promise<void> {
    // This refund's own amount (the payment's `refundedUsd` is the running total of all its refunds).
    const entry = await this.payments.manager.findOne(PaymentRefund, { where: { refundRef } });
    const amount = entry?.amountUsd ?? payment.refundedUsd ?? payment.amountUsd;
    const to = succeeded ? 'completed' : 'failed';
    const won = await this.payments.manager.transaction(async (m) => {
      const res = await m
        .createQueryBuilder()
        .update(Payment)
        .set({ refundStatus: to, ...(succeeded ? {} : { refundTo: 'wallet' }) })
        .where("id = :id AND refundStatus = 'sending'", { id: payment.id })
        .execute();
      if (!res.affected) return false;
      // The ledger follows the processor's word: a failed phone or card refund is a wallet refund (the money is still the customer's).
      if (entry) await m.update(PaymentRefund, { id: entry.id }, { status: to, ...(succeeded ? {} : { refundTo: 'wallet' as const }) });
      if (!succeeded && amount > 0) {
        await this.wallet.apply(payment.userId, 'refund', amount, `Refund for ${payment.orderReference} (${via} refund failed)`, m);
      }
      return true;
    });
    if (!won) return;
    this.publish((await this.payments.findOne({ where: { id: payment.id } }))!);
    if (succeeded) {
      await this.notifications.toUser(payment.userId, {
        title: 'Refund sent',
        body:
          via === 'card'
            ? `$${amount.toFixed(2)} for ${payment.orderReference} was sent back to your card.`
            : `$${amount.toFixed(2)} for ${payment.orderReference} was sent to your mobile-money number.`,
        type: 'payment',
        entityId: payment.orderId ?? payment.id,
      });
    } else {
      await this.notifications.toUser(payment.userId, {
        title: 'Refund issued',
        body:
          via === 'card'
            ? `$${amount.toFixed(2)} for ${payment.orderReference} → wallet (the card refund could not be completed).`
            : `$${amount.toFixed(2)} for ${payment.orderReference} → wallet (the network could not take it back to your phone).`,
        type: 'payment',
        entityId: payment.orderId ?? payment.id,
      });
      await this.notifications.toRole('admin_finance', {
        title: via === 'card' ? 'Card refund failed' : 'Phone refund failed',
        body:
          via === 'card'
            ? `${payment.reference}: Stripe could not refund $${amount.toFixed(2)}${failureMessage ? ` (${failureMessage})` : ''}. It was credited to the customer's wallet.`
            : `${payment.reference}: pawaPay could not refund $${amount.toFixed(2)}${failureMessage ? ` (${failureMessage})` : ''}. It was credited to the customer's wallet.`,
        type: 'payment',
        entityId: payment.id,
      });
    }
  }

  async list(user: { id: string; role: string }, paging?: unknown): Promise<PaymentView[]> {
    // Only finance/admin see every payment; everyone else just their own.
    const all = user.role === 'admin' || user.role === 'admin_finance';
    const { take, skip } = pageOf(paging, { def: all ? 200 : DEFAULT_LIMIT });
    const rows = all
      ? await this.payments.find({ order: { createdAt: 'DESC' }, take, skip })
      : await this.payments.find({ where: { userId: user.id }, order: { createdAt: 'DESC' }, take, skip });
    return rows.map((p) => this.view(p));
  }

  /** A payment by reference, visible to its owner and to finance/admin. */
  async status(user: { id: string; role: string }, reference: string): Promise<PaymentView> {
    let p = await this.payments.findOne({ where: { reference } });
    const isStaff = user.role === 'admin' || user.role === 'admin_finance';
    if (!p || (p.userId !== user.id && !isStaff)) throw new NotFoundException('Payment not found.');
    // Waiting on the network: ask it now rather than wait for a callback.
    if (p.status === 'pending') p = await this.reconcileOne(p);
    return this.view(p);
  }

  /**
   * Never push a full subscriber number to dashboards/sockets. `refundableUsd` is what finance may still refund on it and
   * `refundToOriginal` where a "back to where it came from" refund would go (phone, card, or null: wallet only).
   */
  view(p: Payment): PaymentView {
    return { ...p, phone: mask(p.phone), refundableUsd: refundableUsd(p), refundToOriginal: this.refundToOriginal(p) };
  }

  /**
   * The refund ledger, newest first, for the admin Refunds page (admin / finance only): every refund of every payment
   * with its amount, where it went, when, and which return or dispute it belongs to.
   */
  async refundLog(user: { id: string; role: string }, paging?: unknown): Promise<(PaymentRefund & { paymentReference: string | null; method: string | null })[]> {
    if (user.role !== 'admin' && user.role !== 'admin_finance') throw new BadRequestException('Only admin/finance can see refunds.');
    const { take, skip } = pageOf(paging, { def: 500, max: 1000 });
    const rows = await this.payments.manager.find(PaymentRefund, { order: { createdAt: 'DESC', id: 'ASC' }, take, skip });
    const ids = [...new Set(rows.map((r) => r.paymentId))];
    const owners = ids.length ? await this.payments.find({ where: { id: In(ids) }, select: ['id', 'reference', 'method'] }) : [];
    const by = new Map(owners.map((p) => [p.id, p]));
    return rows.map((r) => ({ ...r, paymentReference: by.get(r.paymentId)?.reference ?? null, method: by.get(r.paymentId)?.method ?? null }));
  }

  private publish(saved: Payment) {
    this.emitter.toUser(saved.userId, 'payment:updated', this.view(saved));
    this.emitter.toRoles(FINANCE_ROLES, 'payment:updated', this.view(saved));
  }

  private static newReference(): string {
    const n = Math.floor(1000 + Math.random() * 9000);
    return `PAY-${Date.now().toString().slice(-6)}${n}`.slice(0, 24);
  }
}

export type { PaymentPurpose };
