import { DataSource } from 'typeorm';
import { Order, OrderItem, Payment, PaymentRefund, User, WalletTransaction } from '../database/entities';
import { PaymentsService } from '../payments/payments.service';
import { PawapayUnavailableError } from '../payments/pawapay.provider';
import { recordingEmitter, testDb } from '../testing/test-db';
import { WalletService } from '../wallet/wallet.service';
import { PartialRefundService } from './partial-refund.service';

let ds: DataSource;
let emitter: ReturnType<typeof recordingEmitter>;
let notices: { to: string; title: string; body: string }[];
let phoneOk: boolean;
let pawapay: { newId: () => string; refund: jest.Mock } | null;
let svc: PartialRefundService;

async function setup(over: { amount?: number; discount?: number; method?: string; providerRef?: string | null } = {}) {
  const user = await ds.getRepository(User).save(
    ds.getRepository(User).create({ emailHash: Math.random().toString(36), email: 'a@b.c', passwordHash: 'x', name: 'Marie', role: 'customer', walletBalance: 0 }),
  );
  const order = await ds.getRepository(Order).save(
    ds.getRepository(Order).create({
      reference: 'SOM-1',
      customerId: user.id,
      customerName: 'Marie',
      status: 'delivered',
      subtotalUsd: 60,
      discountUsd: over.discount ?? 0,
      deliveryFeeUsd: 3,
      totalUsd: 63 - (over.discount ?? 0),
      items: [
        { productId: 'p1', productName: 'P1', variant: 'Default', qty: 2, priceUsd: 20 },
        { productId: 'p2', productName: 'P2', variant: 'Default', qty: 2, priceUsd: 10 },
      ] as OrderItem[],
    }),
  );
  const payment = await ds.getRepository(Payment).save(
    ds.getRepository(Payment).create({
      reference: 'PAY-1',
      orderId: order.id,
      orderReference: 'SOM-1',
      userId: user.id,
      method: over.method ?? 'stripe_card',
      amountUsd: over.amount ?? order.totalUsd,
      status: 'succeeded',
      providerRef: over.providerRef === undefined ? 'dep-1' : over.providerRef,
    }),
  );
  return { user, order: (await ds.getRepository(Order).findOneBy({ id: order.id }))!, payment };
}

beforeEach(async () => {
  ds = await testDb();
  emitter = recordingEmitter();
  notices = [];
  phoneOk = false;
  pawapay = null;
  const wallet = new WalletService(ds.getRepository(User), ds.getRepository(WalletTransaction), emitter as never);
  const payments = {
    forOrder: (orderId: string) => ds.getRepository(Payment).findOne({ where: { orderId }, order: { createdAt: 'DESC' } }),
    canRefundToPhone: () => phoneOk,
  };
  const notifications = { toUser: async (to: string, n: { title: string; body: string }) => void notices.push({ to, ...n }) };
  const build = () =>
    new PartialRefundService(ds.getRepository(Payment), ds.getRepository(Order), ds.getRepository(OrderItem), wallet, payments as never, emitter as never, notifications as never, pawapay as never);
  svc = build();
  (svc as unknown as { rebuild: () => void }).rebuild = () => {
    svc = build();
  };
});
afterEach(async () => ds.destroy());

const rebuild = () => (svc as unknown as { rebuild: () => void }).rebuild();

