import { DataSource } from 'typeorm';
import { DeliveryTask, Order, OrderItem, Payment, PaymentRefund, User, WalletTransaction } from '../database/entities';
import { PartialRefundService } from '../disputes/partial-refund.service';
import { recordingEmitter, testDb } from '../testing/test-db';
import { WalletService } from '../wallet/wallet.service';
import { WALLET_OFF, WALLET_OFF_REFUND_NO_ROUTE } from '../wallet/wallet-switch';
import { PawapayUnavailableError } from './pawapay.provider';
import { PaymentsService } from './payments.service';

/**
 * The wallet switch (`settings.walletEnabled`): while it is OFF the wallet cannot be paid with, topped up or used to buy a plan;
 * a refund of a payment that was NOT made with the wallet goes back to the phone / card (never into the wallet); a payment made
 * with the wallet still refunds into it; balances are never touched. Switched on again, everything is as it was.
 */
let ds: DataSource;
let payments: PaymentsService;
let partial: PartialRefundService;
let user: User;
let order: Order;
const settings: Record<string, string> = {};
const sent: { refundId: string; depositId: string; amountUsd: number }[] = [];
let pawapayAnswer: 'ok' | 'rejected' | 'unavailable' = 'ok';
const pawapay = {
  newId: () => `ref-${sent.length + 1}-${Math.random().toString(16).slice(2, 8)}`,
  refund: async (r: { refundId: string; depositId: string; amountUsd: number }) => {
    if (pawapayAnswer === 'rejected') throw new Error('rejected by the network');
    if (pawapayAnswer === 'unavailable') throw new PawapayUnavailableError('no answer');
    sent.push(r);
  },
};

const pay = (over: Partial<Payment> = {}) =>
  ds.getRepository(Payment).save(
    ds.getRepository(Payment).create({ reference: `PAY-${Math.random().toString(36).slice(2, 8)}`, orderId: order.id, orderReference: 'SOM-1', userId: user.id, method: 'airtel_money', providerRef: 'dep-1', amountUsd: 50, status: 'succeeded', ...over }),
  );
const balance = async () => (await ds.getRepository(User).findOneByOrFail({ id: user.id })).walletBalance;
const ledger = () => ds.getRepository(PaymentRefund).find({ order: { createdAt: 'ASC', id: 'ASC' } });

beforeEach(async () => {
  ds = await testDb();
  for (const k of Object.keys(settings)) delete settings[k];
  sent.length = 0;
  pawapayAnswer = 'ok';
  user = await ds.getRepository(User).save(ds.getRepository(User).create({ emailHash: 'h1', email: 'a@b.c', passwordHash: 'x', name: 'Marie', role: 'customer', walletBalance: 5 }));
  order = await ds.getRepository(Order).save(
    ds.getRepository(Order).create({
      reference: 'SOM-1', customerId: user.id, customerName: 'Marie', status: 'confirmed', paymentMethod: 'airtel_money', subtotalUsd: 50, deliveryFeeUsd: 0, totalUsd: 50,
      items: [{ productId: 'p1', productName: 'P1', variant: 'Default', qty: 1, priceUsd: 50 }] as OrderItem[],
    }),
  );
  const emitter = recordingEmitter();
  const wallet = new WalletService(ds.getRepository(User), ds.getRepository(WalletTransaction), emitter as never);
  const notifications = { toUser: async () => undefined, toRole: async () => undefined };
  payments = new PaymentsService(
    ds.getRepository(Payment), ds.getRepository(Order), wallet, notifications as never, emitter as never, { get: async (k: string) => settings[k] ?? null } as never,
    { name: 'pawapay' } as never, ds.getRepository(DeliveryTask), { restock: async () => undefined } as never, pawapay as never,
  );
  partial = new PartialRefundService(ds.getRepository(Payment), ds.getRepository(Order), ds.getRepository(OrderItem), wallet, payments, emitter as never, notifications as never, pawapay as never);
});
afterEach(async () => ds.destroy());

