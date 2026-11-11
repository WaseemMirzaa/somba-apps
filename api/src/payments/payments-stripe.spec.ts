import { UnauthorizedException } from '@nestjs/common';
import { DeliveryTask, Hub, Order, OrderItem, Payment, PaymentRefund, User, WalletTransaction } from '../database/entities';
import type { Seller } from '../database/entities';
import { PartialRefundService } from '../disputes/partial-refund.service';
import { OrdersService } from '../orders/orders.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SettingsService } from '../content/settings.service';
import { commerceWorld } from '../testing/commerce-db';
import type { World } from '../testing/commerce-db';
import { FakeStripe, GOOD_ENV, PK } from '../testing/stripe-fake';
import { WalletService } from '../wallet/wallet.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripeRejectedError, StripeUnavailableError } from './stripe.provider';

/**
 * Card payments through Stripe, end to end on an in-memory database: a real OrdersService, PaymentsService and
 * PaymentsController against a FakeStripe (signatures on its webhooks are REAL, from the stripe package).
 */
const ROUTE = { feeUsd: 0, deliveryUsd: 0, transferUsd: 0, distanceKm: 1, destinationHubId: 'h1', destinationHub: { id: 'h1', name: 'H', city: 'C' }, originHubIds: [], originBySeller: {}, transfer: false, pinned: true, fallback: null };

let w: World;
let shop: Seller;
let customer: User;
let stranger: User;
let stripe: FakeStripe;
let payments: PaymentsService;
let orders: OrdersService;
let partial: PartialRefundService;
let controller: PaymentsController;
let planned: string[];
let notes: { to: string; title: string; body: string }[];

const env = { ...process.env };

async function build(withStripe = true) {
  w = await commerceWorld();
  shop = await w.store('Kinshasa Traders', 'u-kt');
  const user = (n: string) => w.ds.getRepository(User).save(w.ds.getRepository(User).create({ emailHash: n, email: `${n}@x.test`, passwordHash: 'x', name: n, role: 'customer', walletBalance: 0 }));
  customer = await user('marie');
  stranger = await user('paul');
  stripe = new FakeStripe();
  planned = [];
  notes = [];
  const wallet = new WalletService(w.ds.getRepository(User), w.ds.getRepository(WalletTransaction), w.emitter as never);
  const notifications = {
    toUser: async (to: string, n: { title: string; body: string }) => void notes.push({ to: `user:${to}`, ...n }),
    toRole: async (to: string, n: { title: string; body: string }) => void notes.push({ to: `role:${to}`, ...n }),
    toAdmins: async () => undefined,
    toUsers: async () => undefined,
  };
  payments = new PaymentsService(
    w.ds.getRepository(Payment), w.ds.getRepository(Order), wallet, notifications as never, w.emitter as never, { get: async () => null } as never,
    { name: 'manual' } as never, w.ds.getRepository(DeliveryTask), w.products, null, withStripe ? stripe : null,
  );
  orders = new OrdersService(
    w.ds.getRepository(Order), w.ds.getRepository(DeliveryTask), w.ds.getRepository('Seller') as never, { registerFailedHandler: () => undefined } as never,
    w.products, notifications as never, w.emitter as never, payments, wallet, w.promos, { get: async (k: string) => w.settings[k] ?? null } as never,
    w.ds.getRepository(Hub), w.ds.getRepository(User), undefined,
    { planOrder: async (o: Order) => void planned.push(o.id), staffIds: async () => [], voidOrderTasks: async () => undefined, onSellerCancelled: async () => undefined } as never,
    { route: async () => ROUTE } as never,
  );
  partial = new PartialRefundService(w.ds.getRepository(Payment), w.ds.getRepository(Order), w.ds.getRepository(OrderItem), wallet, payments, w.emitter as never, notifications as never, null);
  controller = new PaymentsController(payments);
}

beforeEach(() => build());
afterEach(async () => {
  process.env = { ...env };
  await w.ds.destroy();
});

const me = () => ({ id: customer.id, name: 'marie' });
/** A pending card order of $19.99 (the cents are not exact in floating point) plus $10.00. */
async function place(method: 'stripe_card' | 'wallet' = 'stripe_card') {
  const a = await w.product(shop, { name: 'Shoes', price: 19.99, stock: 10 });
  const b = await w.product(shop, { name: 'Socks', price: 10, stock: 10 });
  const order = await orders.create(me(), { items: [{ productId: a.id, qty: 1 }, { productId: b.id, qty: 1 }], paymentMethod: method });
  return { order, a, b };
}
const orderRow = (id: string) => w.ds.getRepository(Order).findOneByOrFail({ id });
const payOf = (orderId: string) => w.ds.getRepository(Payment).findOneByOrFail({ orderId });
const balance = async () => (await w.ds.getRepository(User).findOneByOrFail({ id: customer.id })).walletBalance;
const ledger = () => w.ds.getRepository(PaymentRefund).find();
const hook = (ev: { body: Buffer; header: string }) => controller.stripe({ rawBody: ev.body, headers: { 'stripe-signature': ev.header } } as never);
const finance = (title: string) => notes.filter((n) => n.to === 'role:admin_finance' && n.title === title);
const stock = async (id: string) => (await w.products.getRaw(id))!.stock;

