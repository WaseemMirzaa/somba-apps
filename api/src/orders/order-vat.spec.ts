import { DeliveryTask, Hub, Order, OrderItem, Payment, PaymentRefund, User, WalletTransaction } from '../database/entities';
import type { Seller } from '../database/entities';
import { commerceWorld } from '../testing/commerce-db';
import type { World } from '../testing/commerce-db';
import { WalletService } from '../wallet/wallet.service';
import { OrdersService } from './orders.service';
import { lineRefund } from '../payouts/line-refund';

/** VAT and the delivery-fee payer, end to end on the real entities (order math, customer view, refunds, seller money). */
const ROUTE = { feeUsd: 3, deliveryUsd: 3, transferUsd: 0, distanceKm: 1, destinationHubId: 'h1', destinationHub: { id: 'h1', name: 'H', city: 'C' }, originHubIds: [], originBySeller: {}, transfer: false, pinned: true, fallback: null };

let w: World;
let shop: Seller;
let orders: OrdersService;
let customer: User;

beforeEach(async () => {
  w = await commerceWorld();
  shop = await w.store('Kinshasa Traders', 'u-kt');
  customer = await w.ds.getRepository(User).save(w.ds.getRepository(User).create({ emailHash: 'c1', email: 'c@x.test', passwordHash: 'x', name: 'Marie', role: 'customer', walletBalance: 0 }));
  const wallet = new WalletService(w.ds.getRepository(User), w.ds.getRepository(WalletTransaction), w.emitter as never);
  const payments = {
    registerOrderSettledHandler: () => undefined,
    assertMethodAllowed: async () => undefined,
    processForOrder: async () => ({ status: 'succeeded', method: 'wallet' }),
    forOrder: (orderId: string) => w.ds.getRepository(Payment).findOne({ where: { orderId }, order: { createdAt: 'DESC' } }),
    refundCancelledOrder: async () => 0,
    automaticOriginal: async () => null, // the wallet switch is on
  };
  const notifications = { toUser: async () => undefined, toRole: async () => undefined, toAdmins: async () => undefined, toUsers: async () => undefined };
  orders = new OrdersService(
    w.ds.getRepository(Order),
    w.ds.getRepository(DeliveryTask),
    w.ds.getRepository('Seller') as never,
    { registerFailedHandler: () => undefined } as never,
    w.products,
    notifications as never,
    w.emitter as never,
    payments as never,
    wallet,
    w.promos,
    { get: async (k: string) => w.settings[k] ?? null } as never,
    w.ds.getRepository(Hub),
    w.ds.getRepository(User),
    undefined,
    { planOrder: async () => undefined, staffIds: async () => [], voidOrderTasks: async () => undefined, onSellerCancelled: async () => undefined } as never,
    { route: async () => ROUTE } as never,
  );
});
afterEach(async () => w.ds.destroy());

/** A placed order: Shoes $20 + Socks $10, fee $3. */
async function place() {
  const a = await w.product(shop, { name: 'Shoes', price: 20, stock: 10 });
  const b = await w.product(shop, { name: 'Socks', price: 10, stock: 10 });
  const o = await orders.create({ id: customer.id, name: 'Marie' }, { items: [{ productId: a.id, qty: 1 }, { productId: b.id, qty: 1 }], paymentMethod: 'stripe_card' });
  const fresh = await w.ds.getRepository(Order).findOneByOrFail({ id: o.id });
  return { order: fresh, shoes: fresh.items.find((i) => i.productName === 'Shoes')!, socks: fresh.items.find((i) => i.productName === 'Socks')!, a, b };
}
const pay = async (order: Order) => {
  await w.ds.getRepository(Order).update({ id: order.id }, { status: 'confirmed' });
  return w.ds.getRepository(Payment).save(w.ds.getRepository(Payment).create({ reference: 'PAY-1', orderId: order.id, orderReference: order.reference, userId: customer.id, method: 'stripe_card', amountUsd: order.totalUsd, status: 'succeeded' }));
};