describe('PartialRefundService', () => {
  it('worth(): price x qty, less the promo discount’s share', () => {
    expect(PartialRefundService.worth({ subtotalUsd: 60, discountUsd: 0 }, [{ unitPriceUsd: 20, qty: 2 }])).toBe(40);
    expect(PartialRefundService.worth({ subtotalUsd: 60, discountUsd: 6 }, [{ unitPriceUsd: 20, qty: 2 }])).toBe(36);
    expect(PartialRefundService.worth({ subtotalUsd: 0, discountUsd: 6 }, [{ unitPriceUsd: 20, qty: 2 }])).toBe(40);
    expect(PartialRefundService.worth({ subtotalUsd: 10, discountUsd: 50 }, [{ unitPriceUsd: 10, qty: 1 }])).toBe(0);
  });

  it('pays part of an order into the wallet, writes it on the lines and keeps the payment open', async () => {
    const { user, order } = await setup();
    const line = order.items.find((i) => i.productId === 'p1')!;
    const out = await svc.refund({ orderId: order.id, amountUsd: 40, toWallet: true, memo: 'Refund for SOM-1 (returned items)', lines: [{ orderItemId: line.id, usd: 40 }] });
    expect(out).toMatchObject({ refundedUsd: 40, to: 'wallet' });
    expect((await ds.getRepository(User).findOneBy({ id: user.id }))!.walletBalance).toBe(40);
    const tx = await ds.getRepository(WalletTransaction).find({ where: { userId: user.id } });
    expect(tx).toHaveLength(1);
    expect(tx[0]).toMatchObject({ type: 'refund', amount: 40, description: 'Refund for SOM-1 (returned items)' });
    expect((await ds.getRepository(OrderItem).findOneBy({ id: line.id }))!.refundedUsd).toBe(40);
    expect((await ds.getRepository(Payment).findOneBy({ orderId: order.id }))!.status).toBe('succeeded');
    expect(await svc.outstanding(order.id)).toBe(23);
    // C-refund: recorded on the payment (running total) and in the ledger, the way every refund path does
    expect((await ds.getRepository(Payment).findOneBy({ orderId: order.id }))!.refundedUsd).toBe(40);
    expect(await ds.getRepository(PaymentRefund).find()).toEqual([expect.objectContaining({ amountUsd: 40, refundTo: 'wallet', status: 'completed', kind: 'dispute', disputeId: null })]);
    expect(notices).toEqual([expect.objectContaining({ to: user.id, title: 'Refund issued', body: '$40.00 for SOM-1 → wallet.', type: 'payment', entityId: order.id })]);
    expect(emitter.sent.some((e) => e.event === 'payment:updated' && e.to === `user:${user.id}`)).toBe(true);
  });

  it('never pays back more than is left, across several refunds', async () => {
    const { order } = await setup();
    await svc.refund({ orderId: order.id, amountUsd: 40, toWallet: true, memo: 'm' });
    await expect(svc.refund({ orderId: order.id, amountUsd: 30, toWallet: true, memo: 'm' })).rejects.toThrow('more than what is left to refund on this order ($23.00)');
    await svc.refund({ orderId: order.id, amountUsd: 23, toWallet: true, memo: 'm' });
    expect(await ds.getRepository(Payment).findOneBy({ orderId: order.id })).toMatchObject({ status: 'refunded', refundedUsd: 63 });
    await expect(svc.refund({ orderId: order.id, amountUsd: 1, toWallet: true, memo: 'm' })).rejects.toThrow('Already refunded.');
  });

  it('spreads an amount named on no line over what is still refundable on each line', async () => {
    const { order } = await setup();
    await svc.refund({ orderId: order.id, amountUsd: 30, toWallet: true, memo: 'm' });
    const lines = await ds.getRepository(OrderItem).find({ where: { orderId: order.id } });
    const total = lines.reduce((t, l) => t + l.refundedUsd, 0);
    expect(Math.round(total * 100) / 100).toBe(30);
    expect(lines.every((l) => l.refundedUsd <= l.priceUsd * l.qty)).toBe(true);
  });

  it('refuses nothing-to-refund, unpaid payments and unknown orders', async () => {
    const { order, payment } = await setup();
    await expect(svc.refund({ orderId: order.id, amountUsd: 0, toWallet: true, memo: 'm' })).rejects.toThrow('more than zero');
    await ds.getRepository(Payment).update({ id: payment.id }, { status: 'pending' });
    await expect(svc.refund({ orderId: order.id, amountUsd: 5, toWallet: true, memo: 'm' })).rejects.toThrow('Only a completed payment');
    await expect(svc.refund({ orderId: 'nope', amountUsd: 5, toWallet: true, memo: 'm' })).rejects.toThrow('No payment for this order.');
    expect(await svc.outstanding(order.id)).toBe(0);
  });

  it('a phone refund goes through pawaPay, once; the money is "sending" until pawaPay confirms', async () => {
    phoneOk = true;
    pawapay = { newId: () => 'ref-1', refund: jest.fn(async () => undefined) };
    rebuild();
    const { order, user } = await setup({ method: 'airtel_money' });
    const out = await svc.refund({ orderId: order.id, amountUsd: 20, toWallet: false, memo: 'm' });
    expect(out.to).toBe('phone');
    expect(pawapay.refund).toHaveBeenCalledWith({ refundId: 'ref-1', depositId: 'dep-1', amountUsd: 20, reference: 'PAY-1' });
    const pay = (await ds.getRepository(Payment).findOneBy({ orderId: order.id }))!;
    expect(pay).toMatchObject({ refundTo: 'phone', refundRef: 'ref-1', refundStatus: 'sending', refundedUsd: 20, status: 'succeeded' });
    expect((await ds.getRepository(User).findOneBy({ id: user.id }))!.walletBalance).toBe(0);
    expect(notices[0].body).toContain('mobile-money number');
    // a second phone refund cannot reuse the single refund slot: it goes to the wallet
    const second = await svc.refund({ orderId: order.id, amountUsd: 5, toWallet: false, memo: 'm' });
    expect(second.to).toBe('wallet');
  });

  it('asks for the phone but cannot: the customer gets it in the wallet', async () => {
    phoneOk = false;
    const { order, user } = await setup();
    const out = await svc.refund({ orderId: order.id, amountUsd: 10, toWallet: false, memo: 'm' });
    expect(out.to).toBe('wallet');
    expect((await ds.getRepository(User).findOneBy({ id: user.id }))!.walletBalance).toBe(10);
  });

  it('pawaPay refuses: everything is undone and the money goes to the wallet instead', async () => {
    phoneOk = true;
    pawapay = { newId: () => 'ref-2', refund: jest.fn(async () => { throw new Error('rejected by the network'); }) };
    rebuild();
    const { order, user } = await setup({ method: 'airtel_money' });
    const out = await svc.refund({ orderId: order.id, amountUsd: 20, toWallet: false, memo: 'm' });
    expect(out.to).toBe('wallet');
    expect((await ds.getRepository(User).findOneBy({ id: user.id }))!.walletBalance).toBe(20);
    const lines = await ds.getRepository(OrderItem).find({ where: { orderId: order.id } });
    expect(lines.reduce((t, l) => t + l.refundedUsd, 0)).toBe(20); // once, not twice
    expect((await ds.getRepository(Payment).findOneBy({ orderId: order.id }))!.refundTo).not.toBe('phone');
  });

  it('pawaPay gives no answer: the refund stands and the status check settles it', async () => {
    phoneOk = true;
    pawapay = { newId: () => 'ref-3', refund: jest.fn(async () => { throw new PawapayUnavailableError('timeout'); }) };
    rebuild();
    const { order } = await setup({ method: 'airtel_money' });
    const out = await svc.refund({ orderId: order.id, amountUsd: 20, toWallet: false, memo: 'm' });
    expect(out.to).toBe('phone');
    expect((await ds.getRepository(Payment).findOneBy({ orderId: order.id }))!.refundStatus).toBe('sending');
  });

  it('what a full refund may still pay back accounts for the partial one (PaymentsService.outstanding)', async () => {
    const { order } = await setup();
    await svc.refund({ orderId: order.id, amountUsd: 40, toWallet: true, memo: 'm' });
    const fresh = (await ds.getRepository(Order).findOneBy({ id: order.id }))!;
    expect(PaymentsService.outstanding(63, fresh)).toBe(23);
  });
});
