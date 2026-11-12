import { OrdersService } from './orders.service';

/** The platform commission in force at order time is frozen on every line (A-B15). */
/** The route the order is placed on (the real router is covered in logistics/). */
const ROUTING = { route: async () => ({ feeUsd: 3, deliveryUsd: 3, transferUsd: 0, distanceKm: 1, destinationHubId: 'h1', destinationHub: { id: 'h1', name: 'H', city: 'C' }, originHubIds: [], originBySeller: {}, transfer: false, pinned: true, fallback: null }) };

function make(settings: Record<string, string>, product: Record<string, unknown> | null, categories: Record<string, number | null> = {}, promos?: unknown) {
  const saved: { items: Record<string, unknown>[] }[] = [];
  const orders: Record<string, unknown> = {
    create: (o: unknown) => o,
    save: (o: { items: Record<string, unknown>[] }) => {
      saved.push(o);
      return Promise.resolve(o);
    },
  };
  // The order and its translation snapshot are saved in one transaction; the fake runs it with the same save.
  // `findOne(Category, ...)` is how the order reads a category's own commission rate.
  orders.manager = {
    transaction: (fn: (m: unknown) => unknown) => fn({ save: orders.save }),
    findOne: (_e: unknown, q: { where: { id: string } }) => Promise.resolve(q.where.id in categories ? { id: q.where.id, commissionPct: categories[q.where.id] } : null),
  };
  const products = { get: () => Promise.resolve(product), findLiveByName: () => Promise.resolve(null), reserve: () => Promise.resolve(true), restock: () => Promise.resolve() };
  const emitter = { registerFanout: () => undefined, registerUserView: () => undefined };
  const delivery = { registerFailedHandler: () => undefined };
  // Payment fails right after the order is saved: enough to inspect what was stored.
  const payments = {
    registerOrderSettledHandler: () => undefined,
    assertMethodAllowed: () => Promise.resolve(),
    processForOrder: () => Promise.reject(new Error('stop here')),
  };
  const sellers = { findOne: () => Promise.resolve(null) };
  const cfg = { get: (k: string) => Promise.resolve(settings[k] ?? null) };
  const svc = new OrdersService(orders as never, {} as never, sellers as never, delivery as never, products as never, {} as never, emitter as never, payments as never, {} as never, (promos ?? {}) as never, cfg as never, undefined, undefined, undefined, {} as never, ROUTING as never);
  return { svc, saved };
}

const live = { id: 'p1', name: 'Phone', nameFr: 'Téléphone', translationStatus: 'done', variantLabels: { en: [], fr: [] }, status: 'live', price: 19.99, stock: 50, sellerId: 's1', variants: null };
const customer = { id: 'c1', name: 'Cust' };

describe('OrdersService.create: commission snapshot', () => {
  it('stores the rate and the amount on every line (rounded to cents)', async () => {
    const { svc, saved } = make({ commissionPct: '12' }, live);
    await expect(svc.create(customer, { items: [{ productId: 'p1', qty: 3 }], paymentMethod: 'stripe_card' })).rejects.toThrow('stop here');
    expect(saved[0].items[0]).toMatchObject({ commissionPct: 12, commissionUsd: 7.2 }); // 19.99 * 3 * 12% = 7.1964
  });

  it('defaults to 12% when the setting is absent and clamps to 0-100', async () => {
    let r = make({}, live);
    await expect(r.svc.create(customer, { items: [{ productId: 'p1', qty: 1 }], paymentMethod: 'stripe_card' })).rejects.toThrow();
    expect(r.saved[0].items[0].commissionPct).toBe(12);
    r = make({ commissionPct: '250' }, live);
    await expect(r.svc.create(customer, { items: [{ productId: 'p1', qty: 1 }], paymentMethod: 'stripe_card' })).rejects.toThrow();
    expect(r.saved[0].items[0]).toMatchObject({ commissionPct: 100, commissionUsd: 19.99 });
    r = make({ commissionPct: '-5' }, live);
    await expect(r.svc.create(customer, { items: [{ productId: 'p1', qty: 1 }], paymentMethod: 'stripe_card' })).rejects.toThrow();
    expect(r.saved[0].items[0]).toMatchObject({ commissionPct: 0, commissionUsd: 0 });
  });

  it('also stores it on client-priced (external) lines', async () => {
    const { svc, saved } = make({ commissionPct: '10' }, null);
    await expect(svc.create(customer, { items: [{ name: 'Ext thing', priceUsd: 50, qty: 2 }], paymentMethod: 'stripe_card' })).rejects.toThrow('stop here');
    expect(saved[0].items[0]).toMatchObject({ commissionPct: 10, commissionUsd: 10 });
  });
});

describe('OrdersService.create: category commission', () => {
  const place = async (r: ReturnType<typeof make>, items: Record<string, unknown>[] = [{ productId: 'p1', qty: 1 }]) => {
    await expect(r.svc.create(customer, { items, paymentMethod: 'stripe_card' } as never)).rejects.toThrow();
    return r.saved[0].items;
  };

  it('uses the category rate when the category has one, whatever the global default is', async () => {
    const items = await place(make({ commissionPct: '12' }, { ...live, categoryId: 'cat1' }, { cat1: 5 }));
    expect(items[0]).toMatchObject({ commissionPct: 5, commissionUsd: 1 }); // 19.99 * 5% = 0.9995
  });

  it('falls back to the global rate when the category has none (NULL) or the product has no category', async () => {
    expect((await place(make({ commissionPct: '12' }, { ...live, categoryId: 'cat1' }, { cat1: null })))[0].commissionPct).toBe(12);
    expect((await place(make({ commissionPct: '9' }, { ...live, categoryId: 'gone' }, {})))[0].commissionPct).toBe(9);
    expect((await place(make({ commissionPct: '9' }, live)))[0].commissionPct).toBe(9);
  });

  it('0 is a real rate: a zero-commission category is not read as "unset"', async () => {
    const items = await place(make({ commissionPct: '12' }, { ...live, categoryId: 'cat0' }, { cat0: 0 }));
    expect(items[0]).toMatchObject({ commissionPct: 0, commissionUsd: 0 });
  });

  it('external (client-priced) lines have no category and keep the global rate', async () => {
    const items = await place(make({ commissionPct: '10' }, null, { cat1: 3 }), [{ name: 'Ext thing', priceUsd: 50, qty: 2 }]);
    expect(items[0]).toMatchObject({ commissionPct: 10, commissionUsd: 10 });
  });

  it('a store coupon recompute uses the line\'s own (category) rate on the discounted amount', async () => {
    const promos = { assertRedeemableIn: () => Promise.resolve(), validate: () => Promise.resolve({ ok: true, code: 'C', discount: 5, lineDiscounts: [5] }) };
    const r = make({ commissionPct: '12' }, { ...live, price: 20, categoryId: 'cat1' }, { cat1: 10 }, promos);
    await expect(r.svc.create(customer, { items: [{ productId: 'p1', qty: 1 }], paymentMethod: 'stripe_card', promoCode: 'C' } as never)).rejects.toThrow("stop here");
    expect(r.saved[0].items[0]).toMatchObject({ commissionPct: 10, couponDiscountUsd: 5, commissionUsd: 1.5 }); // (20 - 5) * 10%
  });
});