describe('order totals', () => {
  it('today\'s behaviour with the defaults (VAT off, customer pays the fee): no VAT anywhere', async () => {
    const { order, shoes } = await place();
    expect(order).toMatchObject({ vatUsd: 0, deliveryFeePaidBy: 'customer', subtotalUsd: 30, deliveryFeeUsd: 3, totalUsd: 33 });
    expect(shoes).toMatchObject({ vatPct: 0, vatUsd: 0, sellerFeeUsd: 0 });
  });

  it('VAT on: added per line at the default rate, the total adds it, the seller\'s commission base is untouched', async () => {
    w.settings.vatEnabled = 'true';
    w.settings.vatPct = '16';
    const { order, shoes, socks } = await place();
    expect(shoes).toMatchObject({ vatPct: 16, vatUsd: 3.2, commissionUsd: 2 }); // commission on $20, not $23.20
    expect(socks).toMatchObject({ vatPct: 16, vatUsd: 1.6 });
    expect(order).toMatchObject({ vatUsd: 4.8, subtotalUsd: 30, totalUsd: 37.8 }); // 30 + 4.8 + 3
  });

  it('a category rate beats the default (0 is a real rate); each line keeps the rate it was placed with', async () => {
    w.settings.vatEnabled = 'true';
    w.settings.vatPct = '16';
    await w.ds.getRepository('Category').update({ id: w.electronics }, { vatPct: 0 });
    const zero = await place();
    expect(zero.order).toMatchObject({ vatUsd: 0, totalUsd: 33 });
    await w.ds.getRepository('Category').update({ id: w.electronics }, { vatPct: 8 });
    const eight = await place();
    expect(eight.order).toMatchObject({ vatUsd: 2.4, totalUsd: 35.4 }); // 1.6 + 0.8
    await w.ds.getRepository('Category').update({ id: w.electronics }, { vatPct: 20 });
    expect((await w.ds.getRepository(OrderItem).findOneByOrFail({ id: eight.shoes.id })).vatPct).toBe(8);
  });

  it('seller pays the fee: the customer pays goods + VAT only, the fee is split over the lines for the seller', async () => {
    w.settings.vatEnabled = 'true';
    w.settings.deliveryFeePaidBy = 'seller';
    const { order, shoes, socks } = await place();
    expect(order).toMatchObject({ deliveryFeePaidBy: 'seller', deliveryFeeUsd: 3, vatUsd: 4.8, totalUsd: 34.8 });
    expect([shoes.sellerFeeUsd, socks.sellerFeeUsd]).toEqual([2, 1]);
  });

  it('the customer view: seller-paid shows no fee, hidden fee is flagged, and the seller\'s fee never leaks', async () => {
    w.settings.deliveryFeePaidBy = 'seller';
    const sellerPays = (await orders.customerViews([(await place()).order]))[0];
    expect(sellerPays).toMatchObject({ platformFeeUsd: 0, deliveryFeeUsd: 0, feePaidBySeller: true, showFee: false, totalUsd: 30 });
    expect(JSON.stringify(sellerPays.items)).not.toMatch(/sellerFeeUsd|commissionUsd/);

    w.settings.deliveryFeePaidBy = 'customer';
    w.settings.showPlatformFee = 'false';
    const hidden = (await orders.customerViews([(await place()).order]))[0];
    expect(hidden).toMatchObject({ platformFeeUsd: 3, feePaidBySeller: false, showFee: false, totalUsd: 33 });

    w.settings.showPlatformFee = 'true';
    expect((await orders.customerViews([(await place()).order]))[0]).toMatchObject({ platformFeeUsd: 3, showFee: true });
  });
});