/** A paid card order: placed, the customer pays in the sheet, Stripe's webhook arrives. */
async function paid() {
  const placed = await place();
  const payment = await payOf(placed.order.id);
  stripe.succeed(payment.providerRef!);
  await hook(stripe.intentEvent('payment_intent.succeeded', payment.providerRef!));
  return { ...placed, payment: await payOf(placed.order.id) };
}

describe('starting a card payment', () => {
  it('creates a pending payment and a PaymentIntent for the order total in cents, USD, with the contract metadata and an idempotency key', async () => {
    const { order } = await place();
    expect(order.status).toBe('pending');
    expect(order.totalUsd).toBe(29.99);
    const payment = await payOf(order.id);
    expect(payment).toMatchObject({ method: 'stripe_card', status: 'pending', purpose: 'order', providerRef: 'pi_1', amountUsd: 29.99, userId: customer.id });
    expect(stripe.created).toEqual([
      {
        amountCents: 2999,
        currency: 'usd',
        description: `KOMORIKO order ${order.reference}`,
        metadata: { reference: payment.reference, orderReference: order.reference, purpose: 'order', userId: customer.id },
        idempotencyKey: `pi-${payment.reference}`,
      },
    ]);
    expect(w.emitter.sent.filter((e) => e.event === 'payment:created').length).toBeGreaterThan(0);
  });

  it('tells the customer to complete the card payment, not to approve a request on a phone', async () => {
    const { order } = await place();
    const n = notes.find((x) => x.to === `user:${customer.id}` && x.title === 'Complete your payment')!;
    expect(n.body).toBe(`Complete the card payment to confirm ${order.reference}.`);
    expect(notes.some((x) => /phone/i.test(x.body))).toBe(false);
  });

  it('never stores the client secret: not in the database, not in a push, not in a notification', async () => {
    const { order } = await place();
    const payment = await payOf(order.id);
    const everything = JSON.stringify([await w.ds.getRepository(Payment).find(), w.emitter.sent, notes, await orderRow(order.id)]);
    expect(everything).not.toContain('_secret_');
    expect(payment.providerRef).toBe('pi_1');
  });

  it('a refusal by Stripe fails the payment, cancels the order and gives the stock back', async () => {
    const a = await w.product(shop, { name: 'Shoes', price: 20, stock: 5 });
    stripe.failNext.create = new StripeRejectedError('Invalid request');
    await expect(orders.create(me(), { items: [{ productId: a.id, qty: 2 }], paymentMethod: 'stripe_card' })).rejects.toThrow('Could not start the card payment. Please try again.');
    expect(await stock(a.id)).toBe(5);
    expect(await w.ds.getRepository(Payment).findOneByOrFail({ method: 'stripe_card' })).toMatchObject({ status: 'failed', providerRef: null });
    stripe.failNext.create = new StripeUnavailableError('timeout');
    await expect(orders.create(me(), { items: [{ productId: a.id, qty: 1 }], paymentMethod: 'stripe_card' })).rejects.toThrow('Could not reach the card processor. Please try again.');
    expect(await stock(a.id)).toBe(5);
  });

  it('a card is a real method only with Stripe: production refuses it without, outside production the mock confirms at once', async () => {
    const bare = new PaymentsService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never, null as never, {} as never, {} as never);
    const withStripe = new PaymentsService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never, null as never, {} as never, {} as never, null, stripe);
    process.env.NODE_ENV = 'production';
    await expect(bare.assertMethodAllowed('stripe_card')).rejects.toThrow('Card payments are not available.');
    await expect(withStripe.assertMethodAllowed('stripe_card')).resolves.toBeUndefined();
    process.env.NODE_ENV = 'development';
    await expect(bare.assertMethodAllowed('stripe_card')).resolves.toBeUndefined();
    await build(false);
    const { order } = await place();
    expect(order.status).toBe('confirmed'); // the mock authorises at once; no PaymentIntent exists
    expect(await payOf(order.id)).toMatchObject({ status: 'succeeded', providerRef: null });
    expect(stripe.created).toEqual([]);
  });

  it('finance cannot confirm a card payment by hand', async () => {
    const { order } = await place();
    const payment = await payOf(order.id);
    await expect(payments.decideManually(payment.reference, 'succeeded')).rejects.toThrow('Card payments are confirmed by Stripe, not by hand.');
    expect((await payOf(order.id)).status).toBe('pending');
  });
});

