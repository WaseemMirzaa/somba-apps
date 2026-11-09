import { DataSource } from 'typeorm';
import { DeliveryTask, Order, OrderItem, Payment, Payout, PayoutStatementLine, Product, User, WalletTransaction } from '../database/entities';
import { PartialRefundService } from '../disputes/partial-refund.service';
import { PaymentsService } from '../payments/payments.service';
import { recordingEmitter, testDb } from '../testing/test-db';
import { WalletService } from '../wallet/wallet.service';
import { PayoutsService } from './payouts.service';

/**
 * SL-01: money refunded to a customer on a DELIVERED order that stays delivered (a return of some units, an admin's
 * partial refund on a dispute) comes off the seller's balance and payout statements, with the commission on it given
 * back pro rata. Real services on a real (in-memory SQLite) schema; refunds go through the real refund paths.
 *
 * The audit case: 3 x $20 at 12% commission ($7.20) = $52.80 to the seller; the customer returns 2 units ($40 back).
 * The seller keeps 1 unit: $20 - $2.40 = $17.60.
 */
let ds: DataSource;
let svc: PayoutsService;
let payments: PaymentsService;
let partial: PartialRefundService;
let customer: User;
const SELLER = { id: 'u-seller', name: 'Store One' };
const settings: Record<string, string> = {};
let seq = 0;

beforeEach(async () => {
  ds = await testDb();
  const emitter = recordingEmitter();
  Object.assign(settings, { commissionPct: '12', payoutClearanceHours: '0', minPayoutUsd: '5' });
  const notifications = { toUser: async () => undefined, toRole: async () => undefined, toAdmins: async () => undefined };
  const wallet = new WalletService(ds.getRepository(User), ds.getRepository(WalletTransaction), emitter as never);
  svc = new PayoutsService(
    ds.getRepository(Payout),
    ds.getRepository(Order),
    ds.getRepository(Product),
    ds.getRepository('Seller') as never,
    { get: async (k: string) => settings[k] ?? null } as never,
    wallet,
    notifications as never,
    emitter as never,
    ds.getRepository(PayoutStatementLine),
  );
  payments = new PaymentsService(
    ds.getRepository(Payment), ds.getRepository(Order), wallet, notifications as never, emitter as never, {} as never,
    { name: 'sandbox' } as never, ds.getRepository(DeliveryTask), { restock: async () => undefined } as never, null,
  );
  partial = new PartialRefundService(ds.getRepository(Payment), ds.getRepository(Order), ds.getRepository(OrderItem), wallet, payments, emitter as never, notifications as never, null);
  customer = await ds.getRepository(User).save(ds.getRepository(User).create({ emailHash: 'h1', email: 'c@b.c', passwordHash: 'x', name: 'Marie', role: 'customer', walletBalance: 0 }));
  await ds.getRepository(User).insert(ds.getRepository(User).create({ id: SELLER.id, emailHash: 'h2', email: 's@b.c', passwordHash: 'x', name: 'Store One', role: 'seller', walletBalance: 0 }));
  await ds.getRepository(Product).insert({ id: 'p1', name: 'Lamp', price: 20, sellerId: SELLER.id });
});
afterEach(async () => ds.destroy());

/**
 * A delivered, wallet-paid order of one line of the seller's: `qty` x `price`, commission `pct`% stored on the line,
 * a $3 delivery fee, and optionally a platform promo (`promo`, off the order) or a store coupon (`coupon`, on the line).
 */