describe('wallet off: the wallet cannot be used', () => {
  it('pay with wallet, top-up and a plan paid from the wallet are refused with the clear sentence', async () => {
    settings.walletEnabled = 'false';
    await expect(payments.assertMethodAllowed('wallet')).rejects.toThrow(WALLET_OFF);
    await expect(payments.startTopUp(user.id, 10, 'airtel_money', '+243812345678')).rejects.toThrow(WALLET_OFF);
    await expect(payments.startPlanPayment(user.id, { id: 'pro', priceUsd: 5 }, 'wallet', null)).rejects.toThrow(WALLET_OFF);
    expect(await balance()).toBe(5); // untouched
  });

  it('on (stored true, or never stored): pay with wallet is allowed and a wallet plan purchase charges the balance', async () => {
    await expect(payments.assertMethodAllowed('wallet')).resolves.toBeUndefined();
    settings.walletEnabled = 'true';
    await expect(payments.assertMethodAllowed('wallet')).resolves.toBeUndefined();
    await payments.startPlanPayment(user.id, { id: 'pro', priceUsd: 5 }, 'wallet', null);
    expect(await balance()).toBe(0);
  });
});

describe('wallet off: refunds', () => {
  it('an admin refund of a mobile-money order goes to the phone, whatever was asked, and the wallet is untouched', async () => {
    settings.walletEnabled = 'false';
    const p = await pay();
    const out = await payments.refund(order.id, true);
    expect(out.refund).toMatchObject({ refundTo: 'phone', amountUsd: 50, status: 'sending' });
    expect(sent).toEqual([expect.objectContaining({ depositId: 'dep-1', amountUsd: 50 })]);
    expect(await balance()).toBe(5);
    expect(await ds.getRepository(Payment).findOneByOrFail({ id: p.id })).toMatchObject({ refundTo: 'phone', refundStatus: 'sending' });
  });

  it('a payment made WITH the wallet still refunds into the wallet', async () => {
    settings.walletEnabled = 'false';
    await pay({ method: 'wallet', providerRef: null });
    const out = await payments.refund(order.id, true);
    expect(out.refund).toMatchObject({ refundTo: 'wallet', amountUsd: 50 });
    expect(sent).toHaveLength(0);
    expect(await balance()).toBe(55);
  });

  it('a payment that cannot go back automatically (no provider reference) is refused with the clear sentence; nothing moves', async () => {
    settings.walletEnabled = 'false';
    await pay({ method: 'stripe_card', providerRef: null });
    await expect(payments.refund(order.id, true)).rejects.toThrow(WALLET_OFF_REFUND_NO_ROUTE);
    expect(await balance()).toBe(5);
    expect(await ledger()).toHaveLength(0);
  });

  it('switched back on, the same refund goes to the wallet again', async () => {
    settings.walletEnabled = 'false';
    await pay();
    settings.walletEnabled = 'true';
    const out = await payments.refund(order.id, true);
    expect(out.refund.refundTo).toBe('wallet');
    expect(sent).toHaveLength(0);
    expect(await balance()).toBe(55);
  });

  it('cancelling a paid order goes to the phone; a second call pays nothing', async () => {
    settings.walletEnabled = 'false';
    await pay();
    expect(await payments.refundCancelledOrder(order)).toBe(50);
    expect(sent).toHaveLength(1);
    expect(await ledger()).toEqual([expect.objectContaining({ kind: 'cancellation', refundTo: 'phone', amountUsd: 50 })]);
    expect(await balance()).toBe(5);
    expect(await payments.refundCancelledOrder(order)).toBe(0);
  });

  it('a cancellation whose phone refund is refused falls back to the wallet, once, and the ledger shows only the wallet refund', async () => {
    settings.walletEnabled = 'false';
    pawapayAnswer = 'rejected';
    await pay();
    expect(await payments.refundCancelledOrder(order)).toBe(50);
    expect(await ledger()).toEqual([expect.objectContaining({ refundTo: 'wallet', amountUsd: 50, status: 'completed' })]);
    expect(await balance()).toBe(55);
  });

  it('a cancellation of an order that cannot be refunded automatically still credits the wallet (the money is never lost)', async () => {
    settings.walletEnabled = 'false';
    await pay({ method: 'stripe_card', providerRef: null });
    expect(await payments.refundCancelledOrder(order)).toBe(50);
    expect(await balance()).toBe(55);
  });

  it('a late mobile-money approval goes back to the phone instead of being parked in the wallet', async () => {
    settings.walletEnabled = 'false';
    const p = await pay({ status: 'failed' });
    await payments.settle({ reference: p.reference, outcome: 'succeeded', providerRef: 'dep-1', amountUsd: 50 });
    expect(sent).toHaveLength(1);
    expect(await ledger()).toEqual([expect.objectContaining({ kind: 'late_payment', refundTo: 'phone', amountUsd: 50 })]);
    expect(await ds.getRepository(Payment).findOneByOrFail({ id: p.id })).toMatchObject({ status: 'refunded', refundedUsd: 50 });
    expect(await balance()).toBe(5);
  });

  it('a part refund (a return or a dispute) goes to the phone; when the network refuses it the wallet gets it, with no loop', async () => {
    settings.walletEnabled = 'false';
    await pay();
    const out = await partial.refund({ orderId: order.id, amountUsd: 20, toWallet: true, memo: 'Refund for SOM-1 (returned items)', source: { kind: 'return', disputeId: 'd-1', disputeReference: 'RET-0001' } });
    expect(out).toMatchObject({ to: 'phone', refundedUsd: 20 });
    expect(await balance()).toBe(5);
    // a second refund while the first is still in flight cannot go to the same phone refund slot: the wallet gets it (never lost)
    const second = await partial.refund({ orderId: order.id, amountUsd: 10, toWallet: true, memo: 'Refund for SOM-1 (dispute)', source: { kind: 'dispute', disputeId: 'd-2', disputeReference: 'DIS-0002' } });
    expect(second.to).toBe('wallet');
    expect(await balance()).toBe(15);
  });

  it('a refused part refund falls back to the wallet', async () => {
    settings.walletEnabled = 'false';
    pawapayAnswer = 'rejected';
    await pay();
    const out = await partial.refund({ orderId: order.id, amountUsd: 20, toWallet: true, memo: 'Refund for SOM-1 (dispute)', source: { kind: 'dispute', disputeId: 'd-1', disputeReference: 'DIS-0001' } });
    expect(out.to).toBe('wallet');
    expect(await balance()).toBe(25);
    expect((await ledger()).map((l) => l.refundTo)).toEqual(['wallet']);
  });

  it('wallet ON keeps the old behaviour: a part refund asked to the wallet is paid into the wallet', async () => {
    await pay();
    const out = await partial.refund({ orderId: order.id, amountUsd: 20, toWallet: true, memo: 'Refund', source: { kind: 'dispute', disputeId: 'd-1', disputeReference: 'DIS-0001' } });
    expect(out.to).toBe('wallet');
    expect(sent).toHaveLength(0);
    expect(await balance()).toBe(25);
  });
});