describe('payments:card-sheet', () => {
  it('gives the owner the sheet data for the pending card payment, by reference or by order', async () => {
    const { order } = await place();
    const payment = await payOf(order.id);
    const expected = { reference: payment.reference, clientSecret: expect.stringContaining('pi_1_secret_'), publishableKey: PK, amountUsd: 29.99, currency: 'usd', merchantName: 'KOMORIKO' };
    expect(await payments.cardSheet(customer.id, { reference: payment.reference })).toEqual(expected);
    expect(await payments.cardSheet(customer.id, { orderId: order.id })).toEqual(expected);
    expect(await payments.cardSheet(customer.id, { orderId: order.id, reference: payment.reference })).toEqual(expected);
  });

  it('is for the owner only: another account, an unknown payment and an empty request all get "Payment not found."', async () => {
    const { order } = await place();
    const payment = await payOf(order.id);
    for (const body of [{ reference: payment.reference }, { orderId: order.id }]) {
      await expect(payments.cardSheet(stranger.id, body)).rejects.toThrow('Payment not found.');
    }
    await expect(payments.cardSheet(customer.id, { reference: 'PAY-NOPE' })).rejects.toThrow('Payment not found.');
    await expect(payments.cardSheet(customer.id, { orderId: 'nope' })).rejects.toThrow('Payment not found.');
    await expect(payments.cardSheet(customer.id, {})).rejects.toThrow('Payment not found.');
    await expect(payments.cardSheet(customer.id, { orderId: 'someone-elses', reference: payment.reference })).rejects.toThrow('Payment not found.');
  });

  it('is only for a payment that is waiting for a card', async () => {
    const { order } = await paid();
    const payment = await payOf(order.id);
    await expect(payments.cardSheet(customer.id, { reference: payment.reference })).rejects.toThrow('This payment is not waiting for a card.'); // already paid
    // a pending payment that is not a card
    await w.ds.getRepository(Payment).update({ id: payment.id }, { status: 'pending', method: 'cod' });
    await expect(payments.cardSheet(customer.id, { reference: payment.reference })).rejects.toThrow('This payment is not waiting for a card.');
  });

  it('settles a payment Stripe already finished, and says it is no longer waiting', async () => {
    const { order } = await place();
    const payment = await payOf(order.id);
    stripe.succeed('pi_1');
    await expect(payments.cardSheet(customer.id, { reference: payment.reference })).rejects.toThrow('This payment is not waiting for a card.');
    expect((await payOf(order.id)).status).toBe('succeeded');
    expect((await orderRow(order.id)).status).toBe('confirmed');
  });

  it('is unavailable when Stripe is off, and says so when Stripe cannot be reached', async () => {
    const { order } = await place();
    const payment = await payOf(order.id);
    stripe.failNext.retrieve = new StripeUnavailableError('down');
    await expect(payments.cardSheet(customer.id, { reference: payment.reference })).rejects.toThrow('Could not reach the card processor. Please try again.');
    await build(false);
    await expect(payments.cardSheet(customer.id, { reference: 'PAY-1' })).rejects.toThrow('Card payments are not available.');
  });

  it('the socket handler answers with the contract shape and the contract errors, for the connected user', async () => {
    const { order } = await place();
    const payment = await payOf(order.id);
    const gateway = Object.assign(Object.create(RealtimeGateway.prototype), { payments, requireUser: (c: { id: string }) => c });
    const ok = (await gateway.paymentsCardSheet({ id: customer.id }, { reference: payment.reference })) as { ok: boolean; data: Record<string, unknown> };
    expect(ok.ok).toBe(true);
    expect(Object.keys(ok.data).sort()).toEqual(['amountUsd', 'clientSecret', 'currency', 'merchantName', 'publishableKey', 'reference']);
    expect(await gateway.paymentsCardSheet({ id: stranger.id }, { reference: payment.reference })).toMatchObject({ ok: false, error: 'Payment not found.' });
    expect(await gateway.paymentsCardSheet({ id: customer.id }, undefined)).toMatchObject({ ok: false, error: 'Payment not found.' });
  });
});

