import { DataSource } from 'typeorm';
import { DeliveryTask, Dispute, Hub, Order, OrderItem, Payment, PaymentRefund, Payout, Product, ProductView, Review, Seller, User, WalletTransaction, WarehouseBatch, Category } from '../database/entities';
import { PartialRefundService } from '../disputes/partial-refund.service';
import { CategoriesService } from '../catalog/categories.service';
import { AnalyticsService } from '../ops/analytics.service';
import { ProductsService } from '../products/products.service';
import { recordingEmitter, testDb, testTranslations } from '../testing/test-db';
import { WalletService } from '../wallet/wallet.service';
import { PaymentsService } from './payments.service';
import { NOTHING_LEFT_TO_REFUND, recordRefund, refundTooMuch, refundableUsd, revertRefund } from './refund-ledger';

/**
 * C-refund: every path that gives paid money back records it the same way (the `payment_refunds` ledger and the running
 * total `payments.refundedUsd`) and none can go past what was paid. The order is $63 (two lines, $60 of goods and $3
 * delivery) paid by card, the way clip 2 of the order-lifecycle videos has it: a $40 return refund leaves $23.
 */
let ds: DataSource;
let emitter: ReturnType<typeof recordingEmitter>;
let payments: PaymentsService;
let partial: PartialRefundService;
let user: User;
let order: Order;
let payment: Payment;
const admin = { id: 'admin-1', role: 'admin' };
const notices: { title: string; body: string }[] = [];

beforeEach(async () => {
  ds = await testDb();
  emitter = recordingEmitter();
  notices.length = 0;
  user = await ds.getRepository(User).save(ds.getRepository(User).create({ emailHash: 'h1', email: 'a@b.c', passwordHash: 'x', name: 'Marie', role: 'customer', walletBalance: 0 }));
  order = await ds.getRepository(Order).save(
    ds.getRepository(Order).create({
      reference: 'SOM-1',
      customerId: user.id,
      customerName: 'Marie',
      status: 'delivered',
      paymentMethod: 'stripe_card',
      subtotalUsd: 60,
      deliveryFeeUsd: 3,
      totalUsd: 63,
      items: [
        { productId: 'p1', productName: 'P1', variant: 'Default', qty: 2, priceUsd: 20 },
        { productId: 'p2', productName: 'P2', variant: 'Default', qty: 2, priceUsd: 10 },
      ] as OrderItem[],
    }),
  );
  payment = await ds.getRepository(Payment).save(
    ds.getRepository(Payment).create({ reference: 'PAY-1', orderId: order.id, orderReference: 'SOM-1', userId: user.id, method: 'stripe_card', amountUsd: 63, status: 'succeeded' }),
  );
  const wallet = new WalletService(ds.getRepository(User), ds.getRepository(WalletTransaction), emitter as never);
  const notifications = { toUser: async (_u: string, n: { title: string; body: string }) => void notices.push(n), toRole: async () => undefined };
  payments = new PaymentsService(
    ds.getRepository(Payment), ds.getRepository(Order), wallet, notifications as never, emitter as never, {} as never,
    { name: 'sandbox' } as never, ds.getRepository(DeliveryTask), { restock: async () => undefined } as never, null,
  );
  partial = new PartialRefundService(ds.getRepository(Payment), ds.getRepository(Order), ds.getRepository(OrderItem), wallet, payments, emitter as never, notifications as never, null);
});
afterEach(async () => ds.destroy());

const row = () => ds.getRepository(Payment).findOneByOrFail({ id: payment.id });
const ledger = () => ds.getRepository(PaymentRefund).find({ order: { createdAt: 'ASC', id: 'ASC' } });
const balance = async () => (await ds.getRepository(User).findOneByOrFail({ id: user.id })).walletBalance;
const returned = (usd = 40) =>
  partial.refund({ orderId: order.id, amountUsd: usd, toWallet: true, memo: 'Refund for SOM-1 (returned items)', source: { kind: 'return', disputeId: 'd-1', disputeReference: 'RET-0001' } });

