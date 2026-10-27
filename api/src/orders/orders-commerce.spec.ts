import { DeliveryTask, Hub, Order, OrderItem, Promo, User } from '../database/entities';
import type { Seller } from '../database/entities';
import { commerceWorld } from '../testing/commerce-db';
import type { World } from '../testing/commerce-db';
import { OrdersService } from './orders.service';

const ROUTE = { feeUsd: 0, deliveryUsd: 0, transferUsd: 0, distanceKm: 1, destinationHubId: 'h1', destinationHub: { id: 'h1', name: 'H', city: 'C' }, originHubIds: [], originBySeller: {}, transfer: false, pinned: true, fallback: null };
const BLACK_S = 'Size: S · Colour: Black';
const WHITE_M = 'Size: M · Colour: White';
const OPTIONS = [
  { name: 'Size', options: ['S', 'M'] },
  { name: 'Colour', options: ['Black', 'White'] },
];

let w: World;
let shop: Seller;
let other: Seller;
let orders: OrdersService;
let payFails: boolean;
const customer = { id: 'cust-1', name: 'Jean Mukendi' };

beforeEach(async () => {
  w = await commerceWorld();
  shop = await w.store('Kinshasa Traders', 'u-kt');
  other = await w.store('Other Shop', 'u-other');
  payFails = false;
  const payments = {
    registerOrderSettledHandler: () => undefined,
    assertMethodAllowed: async () => undefined,
    processForOrder: async () => {
      if (payFails) throw new Error('card declined');
      return { status: 'succeeded', method: 'wallet' };
    },
    forOrder: async () => null,
    refundCancelledOrder: async () => 0,
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
    { getBalance: async () => 1000 } as never,
    w.promos,
    { get: async (k: string) => w.settings[k] ?? null } as never,
    w.ds.getRepository(Hub),
    w.ds.getRepository(User),
    undefined,
    { planOrder: async () => undefined, staffIds: async () => [], voidOrderTasks: async () => undefined } as never,
    { route: async () => ROUTE } as never,
  );
});
afterEach(async () => w.ds.destroy());

const place = (items: { productId: string; qty: number; variant?: string }[], promoCode?: string) => orders.create(customer, { items, paymentMethod: 'wallet', promoCode });
const stock = async (id: string) => (await w.products.getRaw(id))!;

describe('checkout and stock per option', () => {
  it('takes the stock of the chosen option only, and writes the ledger with the order id', async () => {
    const p = await w.product(shop, { name: 'T-shirt', stock: undefined, variants: OPTIONS, variantStock: { [BLACK_S]: 3, [WHITE_M]: 8 } });
    const o = await place([{ productId: p.id, qty: 2, variant: 'size: s · colour: black' }]);
    expect(o.items[0].variant).toBe(BLACK_S);
    expect((await stock(p.id)).variantStock).toEqual({ [BLACK_S]: 1, [WHITE_M]: 8 });
    expect((await stock(p.id)).stock).toBe(9);
    const sale = (await w.products.movementsOf(p.id, { take: 10, skip: 0 })).items.find((m) => m.reason === 'sale')!;
    expect(sale).toMatchObject({ orderId: o.id, variant: BLACK_S, delta: -2 });
  });

  it('refuses more than the option has, with a message about that option, and takes nothing', async () => {
    const p = await w.product(shop, { name: 'T-shirt', stock: undefined, variants: OPTIONS, variantStock: { [BLACK_S]: 1, [WHITE_M]: 8 } });
    await expect(place([{ productId: p.id, qty: 2, variant: BLACK_S }])).rejects.toThrow('Only 1 of "T-shirt" (Size: S · Colour: Black) left in stock.');
    await w.products.adjustStock(p.id, -1, { variant: BLACK_S });
    await expect(place([{ productId: p.id, qty: 1, variant: BLACK_S }])).rejects.toThrow('"T-shirt" (Size: S · Colour: Black) is out of stock.');
    expect((await stock(p.id)).stock).toBe(8);
  });

  it('two lines of the same option in one order share its units', async () => {
    const p = await w.product(shop, { name: 'T-shirt', stock: undefined, variants: OPTIONS, variantStock: { [BLACK_S]: 3 } });
    await expect(place([{ productId: p.id, qty: 2, variant: BLACK_S }, { productId: p.id, qty: 2, variant: BLACK_S }])).rejects.toThrow('Only 1 of');
    expect((await stock(p.id)).variantStock).toEqual({ [BLACK_S]: 3 });
  });

  it('a product without options keeps its old messages', async () => {
    const p = await w.product(shop, { name: 'Case', stock: 2 });
    await expect(place([{ productId: p.id, qty: 3 }])).rejects.toThrow('Only 2 of "Case" left in stock.');
    await w.products.adjustStock(p.id, -2, {});
    await expect(place([{ productId: p.id, qty: 1 }])).rejects.toThrow('"Case" is out of stock.');
  });

  it('gives the units back to the option when the payment fails', async () => {
    const p = await w.product(shop, { name: 'T-shirt', stock: undefined, variants: OPTIONS, variantStock: { [BLACK_S]: 3, [WHITE_M]: 8 } });
    payFails = true;
    await expect(place([{ productId: p.id, qty: 2, variant: BLACK_S }])).rejects.toThrow('card declined');
    expect((await stock(p.id)).variantStock).toEqual({ [BLACK_S]: 3, [WHITE_M]: 8 });
    const reasons = (await w.products.movementsOf(p.id, { take: 10, skip: 0 })).items.map((m) => m.reason).sort();
    expect(reasons).toEqual(['cancel_restock', 'initial', 'sale']);
  });

  it('cancelling the order restocks the option', async () => {
    const p = await w.product(shop, { name: 'T-shirt', stock: undefined, variants: OPTIONS, variantStock: { [BLACK_S]: 3, [WHITE_M]: 8 } });
    const o = await place([{ productId: p.id, qty: 2, variant: BLACK_S }]);
    await orders.cancel({ id: customer.id, role: 'customer' }, o.id);
    expect((await stock(p.id)).variantStock).toEqual({ [BLACK_S]: 3, [WHITE_M]: 8 });
    const back = (await w.products.movementsOf(p.id, { take: 10, skip: 0 })).items.find((m) => m.reason === 'cancel_restock')!;
    expect(back).toMatchObject({ orderId: o.id, variant: BLACK_S, delta: 2 });
  });
});