describe('the Stripe webhook', () => {
  it('confirms the order when a correctly signed payment_intent.succeeded arrives (and a replay changes nothing)', async () => {
    const { order } = await place();
    stripe.succeed('pi_1');
    expect(await hook(stripe.intentEvent('payment_intent.succeeded', 'pi_1'))).toEqual({ received: true });
    expect(await payOf(order.id)).toMatchObject({ status: 'succeeded', failureReason: null });
    expect((await orderRow(order.id)).status).toBe('confirmed');
    expect(planned).toEqual([order.id]);
    expect(notes.find((n) => n.title === 'Payment received')!.body).toBe(`Payment for ${order.reference} confirmed.`);
    await hook(stripe.intentEvent('payment_intent.succeeded', 'pi_1'));
    expect(planned).toEqual([order.id]); // fulfilment opened once
    expect(notes.filter((n) => n.title === 'Payment received')).toHaveLength(1);
  });

  it('refuses a missing, wrong or tampered signature with 401, and nothing changes', async () => {
    const { order } = await place();
    stripe.succeed('pi_1');
    const good = stripe.intentEvent('payment_intent.succeeded', 'pi_1');
    const bad = [
      { rawBody: good.body, headers: {} },
      { rawBody: good.body, headers: { 'stripe-signature': 't=1,v1=deadbeef' } },
      { rawBody: Buffer.from(good.body.toString().replace('pi_1', 'pi_2')), headers: { 'stripe-signature': good.header } },
      { rawBody: undefined, headers: { 'stripe-signature': good.header } },
    ];
    for (const req of bad) await expect(controller.stripe(req as never)).rejects.toThrow(UnauthorizedException);
    expect((await payOf(order.id)).status).toBe('pending');
    expect((await orderRow(order.id)).status).toBe('pending');
  });

  it('trusts Stripe, not the event: an event for a PaymentIntent that did not succeed changes nothing', async () => {
    const { order } = await place();
    await hook(stripe.intentEvent('payment_intent.succeeded', 'pi_1')); // forged claim: the intent is still unpaid
    expect((await payOf(order.id)).status).toBe('pending');
    expect((await orderRow(order.id)).status).toBe('pending');
  });

  it('an amount that is not what we asked for is never paid: finance is told and the order stays pending', async () => {
    const { order } = await place();
    stripe.succeed('pi_1', 2998);
    await hook(stripe.intentEvent('payment_intent.succeeded', 'pi_1'));
    expect((await payOf(order.id)).status).toBe('pending');
    expect((await orderRow(order.id)).status).toBe('pending');
    expect(finance('Payment amount mismatch')[0].body).toBe(`${(await payOf(order.id)).reference}: provider reported $29.98, expected $29.99. Review manually.`);
  });

  it('a currency that is not USD is a mismatch too', async () => {
    const { order } = await place();
    stripe.succeed('pi_1', 2999, 'eur');
    await hook(stripe.intentEvent('payment_intent.succeeded', 'pi_1'));
    expect((await payOf(order.id)).status).toBe('pending');
    expect(finance('Payment amount mismatch')[0].body).toMatch(/card payment was made in EUR, expected USD/);
  });

  it('a declined attempt is not final: the reason is recorded, the payment stays pending, and another card can still pay', async () => {
    const { order } = await place();
    stripe.decline('pi_1', 'Your card has insufficient funds.');
    await hook(stripe.intentEvent('payment_intent.payment_failed', 'pi_1'));
    expect(await payOf(order.id)).toMatchObject({ status: 'pending', failureReason: 'Your card has insufficient funds.' });
    expect((await orderRow(order.id)).status).toBe('pending');
    expect(notes.some((n) => n.title === 'Payment failed')).toBe(false);
    expect(w.emitter.sent.some((e) => e.event === 'payment:updated' && e.payload.failureReason === 'Your card has insufficient funds.')).toBe(true);
    // the sheet can still be opened, and a second card works
    expect((await payments.cardSheet(customer.id, { orderId: order.id })).reference).toBe((await payOf(order.id)).reference);
    stripe.succeed('pi_1');
    await hook(stripe.intentEvent('payment_intent.succeeded', 'pi_1'));
    expect(await payOf(order.id)).toMatchObject({ status: 'succeeded', failureReason: null });
    expect((await orderRow(order.id)).status).toBe('confirmed');
  });

  it('payment_intent.canceled is final: the payment fails, the order is cancelled and the stock comes back', async () => {
    const { order, a, b } = await place();
    expect(await stock(a.id)).toBe(9);
    await stripe.cancelPaymentIntent('pi_1');
    await hook(stripe.intentEvent('payment_intent.canceled', 'pi_1'));
    expect(await payOf(order.id)).toMatchObject({ status: 'failed', failureReason: 'The card payment was cancelled.' });
    expect((await orderRow(order.id)).status).toBe('cancelled');
    expect(await stock(a.id)).toBe(10);
    expect(await stock(b.id)).toBe(10);
    expect(notes.find((n) => n.title === 'Payment failed')!.body).toBe('The card payment was cancelled.');
  });

  it('a success that arrives after the payment was given up goes to the wallet, once', async () => {
    const { order } = await place();
    const payment = await payOf(order.id);
    await payments.settle({ reference: payment.reference, outcome: 'failed', reason: 'Timed out waiting for the card payment.' });
    stripe.succeed('pi_1');
    await hook(stripe.intentEvent('payment_intent.succeeded', 'pi_1'));
    await hook(stripe.intentEvent('payment_intent.succeeded', 'pi_1'));
    expect(await payOf(order.id)).toMatchObject({ status: 'refunded', refundedUsd: 29.99, refundTo: 'wallet' });
    expect(await balance()).toBe(29.99);
    expect(await ledger()).toEqual([expect.objectContaining({ kind: 'late_payment', refundTo: 'wallet', amountUsd: 29.99 })]);
  });

  it('acknowledges events it does not act on and events about things that are not ours', async () => {
    expect(await hook(stripe.signedEvent('customer.created', { id: 'cus_1', object: 'customer' }))).toEqual({ received: true });
    expect(await hook(stripe.intentEvent('payment_intent.created', 'pi_1'))).toEqual({ received: true });
    expect(await hook(stripe.intentEvent('payment_intent.canceled', 'pi_unknown'))).toEqual({ received: true });
    expect(await hook(stripe.signedEvent('refund.updated', { id: 're_unknown', object: 'refund' }))).toEqual({ received: true });
  });

  it('lets Stripe retry when we could not read the PaymentIntent (an error, not a 200)', async () => {
    await place();
    stripe.failNext.retrieve = new StripeUnavailableError('down');
    await expect(hook(stripe.intentEvent('payment_intent.succeeded', 'pi_1'))).rejects.toThrow('down');
  });
});

