import { DeliveryTask, Hub, Order, Promo, User } from '../database/entities';
import type { Seller } from '../database/entities';
import { serializeSqliteTransactions } from '../database/sqlite-transactions';
import { commerceWorld } from '../testing/commerce-db';
import type { World } from '../testing/commerce-db';
import { ORDER_REPLAY, OrderStillProcessingException, OrdersService } from './orders.service';
import type { CreateOrderInput } from './orders.service';

/**
 * C-01 (one tap = one order) and C-03 (a limited code is used exactly as often as it says).
 *
 * The database serializes transactions the way the running API does (`database.module.ts`), so concurrent checkouts
 * race exactly as they do against the real server, and the payment step takes a little time (as a provider does), so
 * the requests really overlap.
 */
const ROUTE = { feeUsd: 0, deliveryUsd: 0, transferUsd: 0, distanceKm: 1, destinationHubId: 'h1', destinationHub: { id: 'h1', name: 'H', city: 'C' }, originHubIds: [], originBySeller: {}, transfer: false, pinned: true, fallback: null };

let w: World;
let shop: Seller;
let orders: OrdersService;
/** Every charge the payment step made, by order id. */
let charges: string[];
let payFails: boolean;
let payDelayMs: number;
const customer = { id: 'cust-1', name: 'Jean Mukendi' };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => {
  w = await commerceWorld();
  serializeSqliteTransactions(w.ds);
  shop = await w.store('Kinshasa Traders', 'u-kt');
  charges = [];
  payFails = false;
  payDelayMs = 40;
  const payments = {
    registerOrderSettledHandler: () => undefined,
    assertMethodAllowed: async () => undefined,
    processForOrder: async (order: Order) => {
      await sleep(payDelayMs); // the provider takes its time
      if (payFails) throw new Error('The payment was refused.');
      charges.push(order.id);
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
    { getBalance: async () => 100_000 } as never,
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

const KEY_A = '0b7c3f8e-5a3e-4c1e-9d2a-6f1f0e9a1c01';
const KEY_B = '0b7c3f8e-5a3e-4c1e-9d2a-6f1f0e9a1c02';
const all = <T>(n: number, fn: (i: number) => Promise<T>) => Promise.allSettled(Array.from({ length: n }, (_, i) => fn(i)));
const ok = <T>(r: PromiseSettledResult<T>[]) => r.filter((x): x is PromiseFulfilledResult<T> => x.status === 'fulfilled').map((x) => x.value);
const refused = (r: PromiseSettledResult<unknown>[]) => r.filter((x): x is PromiseRejectedResult => x.status === 'rejected').map((x) => (x.reason as Error).message);
const orderCount = () => w.ds.getRepository(Order).count();
const stockOf = async (id: string) => (await w.products.getRaw(id))!.stock;

describe('C-01: orders:create is idempotent per checkout attempt', () => {
  let input: (key?: string) => CreateOrderInput;
  let productId: string;
  beforeEach(async () => {
    productId = (await w.product(shop, { name: 'Jeans', price: 30, stock: 10 })).id;
    input = (key) => ({ items: [{ productId, qty: 1 }], paymentMethod: 'wallet', ...(key ? { clientRequestId: key } : {}) });
  });

  it('N concurrent identical requests with ONE key make exactly one order and one charge', async () => {
    const r = await all(5, () => orders.create(customer, input(KEY_A)));
    expect(refused(r)).toEqual([]);
    const ids = new Set(ok(r).map((o) => o.id));
    expect(ids.size).toBe(1);
    expect(await orderCount()).toBe(1);
    expect(charges).toHaveLength(1);
    expect(await stockOf(productId)).toBe(9); // one unit taken, every duplicate's reservation (if any) given back
    // Every caller sees the finished order, not a half-made one.
    for (const o of ok(r)) expect(o.status).toBe('confirmed');
  });

  it('the same key sent again later returns the same order without charging again', async () => {
    const first = await orders.create(customer, input(KEY_A));
    const again = await orders.place(customer, input(KEY_A));
    expect(again.replayed).toBe(true);
    expect(again.order.id).toBe(first.id);
    expect(charges).toEqual([first.id]);
    expect(await orderCount()).toBe(1);
    expect((await w.ds.getRepository(Order).findOneByOrFail({ id: first.id })).clientRequestId).toBe(KEY_A);
  });

  it('different keys make different orders (a real second purchase)', async () => {
    const a = await orders.create(customer, input(KEY_A));
    const b = await orders.create(customer, input(KEY_B));
    expect(a.id).not.toBe(b.id);
    expect(charges).toHaveLength(2);
  });

  it('the same key from ANOTHER customer is a different checkout', async () => {
    const a = await orders.create(customer, input(KEY_A));
    const b = await orders.create({ id: 'cust-2', name: 'Marie' }, input(KEY_A));
    expect(a.id).not.toBe(b.id);
  });

  it('a request refused before any order existed frees its key: the retry with the same key can succeed', async () => {
    await expect(orders.create(customer, { ...input(KEY_A), items: [{ productId, qty: 11 }] })).rejects.toThrow(/left in stock/);
    const o = await orders.create(customer, input(KEY_A));
    expect(o.status).toBe('confirmed');
    expect(await orderCount()).toBe(1);
  });

  it('a payment that failed is reported again on a retry with the same key (no second ghost order, no charge)', async () => {
    payFails = true;
    await expect(orders.create(customer, input(KEY_A))).rejects.toThrow('The payment was refused.');
    payFails = false;
    await expect(orders.create(customer, input(KEY_A))).rejects.toThrow(/did not go through/);
    expect(await orderCount()).toBe(1); // the one cancelled attempt (audit C-10), not one more
    expect(charges).toEqual([]);
    expect(await stockOf(productId)).toBe(10);
    // A NEW attempt (new key) goes through.
    expect((await orders.create(customer, input(KEY_B))).status).toBe('confirmed');
  });

  it('lookup by key: none, then placed (with the order)', async () => {
    expect(await orders.findByRequest(customer.id, KEY_A)).toEqual({ state: 'none' });
    const o = await orders.create(customer, input(KEY_A));
    const found = await orders.findByRequest(customer.id, KEY_A);
    expect(found.state).toBe('placed');
    expect(found.order?.id).toBe(o.id);
    expect(await orders.findByRequest('someone-else', KEY_A)).toEqual({ state: 'none' });
  });

  it('lookup by key while the first request is still being paid says "processing"', async () => {
    payDelayMs = 300;
    const running = orders.create(customer, input(KEY_A));
    await sleep(120);
    expect((await orders.findByRequest(customer.id, KEY_A)).state).toBe('processing');
    await running;
    expect((await orders.findByRequest(customer.id, KEY_A)).state).toBe('placed');
  });

  it('a same-key request still waiting when the first is slow says "still processing" (code order_processing), and charges nothing', async () => {
    const before = ORDER_REPLAY.waitMs;
    ORDER_REPLAY.waitMs = 100;
    payDelayMs = 600;
    try {
      const first = orders.create(customer, input(KEY_A));
      await sleep(50);
      const second = orders.create(customer, input(KEY_A)).catch((e: unknown) => e);
      const err = (await second) as OrderStillProcessingException;
      expect(err).toBeInstanceOf(OrderStillProcessingException);
      expect(err.code).toBe('order_processing');
      expect(err.message).toBe('Your order is still being processed. Check My orders in a moment before trying again.');
      const o = await first;
      expect(charges).toEqual([o.id]);
      // Once it is done, the same key returns it.
      expect((await orders.create(customer, input(KEY_A))).id).toBe(o.id);
    } finally {
      ORDER_REPLAY.waitMs = before;
    }
  });

  it('refuses a malformed key with a clear message', async () => {
    await expect(orders.create(customer, input('x'))).rejects.toThrow('Invalid checkout reference. Please try again.');
  });

  describe('older apps on the socket (no key: the gateway asks for the cart de-duplication)', () => {
    const createOld = (inp: CreateOrderInput) => orders.place(customer, inp, { dedupWithoutKey: true }).then((r) => r.order);
    it('a single request still works as before', async () => {
      const o = await createOld(input());
      expect(o.status).toBe('confirmed');
      expect(o.clientRequestId ?? null).toBeNull();
    });

    it('identical concurrent carts from the same customer give ONE order (double tap / retry while in flight)', async () => {
      const r = await all(3, () => createOld(input()));
      expect(refused(r)).toEqual([]);
      expect(new Set(ok(r).map((o) => o.id)).size).toBe(1);
      expect(charges).toHaveLength(1);
    });

    it('a different cart is a different order', async () => {
      const a = await createOld(input());
      const b = await createOld({ ...input(), items: [{ productId, qty: 2 }] });
      expect(a.id).not.toBe(b.id);
    });

    it('server-side callers (no option) are not de-duplicated: the demo seed places identical carts on purpose', async () => {
      const a = await orders.create(customer, input());
      const b = await orders.create(customer, input());
      expect(a.id).not.toBe(b.id);
    });

    it('after a failed payment the same cart can be tried again at once', async () => {
      payFails = true;
      await expect(createOld(input())).rejects.toThrow('The payment was refused.');
      payFails = false;
      expect((await createOld(input())).status).toBe('confirmed');
    });
  });
});

describe('C-03: coupon limits hold under concurrency', () => {
  let productId: string;
  beforeEach(async () => {
    productId = (await w.product(shop, { name: 'Jeans', price: 30, stock: 50 })).id;
  });
  const promo = (over: Partial<Promo>) => w.ds.getRepository(Promo).save(w.ds.getRepository(Promo).create({ code: 'ONCE', type: 'fixed', value: 10, ...over }));
  const buy = (who: { id: string; name: string }, key: string, code = 'ONCE') =>
    orders.create(who, { items: [{ productId, qty: 1 }], paymentMethod: 'wallet', promoCode: code, clientRequestId: key });
  const key = (i: number) => `0b7c3f8e-5a3e-4c1e-9d2a-6f1f0e9a2${String(i).padStart(3, '0')}`;

  it('a code limited to 1 use in total is applied ONCE among concurrent orders; the others are refused clearly', async () => {
    await promo({ maxUses: 1 });
    const r = await all(4, (i) => buy({ id: `cust-${i}`, name: `C${i}` }, key(i)));
    const placed = ok(r);
    expect(placed).toHaveLength(1);
    expect(placed[0].discountUsd).toBe(10);
    expect(refused(r)).toEqual(Array(3).fill('This code is no longer available.'));
    expect(await w.ds.getRepository(Order).count({ where: { promoCode: 'ONCE' } })).toBe(1);
    expect(charges).toHaveLength(1);
    expect(await stockOf(productId)).toBe(49); // the refused orders gave their units back
  });

  it('the per-customer limit holds for one customer placing several orders at once (different attempts)', async () => {
    await promo({ perUserLimit: 1 });
    const r = await all(4, (i) => buy(customer, key(i)));
    expect(ok(r)).toHaveLength(1);
    expect(refused(r)).toEqual(Array(3).fill('You have already used this code.'));
    // Another customer may still use it.
    expect((await buy({ id: 'cust-9', name: 'Other' }, key(9))).discountUsd).toBe(10);
  });

  it('a total limit of 2 allows exactly 2', async () => {
    await promo({ maxUses: 2 });
    const r = await all(5, (i) => buy({ id: `cust-${i}`, name: `C${i}` }, key(i)));
    expect(ok(r)).toHaveLength(2);
  });

  it('a redemption whose order failed to pay is given back (the code still works)', async () => {
    await promo({ maxUses: 1 });
    payFails = true;
    await expect(buy(customer, key(1))).rejects.toThrow('The payment was refused.');
    payFails = false;
    expect((await buy(customer, key(2))).discountUsd).toBe(10);
  });
});

describe('stock is still never oversold', () => {
  it('3 units, 6 concurrent single-unit orders from different customers: 3 placed, 3 refused, stock 0', async () => {
    const p = await w.product(shop, { name: 'Last ones', price: 20, stock: 3 });
    const r = await all(6, (i) => orders.create({ id: `cust-${i}`, name: `C${i}` }, { items: [{ productId: p.id, qty: 1 }], paymentMethod: 'wallet', clientRequestId: `0b7c3f8e-5a3e-4c1e-9d2a-6f1f0e9a3${i}00` }));
    expect(ok(r)).toHaveLength(3);
    expect(refused(r)).toHaveLength(3);
    expect(await stockOf(p.id)).toBe(0);
    expect(charges).toHaveLength(3);
  });
});