describe('checkout with a store coupon', () => {
  const coupon = (code: string, over: Record<string, unknown> = {}) => w.coupons.create('u-kt', { code, type: 'percent', value: 20, ...over });

  it('discounts only the store’s lines, and the store pays: line share, commission after the coupon', async () => {
    w.settings.commissionPct = '10';
    await coupon('KT20');
    const mine = await w.product(shop, { name: 'Mine', price: 50 });
    const theirs = await w.product(other, { name: 'Theirs', price: 100 });
    const o = await place([{ productId: mine.id, qty: 2 }, { productId: theirs.id, qty: 1 }], 'kt20');
    expect(o).toMatchObject({ subtotalUsd: 200, discountUsd: 20, totalUsd: 180, promoCode: 'KT20' });
    const lines = Object.fromEntries(o.items.map((i) => [i.productName, i]));
    expect(lines.Mine).toMatchObject({ couponDiscountUsd: 20, commissionPct: 10, commissionUsd: 8 }); // (100 - 20) x 10%
    expect(lines.Theirs).toMatchObject({ couponDiscountUsd: 0, commissionUsd: 10 });
    // It is stored: the seller's earnings count it.
    const saved = await w.ds.getRepository(OrderItem).findOneByOrFail({ id: lines.Mine.id });
    expect(saved.couponDiscountUsd).toBe(20);
  });

  it('a platform code behaves as before (nobody pays per line)', async () => {
    await w.ds.getRepository(Promo).save(w.ds.getRepository(Promo).create({ code: 'WELCOME', type: 'percent', value: 10 }));
    const p = await w.product(shop, { price: 50 });
    const o = await place([{ productId: p.id, qty: 2 }], 'welcome');
    expect(o).toMatchObject({ discountUsd: 10, totalUsd: 90 });
    expect(o.items[0].couponDiscountUsd ?? 0).toBe(0);
  });

  it('a coupon of a store whose products are not in the cart is refused', async () => {
    await coupon('KT20');
    const theirs = await w.product(other, { price: 100 });
    await expect(place([{ productId: theirs.id, qty: 1 }], 'KT20')).rejects.toThrow('only applies to products from Kinshasa Traders');
    expect((await stock(theirs.id)).stock).toBe(10); // nothing was taken
  });
});

describe('checkout and campaign budget', () => {
  it('counts the discount given and ends the campaign when its budget is spent', async () => {
    const p = await w.product(shop, { price: 100, stock: 20 });
    const c = await w.campaigns.create({ id: 'u-kt', name: 'KT', role: 'seller' }, { name: 'Spring', discount: 20, budgetUsd: 30 });
    await w.campaigns.setStatus(c.id, 'active');
    const first = await place([{ productId: p.id, qty: 1 }]); // 80, discount 20
    expect(first.items[0]).toMatchObject({ priceUsd: 80, campaignId: c.id });
    await new Promise((r) => setTimeout(r, 50));
    expect((await w.ds.getRepository('Campaign').findOneByOrFail({ id: c.id })) as any).toMatchObject({ spentUsd: 20, orders: 1, status: 'active' });
    await place([{ productId: p.id, qty: 1 }]); // another 20: 40 >= 30
    await new Promise((r) => setTimeout(r, 50));
    expect((await w.ds.getRepository('Campaign').findOneByOrFail({ id: c.id })) as any).toMatchObject({ spentUsd: 40, status: 'ended', endedReason: 'budget' });
    const third = await place([{ productId: p.id, qty: 1 }]);
    expect(third.items[0].priceUsd).toBe(100); // back to the normal price
  });
});

describe('the order the seller sees', () => {
  it('carries the city and the lines’ coupon and commission, and the tracking field', async () => {
    const p = await w.product(shop, { price: 10 });
    const o = await orders.create(customer, { items: [{ productId: p.id, qty: 1 }], paymentMethod: 'wallet', shippingAddress: JSON.stringify({ line1: '1 Rue X', city: 'Goma' }) });
    const order = (await w.ds.getRepository(Order).findOneByOrFail({ id: o.id }))!;
    const view = OrdersService.sellerView(order, order.items);
    expect(view).toMatchObject({ city: 'Goma', tracking: null, customerName: 'Jean' });
    expect(JSON.stringify(view)).not.toContain('1 Rue X');
  });
});