describe('catching up when a webhook is missed', () => {
  const age = (id: string, minutes: number) => w.ds.getRepository(Payment).update({ id }, { createdAt: new Date(Date.now() - minutes * 60_000) });

  it('reconcilePending settles a card payment Stripe completed, once it is two minutes old', async () => {
    const { order } = await place();
    const payment = await payOf(order.id);
    stripe.succeed('pi_1');
    await payments.reconcilePending();
    expect((await payOf(order.id)).status).toBe('pending'); // too fresh to chase
    await age(payment.id, 3);
    await payments.reconcilePending();
    expect((await payOf(order.id)).status).toBe('succeeded');
    expect((await orderRow(order.id)).status).toBe('confirmed');
  });

  it('payments:status asks Stripe on the spot', async () => {
    const { order } = await place();
    const payment = await payOf(order.id);
    stripe.succeed('pi_1');
    const view = await payments.status({ id: customer.id, role: 'customer' }, payment.reference);
    expect(view).toMatchObject({ status: 'succeeded', refundToOriginal: 'card' });
    await expect(payments.status({ id: stranger.id, role: 'customer' }, payment.reference)).rejects.toThrow('Payment not found.');
  });

  it('expiry cancels the PaymentIntent of a card nobody completed (30 minutes by default) and cancels the order', async () => {
    const { order, a } = await place();
    const payment = await payOf(order.id);
    await age(payment.id, 29);
    expect(await payments.expireStale()).toBe(0);
    expect(stripe.cancelled).toEqual([]);
    await age(payment.id, 31);
    expect(await payments.expireStale()).toBe(1);
    expect(stripe.cancelled).toEqual(['pi_1']);
    expect(await payOf(order.id)).toMatchObject({ status: 'failed', failureReason: 'Timed out waiting for the card payment.' });
    expect((await orderRow(order.id)).status).toBe('cancelled');
    expect(await stock(a.id)).toBe(10);
    await expect(payments.cardSheet(customer.id, { orderId: order.id })).rejects.toThrow('This payment is not waiting for a card.');
  });

  it('the window is STRIPE_PENDING_TTL_MIN', async () => {
    process.env.STRIPE_PENDING_TTL_MIN = '5';
    const { order } = await place();
    await age((await payOf(order.id)).id, 6);
    expect(await payments.expireStale()).toBe(1);
    expect((await payOf(order.id)).status).toBe('failed');
  });

  it('if Stripe says the card was paid after all, expiry settles it as paid instead of cancelling', async () => {
    const { order } = await place();
    await age((await payOf(order.id)).id, 45);
    stripe.succeed('pi_1');
    await payments.expireStale();
    expect(stripe.cancelled).toEqual([]);
    expect((await payOf(order.id)).status).toBe('succeeded');
    expect((await orderRow(order.id)).status).toBe('confirmed');
  });

  it('a PaymentIntent that succeeds while being cancelled is settled as paid, and one still processing is left alone', async () => {
    const { order } = await place();
    const payment = await payOf(order.id);
    await age(payment.id, 45);
    stripe.cancelPaymentIntent = async (id: string) => {
      stripe.succeed(id); // the customer paid between our read and our cancel
      throw new StripeRejectedError('You cannot cancel this PaymentIntent because it has a status of succeeded.');
    };
    await payments.expireStale();
    expect((await payOf(order.id)).status).toBe('succeeded');

    const second = await place();
    const pay2 = await payOf(second.order.id);
    await age(pay2.id, 45);
    stripe.intents.get('pi_2')!.status = 'processing';
    stripe.cancelPaymentIntent = async () => {
      throw new StripeRejectedError('You cannot cancel this PaymentIntent because it has a status of processing.');
    };
    await payments.expireStale();
    expect((await payOf(second.order.id)).status).toBe('pending');
  });

  it('Stripe being unreachable during the sweep changes nothing', async () => {
    const { order } = await place();
    await age((await payOf(order.id)).id, 45);
    stripe.failNext.retrieve = new StripeUnavailableError('down');
    await payments.expireStale();
    expect((await payOf(order.id)).status).toBe('pending');
  });

  it('cancelling the order before paying cancels the PaymentIntent too', async () => {
    const { order } = await place();
    await orders.cancel({ id: customer.id, role: 'customer' }, order.id);
    expect(stripe.cancelled).toEqual(['pi_1']);
    expect((await payOf(order.id)).status).toBe('failed');
  });
});