describe('every path writes the same record', () => {
  it('a return refund (clip 2: $40 of $63) is on the payment and in the ledger, with the return it belongs to', async () => {
    const out = await returned();
    expect(out).toMatchObject({ refundedUsd: 40, to: 'wallet' });
    expect(await row()).toMatchObject({ status: 'succeeded', refundedUsd: 40, refundTo: 'wallet', refundStatus: 'completed' });
    expect(await ledger()).toEqual([
      expect.objectContaining({ paymentId: payment.id, orderId: order.id, orderReference: 'SOM-1', userId: user.id, amountUsd: 40, refundTo: 'wallet', status: 'completed', kind: 'return', disputeId: 'd-1', disputeReference: 'RET-0001', memo: 'Refund for SOM-1 (returned items)' }),
    ]);
    expect(await balance()).toBe(40);
  });

  it('what the admin pages read: the payment says what is refunded and what is left, the log lists the row (amount, method, date, return)', async () => {
    await returned();
    const view = (await payments.list(admin)).find((p) => p.id === payment.id)!;
    expect(view).toMatchObject({ status: 'succeeded', amountUsd: 63, refundedUsd: 40, refundableUsd: 23 });
    const log = await payments.refundLog(admin);
    expect(log).toEqual([expect.objectContaining({ amountUsd: 40, refundTo: 'wallet', kind: 'return', disputeReference: 'RET-0001', paymentReference: 'PAY-1', method: 'stripe_card' })]);
    expect(log[0].createdAt).toBeInstanceOf(Date);
    // the live push to finance carries the same figures
    const push = emitter.sent.find((e) => e.event === 'payment:updated' && e.to === 'admin,admin_finance')!.payload as { refundedUsd: number; refundableUsd: number };
    expect(push).toMatchObject({ refundedUsd: 40, refundableUsd: 23 });
  });

  it('only admin and finance read the ledger', async () => {
    await returned();
    await expect(payments.refundLog({ id: 'u', role: 'customer' })).rejects.toThrow('Only admin/finance');
    await expect(payments.refundLog({ id: 'u', role: 'seller' })).rejects.toThrow('Only admin/finance');
    expect(await payments.refundLog({ id: 'f', role: 'admin_finance' })).toHaveLength(1);
  });

  it('an admin refund (orders:refund) records itself and says what THIS refund paid back', async () => {
    const out = await payments.refund(order.id, true);
    expect(out.refund).toMatchObject({ amountUsd: 63, kind: 'admin', refundTo: 'wallet', disputeId: null });
    expect(out).toMatchObject({ status: 'refunded', refundedUsd: 63 });
    expect(await ledger()).toHaveLength(1);
    expect(await balance()).toBe(63);
  });

  it('a dispute decided by an admin names the dispute', async () => {
    const out = await payments.refund(order.id, true, { kind: 'dispute', disputeId: 'd-9', disputeReference: 'DIS-0009' });
    expect(out.refund).toMatchObject({ kind: 'dispute', disputeId: 'd-9', disputeReference: 'DIS-0009', amountUsd: 63 });
  });

  it('a cancellation records itself', async () => {
    const back = await payments.refundCancelledOrder(order);
    expect(back).toBe(63);
    expect(await ledger()).toEqual([expect.objectContaining({ kind: 'cancellation', amountUsd: 63, refundTo: 'wallet', memo: 'Refund for cancelled order SOM-1' })]);
    expect(await row()).toMatchObject({ status: 'refunded', refundedUsd: 63 });
    expect(await payments.refundCancelledOrder(order)).toBe(0); // a second call pays nothing and writes nothing
    expect(await ledger()).toHaveLength(1);
    expect(await balance()).toBe(63);
  });

  it('a mobile-money approval that arrives after the order was closed is parked in the wallet and recorded', async () => {
    await ds.getRepository(Payment).update({ id: payment.id }, { status: 'failed', method: 'airtel_money', providerRef: 'dep-1' });
    await payments.settle({ reference: 'PAY-1', outcome: 'succeeded', providerRef: 'dep-1', amountUsd: 63 });
    expect(await row()).toMatchObject({ status: 'refunded', refundedUsd: 63 });
    expect(await ledger()).toEqual([expect.objectContaining({ kind: 'late_payment', amountUsd: 63, refundTo: 'wallet' })]);
    expect(await balance()).toBe(63);
    await payments.settle({ reference: 'PAY-1', outcome: 'succeeded', providerRef: 'dep-1', amountUsd: 63 }); // a retried callback
    expect(await ledger()).toHaveLength(1);
    expect(await balance()).toBe(63);
  });
});