async function sell(price: number, qty: number, opts: { pct?: number; promo?: number; coupon?: number } = {}) {
  const pct = opts.pct ?? 12;
  const subtotal = Number((price * qty).toFixed(2));
  const coupon = opts.coupon ?? 0;
  const discount = Number(((opts.promo ?? 0) + coupon).toFixed(2));
  const total = Number((subtotal - discount + 3).toFixed(2));
  const n = ++seq;
  const order = await ds.getRepository(Order).save(
    ds.getRepository(Order).create({
      reference: `SOM-${n}`,
      customerId: customer.id,
      customerName: 'Marie',
      status: 'delivered',
      paymentMethod: 'wallet',
      subtotalUsd: subtotal,
      discountUsd: discount,
      deliveryFeeUsd: 3,
      totalUsd: total,
      items: [
        Object.assign(new OrderItem(), {
          productId: 'p1',
          productName: 'Lamp',
          variant: 'Default',
          qty,
          priceUsd: price,
          sellerId: SELLER.id,
          fulfilment: 'received',
          couponDiscountUsd: coupon,
          commissionPct: pct,
          commissionUsd: Number((((subtotal - coupon) * pct) / 100).toFixed(2)),
        }),
      ],
    }),
  );
  await ds.getRepository(Payment).save(
    ds.getRepository(Payment).create({ reference: `PAY-${n}`, orderId: order.id, orderReference: order.reference, userId: customer.id, method: 'wallet', amountUsd: total, status: 'succeeded' }),
  );
  return { order, item: order.items[0] };
}

/** A return: the units' worth goes back to the customer's wallet and onto the line (what DisputesService does). */
const returnUnits = (o: { order: Order; item: OrderItem }, usd: number) =>
  partial.refund({
    orderId: o.order.id,
    amountUsd: usd,
    toWallet: true,
    memo: `Refund for ${o.order.reference} (returned items)`,
    lines: [{ orderItemId: o.item.id, usd }],
    source: { kind: 'return', disputeId: `d-${o.order.id}`, disputeReference: 'RET-1' },
  });
/** An admin deciding a dispute with a partial refund (no lines named: spread over the order). */
const disputeRefund = (o: { order: Order }, usd: number) =>
  partial.refund({ orderId: o.order.id, amountUsd: usd, toWallet: true, memo: 'Dispute refund', source: { kind: 'dispute', disputeId: 'd-x', disputeReference: 'DIS-1' } });

const statementOf = (id: string) => svc.statement(id, { id: SELLER.id, role: 'seller' });
const payAndApprove = async (usd: number) => {
  const p = await svc.request(SELLER, usd, 'wallet');
  return svc.approve(p.id);
};