describe('refunds back to the card', () => {
  it('refunds a Stripe card payment to the card: recorded at once, "sending" until Stripe confirms, then completed', async () => {
    const { order, payment } = await paid();
    expect(payments.refundToOriginal(payment)).toBe('card');
    const out = await payments.refund(order.id, false);
    expect(out).toMatchObject({ status: 'refunded', refundTo: 'card', refundStatus: 'sending', refundedUsd: 29.99, refundRef: 're_1' });
    expect(out.refund).toMatchObject({ amountUsd: 29.99, refundTo: 'card', status: 'sending', kind: 'admin', refundRef: 're_1' });
    expect(stripe.refundCalls).toEqual([
      expect.objectContaining({ paymentIntentId: 'pi_1', amountCents: 2999, idempotencyKey: expect.stringMatching(/^rfd_[0-9a-f-]{36}$/), metadata: expect.objectContaining({ reference: payment.reference }) }),
    ]);
    expect(stripe.refundCalls[0].idempotencyKey).toBe(stripe.refundCalls[0].metadata.refundRef);
    expect(await balance()).toBe(0); // not the wallet
    expect(notes.find((n) => n.title === 'Refund issued')!.body).toBe(`$29.99 for ${order.reference} is on its way back to your card.`);
    expect((await orderRow(order.id)).status).toBe('cancelled');

    stripe.settleRefund('re_1', 'succeeded');
    await hook(stripe.refundEvent('refund.updated', 're_1'));
    expect(await payOf(order.id)).toMatchObject({ refundStatus: 'completed', refundTo: 'card' });
    expect(await ledger()).toEqual([expect.objectContaining({ refundTo: 'card', status: 'completed', refundRef: 're_1' })]);
    expect(notes.find((n) => n.title === 'Refund sent')!.body).toBe(`$29.99 for ${order.reference} was sent back to your card.`);
    expect(await balance()).toBe(0);
  });

  it('charge.refunded and the sweep confirm a refund too', async () => {
    const { order } = await paid();
    await payments.refund(order.id, false);
    stripe.settleRefund('re_1', 'succeeded');
    await hook(stripe.signedEvent('charge.refunded', { id: 'ch_1', object: 'charge', payment_intent: 'pi_1' }));
    expect((await payOf(order.id)).refundStatus).toBe('completed');

    const second = await paid();
    await payments.refund(second.order.id, false);
    stripe.settleRefund('re_2', 'succeeded');
    await payments.reconcilePending();
    expect((await payOf(second.order.id)).refundStatus).toBe('completed');
  });

  it('while Stripe is still working the refund stays "sending"', async () => {
    const { order } = await paid();
    await payments.refund(order.id, false);
    await hook(stripe.refundEvent('refund.updated', 're_1'));
    await payments.reconcilePending();
    expect((await payOf(order.id)).refundStatus).toBe('sending');
  });

  it('when Stripe fails the refund the money goes to the wallet (once), the ledger says so, and finance is told', async () => {
    const { order, payment } = await paid();
    await payments.refund(order.id, false);
    stripe.settleRefund('re_1', 'failed', 'expired_or_canceled_card');
    await hook(stripe.refundEvent('refund.failed', 're_1'));
    await hook(stripe.refundEvent('refund.failed', 're_1'));
    await payments.reconcilePending();
    expect(await payOf(order.id)).toMatchObject({ refundStatus: 'failed', refundTo: 'wallet' });
    expect(await balance()).toBe(29.99);
    const txs = await w.ds.getRepository(WalletTransaction).find({ where: { userId: customer.id } });
    expect(txs).toHaveLength(1);
    expect(txs[0].description).toBe(`Refund for ${order.reference} (card refund failed)`);
    expect(await ledger()).toEqual([expect.objectContaining({ amountUsd: 29.99, refundTo: 'wallet', status: 'failed' })]);
    expect(notes.find((n) => n.title === 'Refund issued' && /wallet/.test(n.body))!.body).toBe(`$29.99 for ${order.reference} → wallet (the card refund could not be completed).`);
    expect(finance('Card refund failed')).toEqual([
      expect.objectContaining({ body: `${payment.reference}: Stripe could not refund $29.99 (expired_or_canceled_card). It was credited to the customer's wallet.` }),
    ]);
  });

  it('a canceled refund is a failed one', async () => {
    const { order } = await paid();
    await payments.refund(order.id, false);
    stripe.settleRefund('re_1', 'canceled');
    await hook(stripe.refundEvent('refund.updated', 're_1'));
    expect(await balance()).toBe(29.99);
  });

  it('when Stripe refuses the refund outright nothing is recorded and the wallet is still possible', async () => {
    const { order } = await paid();
    stripe.failNext.refund = new StripeRejectedError('Charge ch_1 has already been refunded.');
    await expect(payments.refund(order.id, false)).rejects.toThrow('Stripe refused the refund: Charge ch_1 has already been refunded.');
    expect(await payOf(order.id)).toMatchObject({ status: 'succeeded', refundTo: null, refundStatus: null, refundedUsd: null });
    expect(await ledger()).toEqual([]);
    expect((await payments.refund(order.id, true)).refund).toMatchObject({ refundTo: 'wallet', amountUsd: 29.99 });
  });

  it('when Stripe gives no answer the refund stands, and the sweep asks again with the same key until it has Stripe\'s id', async () => {
    const { order } = await paid();
    stripe.failNext.refund = new StripeUnavailableError('timeout');
    const out = await payments.refund(order.id, false);
    expect(out).toMatchObject({ refundTo: 'card', refundStatus: 'sending' });
    const key = out.refundRef!;
    expect(key).toMatch(/^rfd_/);
    await payments.reconcilePending();
    expect(stripe.refundCalls.map((c) => c.idempotencyKey)).toEqual([key, key]);
    expect(await payOf(order.id)).toMatchObject({ refundRef: 're_1', refundStatus: 'sending' });
    expect(await ledger()).toEqual([expect.objectContaining({ refundRef: 're_1', status: 'sending' })]);
    stripe.settleRefund('re_1', 'succeeded');
    await payments.reconcilePending();
    expect((await payOf(order.id)).refundStatus).toBe('completed');
  });

  it('without Stripe a card refund cannot be made (the message says why), but the wallet can', async () => {
    await build(false);
    const placed = await place();
    await w.ds.getRepository(Payment).update({ orderId: placed.order.id }, { status: 'succeeded', providerRef: 'pi_x' });
    await expect(payments.refund(placed.order.id, false)).rejects.toThrow("Refunds to the card need Stripe to be connected. Refund to the customer's wallet.");
  });

  it('the payment view tells the admin where an original-method refund would go', async () => {
    const { payment } = await paid();
    expect(payments.view(payment).refundToOriginal).toBe('card');
    expect(payments.view({ ...payment, providerRef: null } as Payment).refundToOriginal).toBeNull(); // the mock: no PaymentIntent
    expect(payments.view({ ...payment, method: 'wallet' } as Payment).refundToOriginal).toBeNull();
    expect(payments.view({ ...payment, method: 'airtel_money' } as Payment).refundToOriginal).toBeNull(); // no pawaPay here
    expect((await payments.list({ id: customer.id, role: 'customer' }))[0].refundToOriginal).toBe('card');
  });
});