describe('the cap: no refund beyond amount paid - already refunded', () => {
  it('a full refund after a return pays only what is left, and a second one is refused (clip 2 double refund)', async () => {
    await returned(40);
    const rest = await payments.refund(order.id, true);
    expect(rest.refund.amountUsd).toBe(23);
    expect(await row()).toMatchObject({ status: 'refunded', refundedUsd: 63 });
    expect(await balance()).toBe(63); // 40 + 23, never 40 + 63
    await expect(payments.refund(order.id, true)).rejects.toThrow('Already refunded.');
    expect((await ledger()).map((r) => r.amountUsd).sort((a, b) => b - a)).toEqual([40, 23]); // (SQLite stamps seconds: order by amount)
  });

  it('a partial refund beyond what is left is refused with the amount that is left, and nothing moves', async () => {
    await returned(40);
    await expect(returned(30)).rejects.toThrow(refundTooMuch(23));
    await expect(returned(30)).rejects.toThrow('That is more than what is left to refund on this order ($23.00).');
    expect(await balance()).toBe(40);
    expect((await ledger()).map((r) => r.amountUsd)).toEqual([40]);
    expect((await row()).refundedUsd).toBe(40);
    // the exact rest is fine and closes the payment
    await returned(23);
    expect(await row()).toMatchObject({ status: 'refunded', refundedUsd: 63 });
    await expect(returned(1)).rejects.toThrow('Already refunded.');
  });

  it('a payment whose money is all gone but is still open says there is nothing left', async () => {
    await ds.getRepository(Payment).update({ id: payment.id }, { refundedUsd: 63 });
    await expect(payments.refund(order.id, true)).rejects.toThrow(NOTHING_LEFT_TO_REFUND);
    await expect(returned(5)).rejects.toThrow(NOTHING_LEFT_TO_REFUND);
    expect(await ledger()).toEqual([]);
    expect(await balance()).toBe(0);
  });

  it('refunds paid back on the order lines before the ledger existed still count (the larger of the two is the truth)', async () => {
    // a seller cancelled a $20 line in the old days: nothing on the payment, $20 on the line
    await ds.getRepository(OrderItem).update({ orderId: order.id, productId: 'p1' }, { refundedUsd: 20 });
    expect(refundableUsd(await row(), (await ds.getRepository(Order).findOneByOrFail({ id: order.id })).items)).toBe(43);
    await expect(returned(50)).rejects.toThrow(refundTooMuch(43));
    expect((await payments.refund(order.id, true)).refund.amountUsd).toBe(43);
  });

  it('the database enforces it too: a refund that skips the service check still cannot pass the total', async () => {
    const stale = await row(); // what a slow caller read before somebody else refunded
    await ds.transaction((m) => recordRefund(m, { payment: stale, amountUsd: 40, to: 'wallet', kind: 'return', disputeId: 'd-1', disputeReference: 'RET-0001' }));
    await expect(ds.transaction((m) => recordRefund(m, { payment: stale, amountUsd: 40, to: 'wallet', kind: 'admin' }))).rejects.toThrow(refundTooMuch(23));
    await expect(ds.transaction((m) => recordRefund(m, { payment: stale, amountUsd: 23.01, to: 'wallet', kind: 'admin' }))).rejects.toThrow(refundTooMuch(23));
    expect((await row()).refundedUsd).toBe(40);
    expect(await ledger()).toHaveLength(1);
    await ds.transaction((m) => recordRefund(m, { payment: stale, amountUsd: 23, to: 'wallet', kind: 'admin' }));
    expect(await row()).toMatchObject({ status: 'refunded', refundedUsd: 63 });
    await expect(ds.transaction((m) => recordRefund(m, { payment: stale, amountUsd: 0.01, to: 'wallet', kind: 'admin' }))).rejects.toThrow('Already refunded.');
  });

  it('a refund that fails after the guard rolls the whole record back (no row, no total, no money)', async () => {
    await expect(
      ds.transaction(async (m) => {
        await recordRefund(m, { payment, amountUsd: 40, to: 'wallet', kind: 'admin' });
        throw new Error('the wallet credit failed');
      }),
    ).rejects.toThrow('the wallet credit failed');
    expect((await row()).refundedUsd).toBeNull();
    expect(await ledger()).toEqual([]);
  });

  it('refuses zero, a payment that is not paid, and a payment that does not exist', async () => {
    await expect(ds.transaction((m) => recordRefund(m, { payment, amountUsd: 0, to: 'wallet', kind: 'admin' }))).rejects.toThrow('more than zero');
    await ds.getRepository(Payment).update({ id: payment.id }, { status: 'pending' });
    await expect(ds.transaction((m) => recordRefund(m, { payment, amountUsd: 5, to: 'wallet', kind: 'admin' }))).rejects.toThrow('Only a completed payment');
    await expect(ds.transaction((m) => recordRefund(m, { payment: { ...payment, id: 'nope' }, amountUsd: 5, to: 'wallet', kind: 'admin' }))).rejects.toThrow('No payment for this order.');
    expect(refundableUsd({ amountUsd: 63, refundedUsd: 0, status: 'pending' })).toBe(0);
  });

  it('a phone refund in flight is not overwritten by a later wallet refund, and undoing it frees the money', async () => {
    const stale = await row();
    const { entry } = await ds.transaction((m) => recordRefund(m, { payment: stale, amountUsd: 20, to: 'phone', kind: 'admin', refundRef: 'ref-1' }));
    await ds.transaction((m) => recordRefund(m, { payment: stale, amountUsd: 10, to: 'wallet', kind: 'return' }));
    expect(await row()).toMatchObject({ refundTo: 'phone', refundRef: 'ref-1', refundStatus: 'sending', refundedUsd: 30 });
    await ds.transaction((m) => revertRefund(m, entry));
    expect(await row()).toMatchObject({ status: 'succeeded', refundedUsd: 10, refundRef: null, refundStatus: null });
    expect((await ledger()).map((r) => [r.amountUsd, r.refundTo])).toEqual([[10, 'wallet']]);
  });
});