describe('SL-01: a partial refund on a delivered order comes off the seller', () => {
  it('a return of 2 of 3 units: the balance keeps 1 unit, the full amount cannot be withdrawn, the statement shows the refund', async () => {
    const o = await sell(20, 3);
    expect(await svc.available(SELLER.id)).toMatchObject({ earned: 52.8, available: 52.8, commissionUsd: 7.2 });

    await returnUnits(o, 40);
    expect((await ds.getRepository(User).findOneByOrFail({ id: customer.id })).walletBalance).toBe(40);
    // $40 of goods back = $40 gross and $4.80 of commission given back: the seller loses $35.20.
    expect(await svc.available(SELLER.id)).toMatchObject({ earned: 17.6, available: 17.6, commissionUsd: 2.4, owedUsd: 0 });

    await expect(svc.request(SELLER, 52.8, 'wallet')).rejects.toThrow(/withdraw up to \$17\.60/);
    const p = await svc.request(SELLER, 17.6, 'wallet');
    expect(p).toMatchObject({ statementGrossUsd: 60, statementCommissionUsd: 7.2, statementRefundsUsd: 35.2, statementNetUsd: 17.6, openingBalanceUsd: 0, closingBalanceUsd: 0 });
    const st = await statementOf(p.id);
    expect(st.lines).toHaveLength(1);
    expect(st.lines[0]).toMatchObject({ kind: 'sale', orderId: o.order.id, grossUsd: 60, commissionUsd: 7.2, refundUsd: 35.2, netUsd: 17.6 });
    expect(st.totals).toMatchObject({ grossUsd: 60, commissionUsd: 7.2, refundsUsd: 35.2, netUsd: 17.6, amountUsd: 17.6 });
  });

  it('a refund AFTER the payout: the balance goes negative by what was overpaid, and the next statement deducts it once', async () => {
    const o = await sell(20, 3);
    await payAndApprove(52.8);
    await returnUnits(o, 40);
    expect(await svc.available(SELLER.id)).toMatchObject({ earned: 17.6, committed: 52.8, available: -35.2, owedUsd: 35.2 });
    await expect(svc.request(SELLER, 10, 'wallet')).rejects.toThrow(/-\$35\.20/);

    await sell(100, 1); // net 88 -> 52.80 available
    expect((await svc.available(SELLER.id)).available).toBe(52.8);
    const p2 = await svc.request(SELLER, 52.8, 'wallet');
    const st = await statementOf(p2.id);
    expect(st.lines.find((l) => l.kind === 'refund')).toMatchObject({ orderId: o.order.id, refundUsd: 35.2, netUsd: -35.2, grossUsd: 0 });
    expect(st.lines.find((l) => l.kind === 'sale')).toMatchObject({ grossUsd: 100, commissionUsd: 12, netUsd: 88 });
    expect(st.totals).toMatchObject({ grossUsd: 100, commissionUsd: 12, refundsUsd: 35.2, netUsd: 52.8, openingBalanceUsd: 0, closingBalanceUsd: 0 });

    // Deducted once: the next statement has no refund line for it.
    await sell(50, 1); // net 44
    const p3 = await svc.request(SELLER, 44, 'wallet');
    expect(p3).toMatchObject({ statementRefundsUsd: 0, statementNetUsd: 44 });
    expect((await statementOf(p3.id)).lines.map((l) => l.kind)).toEqual(['sale']);
  });

  it('a refund while the payout is still awaiting approval is deducted on the next statement too', async () => {
    const o = await sell(20, 3);
    await svc.request(SELLER, 52.8, 'wallet'); // requested, not paid yet
    await returnUnits(o, 40);
    expect(await svc.available(SELLER.id)).toMatchObject({ available: -35.2, owedUsd: 35.2 });
    await sell(100, 1);
    const p2 = await svc.request(SELLER, 52.8, 'wallet');
    expect(p2).toMatchObject({ statementRefundsUsd: 35.2, statementNetUsd: 52.8 });
  });

  it('an admin partial refund on a dispute (no lines named, $3 delivery fee on the payment)', async () => {
    const o = await sell(20, 3);
    await disputeRefund(o, 10);
    expect((await ds.getRepository(OrderItem).findOneByOrFail({ id: o.item.id })).refundedUsd).toBe(10);
    // 1/6 of the line: $10 gross, $1.20 commission back -> $8.80 off.
    expect(await svc.available(SELLER.id)).toMatchObject({ earned: 44, commissionUsd: 6 });
    const p = await svc.request(SELLER, 44, 'wallet');
    expect(p).toMatchObject({ statementGrossUsd: 60, statementRefundsUsd: 8.8, statementNetUsd: 44 });
  });

  it('an admin partial dispute refund after the payout is clawed back on the next statement', async () => {
    const o = await sell(20, 3);
    await payAndApprove(52.8);
    await disputeRefund(o, 10);
    expect(await svc.available(SELLER.id)).toMatchObject({ earned: 44, available: -8.8, owedUsd: 8.8 });
    await sell(50, 1); // +44
    const p = await svc.request(SELLER, 35.2, 'wallet');
    expect(p).toMatchObject({ statementRefundsUsd: 8.8, statementNetUsd: 35.2, closingBalanceUsd: 0 });
  });

  it('a full refund takes the whole sale back, before or after a payout', async () => {
    const before = await sell(20, 3);
    await payments.refund(before.order.id, true);
    expect(await svc.available(SELLER.id)).toMatchObject({ earned: 0, available: 0 });

    const after = await sell(20, 3);
    await payAndApprove(52.8);
    await payments.refund(after.order.id, true);
    expect(await svc.available(SELLER.id)).toMatchObject({ earned: 0, available: -52.8, owedUsd: 52.8 });
  });

  it('a partial refund, a payout, then a full refund of the rest: clawed back once, never the refunded part twice', async () => {
    const o = await sell(20, 3);
    await returnUnits(o, 40);
    await payAndApprove(17.6); // the statement already took the $35.20 off
    const rest = await payments.refund(o.order.id, true); // the last unit + the delivery fee
    expect(rest.refund.amountUsd).toBe(23);
    expect(await svc.available(SELLER.id)).toMatchObject({ earned: 0, available: -17.6, owedUsd: 17.6 });
    await sell(100, 1); // +88
    const p = await svc.request(SELLER, 70.4, 'wallet');
    const st = await statementOf(p.id);
    expect(st.lines.find((l) => l.kind === 'refund')).toMatchObject({ orderId: o.order.id, refundUsd: 17.6, netUsd: -17.6 });
    expect(st.totals).toMatchObject({ refundsUsd: 17.6, netUsd: 70.4, closingBalanceUsd: 0 });
  });

  it('two partial refunds on one order, one before and one after a payout', async () => {
    const o = await sell(20, 3);
    await returnUnits(o, 20); // 1 unit: -$17.60
    expect((await svc.available(SELLER.id)).earned).toBe(35.2);
    const p1 = await payAndApprove(35.2);
    expect(p1).toMatchObject({ statementRefundsUsd: 17.6, statementNetUsd: 35.2 });

    await returnUnits(o, 20); // a second unit: another -$17.60
    expect(await svc.available(SELLER.id)).toMatchObject({ earned: 17.6, available: -17.6 });
    await sell(100, 1);
    const p2 = await svc.request(SELLER, 70.4, 'wallet');
    expect(p2).toMatchObject({ statementRefundsUsd: 17.6, statementNetUsd: 70.4, closingBalanceUsd: 0 });
    // Neither refund counted again.
    await sell(10, 1); // +8.80
    const p3 = await svc.request(SELLER, 8.8, 'wallet');
    expect(p3).toMatchObject({ statementRefundsUsd: 0, statementNetUsd: 8.8 });
  });

  it('a rejected payout releases its lines: the next statement settles the sale net of the refund, once', async () => {
    const o = await sell(20, 3);
    const p1 = await svc.request(SELLER, 52.8, 'wallet');
    await returnUnits(o, 40);
    await svc.reject(p1.id, 'wrong account');
    const p2 = await svc.request(SELLER, 17.6, 'wallet');
    expect(p2).toMatchObject({ statementGrossUsd: 60, statementRefundsUsd: 35.2, statementNetUsd: 17.6, closingBalanceUsd: 0 });
  });

  it('commission arithmetic with awkward cents (3 x $9.99 at 12.5%, a $3 platform promo): each unit is worth the same', async () => {
    // commission round2(29.97 * 12.5%) = 3.75; net 26.22 = 3 x 8.74. Each returned unit gives the customer
    // 9.99 - 1.00 (its promo share) = 8.99, and takes 9.99 gross and 1.25 commission off the seller (8.74).
    const o = await sell(9.99, 3, { pct: 12.5, promo: 3 });
    expect((await svc.available(SELLER.id)).earned).toBe(26.22);
    await returnUnits(o, 8.99);
    expect(await svc.available(SELLER.id)).toMatchObject({ earned: 17.48, commissionUsd: 2.5 });
    await returnUnits(o, 8.99);
    expect(await svc.available(SELLER.id)).toMatchObject({ earned: 8.74, commissionUsd: 1.25 });
    const p = await svc.request(SELLER, 8.74, 'wallet');
    expect(p).toMatchObject({ statementGrossUsd: 29.97, statementCommissionUsd: 3.75, statementRefundsUsd: 17.48, statementNetUsd: 8.74 });
  });

  it('a store coupon (paid by the seller): the refunded share is taken from the line after the coupon', async () => {
    // 3 x $10, $3 store coupon on the line: gross 27, commission 10% = 2.70, net 24.30. One unit back = $9 to the customer.
    const o = await sell(10, 3, { pct: 10, coupon: 3 });
    expect((await svc.available(SELLER.id)).earned).toBe(24.3);
    await returnUnits(o, 9);
    expect(await svc.available(SELLER.id)).toMatchObject({ earned: 16.2, commissionUsd: 1.8 });
  });
});