describe('every other refund path with a card payment', () => {
  it('cancelling a paid order credits the wallet (explicitly) and never calls Stripe', async () => {
    const { order } = await paid();
    const back = await payments.refundCancelledOrder(await orderRow(order.id));
    expect(back).toBe(29.99);
    expect(await balance()).toBe(29.99);
    expect(await ledger()).toEqual([expect.objectContaining({ kind: 'cancellation', refundTo: 'wallet' })]);
    expect(stripe.refundCalls).toEqual([]);
  });

  it('a seller cancelling lines refunds the wallet and never calls Stripe', async () => {
    const { order, a } = await paid();
    const line = (await orderRow(order.id)).items.find((i) => i.productId === a.id)!;
    await orders.sellerCancel({ id: 'u-kt' }, order.id, 'Out of stock', [line.id]);
    expect(await balance()).toBe(19.99);
    expect(await ledger()).toEqual([expect.objectContaining({ kind: 'seller_cancel', refundTo: 'wallet', amountUsd: 19.99 })]);
    expect(stripe.refundCalls).toEqual([]);
  });

  it('a dispute decided for a refund "to the original method" goes to the card', async () => {
    const { order } = await paid();
    const out = await payments.refund(order.id, false, { kind: 'dispute', disputeId: 'd-1', disputeReference: 'DIS-1' });
    expect(out.refund).toMatchObject({ kind: 'dispute', refundTo: 'card', disputeId: 'd-1' });
  });

  it('a partial refund to the original method goes to the card, for exactly that amount', async () => {
    const { order } = await paid();
    const out = await partial.refund({ orderId: order.id, amountUsd: 10, toWallet: false, memo: 'Refund for SOM (returned items)', source: { kind: 'return', disputeId: 'd-1', disputeReference: 'RET-1' } });
    expect(out).toMatchObject({ refundedUsd: 10, to: 'card' });
    expect(out.refund).toMatchObject({ refundTo: 'card', status: 'sending', refundRef: 're_1', kind: 'return' });
    expect(stripe.refundCalls[0]).toMatchObject({ paymentIntentId: 'pi_1', amountCents: 1000 });
    expect(await payOf(order.id)).toMatchObject({ status: 'succeeded', refundedUsd: 10, refundTo: 'card', refundStatus: 'sending' });
    expect(await balance()).toBe(0);
    expect(notes.find((n) => n.title === 'Refund issued')!.body).toBe(`$10.00 for ${order.reference} is on its way back to your card.`);
    expect(w.emitter.sent.filter((e) => e.event === 'payment:updated').at(-1)!.payload.refundToOriginal).toBe('card');
  });

  it('a partial refund while another card refund is in flight, or to the wallet by choice, goes to the wallet', async () => {
    const { order } = await paid();
    await partial.refund({ orderId: order.id, amountUsd: 10, toWallet: false, memo: 'm' });
    const second = await partial.refund({ orderId: order.id, amountUsd: 5, toWallet: false, memo: 'm' });
    expect(second.to).toBe('wallet');
    const third = await partial.refund({ orderId: order.id, amountUsd: 2, toWallet: true, memo: 'm' });
    expect(third.to).toBe('wallet');
    expect(stripe.refundCalls).toHaveLength(1);
    expect(await balance()).toBe(7);
  });

  it('a partial refund Stripe refuses is undone and falls back to the wallet', async () => {
    const { order } = await paid();
    stripe.failNext.refund = new StripeRejectedError('Refund too old');
    const out = await partial.refund({ orderId: order.id, amountUsd: 10, toWallet: false, memo: 'm' });
    expect(out).toMatchObject({ to: 'wallet', refundedUsd: 10 });
    expect(await balance()).toBe(10);
    expect(await ledger()).toEqual([expect.objectContaining({ refundTo: 'wallet', amountUsd: 10 })]); // the refused one left no trace
    expect(await payOf(order.id)).toMatchObject({ refundedUsd: 10 });
  });
});