describe('finance counts every refund', () => {
  let analytics: AnalyticsService;
  beforeEach(() => {
    const translations = testTranslations(ds);
    const categories = new CategoriesService(ds.getRepository(Category), ds.getRepository(Product), emitter as never, translations);
    const products = new ProductsService(ds.getRepository(Product), ds.getRepository('FlashSale') as never, ds.getRepository(Seller), ds.getRepository('Campaign') as never, ds.getRepository(ProductView), emitter as never, categories, translations);
    const r = <T extends object>(e: new () => T) => ds.getRepository(e);
    analytics = new AnalyticsService(ds, r(Order), r(OrderItem), r(Payment), r(Product), r(User), r(Seller), r(Payout), r(Dispute), r(DeliveryTask), r(Review), r(ProductView), r(Hub), r(WarehouseBatch), { get: async () => '12' } as never, categories, products);
  });

  it('a return refund shows in Refunds (it used to read $0 because the payment stayed "succeeded")', async () => {
    expect(await analytics.financeStats()).toMatchObject({ refundsUsd: 0, refundsCount: 0 });
    await returned(40);
    const f = await analytics.financeStats();
    expect(f).toMatchObject({ refundsUsd: 40, refundsCount: 1 });
    expect(f.series30.reduce((t: number, d: { refunds: number }) => t + d.refunds, 0)).toBe(40);
  });

  it('all the paths add up, each payment counted once; a full refund after a return does not count the return twice', async () => {
    await returned(40);
    await payments.refund(order.id, true); // the rest: 23
    const other = await ds.getRepository(Order).save(ds.getRepository(Order).create({ reference: 'SOM-2', customerId: user.id, customerName: 'Marie', status: 'confirmed', paymentMethod: 'stripe_card', totalUsd: 10, items: [{ productId: 'p3', productName: 'P3', variant: 'Default', qty: 1, priceUsd: 10 }] as OrderItem[] }));
    await ds.getRepository(Payment).save(ds.getRepository(Payment).create({ reference: 'PAY-2', orderId: other.id, orderReference: 'SOM-2', userId: user.id, method: 'stripe_card', amountUsd: 10, status: 'succeeded' }));
    await payments.refundCancelledOrder(other);
    const f = await analytics.financeStats();
    expect(f).toMatchObject({ refundsUsd: 73, refundsCount: 2 });
  });
});