describe('wallet off: an exchange that gives money back', () => {
  it('the cheaper item pays its difference back to the phone through the registered refunder; wallet orders and a wallet that is on say no', async () => {
    const p = await pay();
    const out = await (partial as unknown as { refundExchangeDifference: (ex: { orderId: string; reference: string }, usd: number) => Promise<boolean> }).refundExchangeDifference({ orderId: order.id, reference: 'EXC-1' }, 12);
    expect(out).toBe(false); // wallet on: the exchange credits the wallet itself
    settings.walletEnabled = 'false';
    const done = await (partial as unknown as { refundExchangeDifference: (ex: { orderId: string; reference: string }, usd: number) => Promise<boolean> }).refundExchangeDifference({ orderId: order.id, reference: 'EXC-1' }, 12);
    expect(done).toBe(true);
    expect(await ledger()).toEqual([expect.objectContaining({ kind: 'exchange', refundTo: 'phone', amountUsd: 12 })]);
    expect(await ds.getRepository(Payment).findOneByOrFail({ id: p.id })).toMatchObject({ refundedUsd: 12 });
    expect(await balance()).toBe(5);
    // the order lines were not touched (the difference belongs to no line)
    expect((await ds.getRepository(Order).findOneByOrFail({ id: order.id })).items?.[0].refundedUsd ?? 0).toBe(0);
  });

  it('an order paid with the wallet leaves the difference to the wallet credit', async () => {
    settings.walletEnabled = 'false';
    await pay({ method: 'wallet', providerRef: null });
    const done = await (partial as unknown as { refundExchangeDifference: (ex: { orderId: string; reference: string }, usd: number) => Promise<boolean> }).refundExchangeDifference({ orderId: order.id, reference: 'EXC-1' }, 12);
    expect(done).toBe(false);
  });
});