describe('the public settings carry cardPayments', () => {
  const rows = [
    { key: 'codEnabled', value: 'true' },
    { key: 'commissionPct', value: '12' },
  ];
  const service = () => {
    const sent: { roles: string[]; event: string; payload: any }[] = [];
    const repo = { find: async () => rows, save: async () => undefined, create: (x: unknown) => x };
    const emitter = { toRoles: (roles: string[], event: string, payload: unknown) => void sent.push({ roles, event, payload }) };
    return { svc: new SettingsService(repo as never, emitter as never), sent };
  };

  it('is "stripe" when the three keys are set, "off" otherwise, and never a stored setting', async () => {
    const { svc } = service();
    Object.assign(process.env, GOOD_ENV);
    expect(await svc.clientView()).toMatchObject({ codEnabled: 'true', cardPayments: 'stripe' });
    process.env.STRIPE_WEBHOOK_SECRET = '';
    expect(await svc.clientView()).toMatchObject({ codEnabled: 'true', cardPayments: 'off' });
    expect(await svc.publicView()).toEqual({ codEnabled: 'true' }); // the stored view is unchanged
    await expect(svc.set('cardPayments', 'stripe')).rejects.toThrow('Unknown setting.');
  });

  it('settings:get gives shoppers and guests the flag; admins keep reading the stored settings; settings:updated carries it', async () => {
    const { svc, sent } = service();
    Object.assign(process.env, GOOD_ENV);
    const gateway = Object.assign(Object.create(RealtimeGateway.prototype), { settings: svc, can: (role: string) => role === 'admin' });
    expect(await gateway.settingsGet({ data: {} })).toMatchObject({ ok: true, data: { codEnabled: 'true', cardPayments: 'stripe' } });
    expect(await gateway.settingsGet({ data: { user: { role: 'customer' } } })).toMatchObject({ data: { cardPayments: 'stripe' } });
    expect(await gateway.settingsGet({ data: { user: { role: 'admin' } } })).toEqual({ ok: true, data: { codEnabled: 'true', commissionPct: '12' } });
    await svc.set('codEnabled', 'true');
    expect(sent.find((s) => s.roles.includes('customer'))!.payload).toMatchObject({ codEnabled: 'true', cardPayments: 'stripe' });
    expect(sent.find((s) => s.roles.includes('admin'))!.payload).not.toHaveProperty('cardPayments');
  });
});