describe('refunds carry the VAT', () => {
  it('a seller cancelling a line refunds its price and its VAT, and the line records both', async () => {
    w.settings.vatEnabled = 'true';
    const { order, shoes } = await place();
    await pay(order);
    await orders.sellerCancel({ id: 'u-kt' }, order.id, 'Out of stock', [shoes.id]);
    expect((await w.ds.getRepository(User).findOneByOrFail({ id: customer.id })).walletBalance).toBe(23.2); // 20 + 3.20
    expect((await w.ds.getRepository(OrderItem).findOneByOrFail({ id: shoes.id })).refundedUsd).toBe(23.2);
    expect(await w.ds.getRepository(PaymentRefund).find()).toEqual([expect.objectContaining({ amountUsd: 23.2 })]);
  });

  it('a share refunded is measured against price + VAT, so the seller\'s clawback stays proportional', () => {
    const order = { subtotalUsd: 30, discountUsd: 0 };
    const line = { priceUsd: 20, qty: 1, couponDiscountUsd: 0, commissionUsd: 2, vatUsd: 3.2, sellerFeeUsd: 2 };
    // half of what the customer paid for the line (23.20) went back
    const r = lineRefund({ ...line, refundedUsd: 11.6 }, order);
    expect(r).toMatchObject({ fraction: 0.5, grossUsd: 10, commissionUsd: 1, deliveryFeeUsd: 1, netUsd: 8 });
    // the VAT is not in the seller's gross: a full refund takes back exactly gross - commission - fee
    expect(lineRefund({ ...line, refundedUsd: 23.2 }, order)).toMatchObject({ fraction: 1, grossUsd: 20, netUsd: 16 });
  });
});

describe('seller money', () => {
  const delivered = async () => {
    const placed = await place();
    await pay(placed.order);
    await w.ds.getRepository(Order).update({ id: placed.order.id }, { status: 'delivered' });
    return placed;
  };
  const seller = { id: 'u-kt', role: 'seller' };

  it('VAT is never seller revenue: with the customer paying the fee the earnings are what they always were', async () => {
    w.settings.vatEnabled = 'true';
    await delivered();
    const e = await w.finance.earnings(seller);
    expect(e.items.map((l) => [l.grossUsd, l.commissionUsd, l.deliveryFeeUsd, l.netUsd]).sort()).toEqual([[10, 1, 0, 9], [20, 2, 0, 18]]);
    expect((await w.payouts.available('u-kt')).earned).toBe(27);
  });

  it('seller pays the fee: it comes off each line\'s net, the balance, the statement and the CSV', async () => {
    w.settings.vatEnabled = 'true';
    w.settings.deliveryFeePaidBy = 'seller';
    await delivered();
    const e = await w.finance.earnings(seller);
    expect(e.items.map((l) => [l.grossUsd, l.commissionUsd, l.deliveryFeeUsd, l.netUsd]).sort()).toEqual([[10, 1, 1, 8], [20, 2, 2, 16]]);
    const bal = await w.payouts.available('u-kt');
    expect(bal).toMatchObject({ earned: 24, deliveryFeeUsd: 3 }); // 30 - 3 commission - 3 fee
    const month = new Date().toISOString().slice(0, 7);
    const st = (await w.finance.statements(seller, { month })) as { totals: { grossUsd: number; commissionUsd: number; deliveryFeeUsd: number; netUsd: number } };
    expect(st.totals).toMatchObject({ grossUsd: 30, commissionUsd: 3, deliveryFeeUsd: 3, netUsd: 24 });
    const csv = (await w.finance.statements(seller, { month, format: 'csv' })) as { csv: string };
    expect(csv.csv).toContain('Delivery fee USD');
    expect(csv.csv).toContain('Delivery fees USD');
    const payout = await w.payouts.request({ id: 'u-kt', name: 'Kinshasa Traders' }, 24, 'wallet');
    const settled = await w.payouts.statement(payout.id, { id: 'u-kt', role: 'seller' });
    expect(settled.totals).toMatchObject({ grossUsd: 30, commissionUsd: 3, deliveryFeeUsd: 3, netUsd: 24 });
    expect(settled.lines.map((l) => l.deliveryFeeUsd).sort()).toEqual([1, 2]);
  });

  it('a partial refund takes back its share of the fee too (the seller is not charged for goods that went back)', async () => {
    w.settings.vatEnabled = 'true';
    w.settings.deliveryFeePaidBy = 'seller';
    const { shoes } = await delivered();
    await w.ds.getRepository(OrderItem).update({ id: shoes.id }, { refundedUsd: 11.6 }); // half of $23.20
    const e = await w.finance.earnings(seller);
    const line = e.items.find((l) => l.itemId === shoes.id)!;
    expect(line).toMatchObject({ refundUsd: 8, netUsd: 8 }); // 16 - 8
  });
});
