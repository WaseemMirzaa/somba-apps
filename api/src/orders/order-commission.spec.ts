import { OrdersService } from './orders.service';

/** The platform commission in force at order time is frozen on every line (A-B15). */
function make(settings: Record<string, string>, product: Record<string, unknown> | null) {
  const saved: { items: Record<string, unknown>[] }[] = [];
  const orders: Record<string, unknown> = {
    create: (o: unknown) => o,
    save: (o: { items: Record<string, unknown>[] }) => {
      saved.push(o);
      return Promise.resolve(o);
    },
  };
  // The order and its translation snapshot are saved in one transaction; the fake runs it with the same save.
  orders.manager = { transaction: (fn: (m: unknown) => unknown) => fn({ save: orders.save }) };
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
  const svc = new OrdersService(orders as never, {} as never, sellers as never, delivery as never, products as never, {} as never, emitter as never, payments as never, {} as never, {} as never, cfg as never);
  return { svc, saved };
}

const live = { id: 'p1', name: 'Phone', nameFr: 'Téléphone', translationStatus: 'done', variantLabels: { en: [], fr: [] }, status: 'live', price: 19.99, stock: 50, sellerId: 's1', variants: null };
const customer = { id: 'c1', name: 'Cust' };

describe('OrdersService.create: commission snapshot', () => {
  it('stores the rate and the amount on every line (rounded to cents)', async () => {
    const { svc, saved } = make({ commissionPct: '12' }, live);
    await expect(svc.create(customer, { items: [{ productId: 'p1', qty: 3 }], paymentMethod: 'cod' })).rejects.toThrow('stop here');
    expect(saved[0].items[0]).toMatchObject({ commissionPct: 12, commissionUsd: 7.2 }); // 19.99 * 3 * 12% = 7.1964
  });

  it('defaults to 12% when the setting is absent and clamps to 0-100', async () => {
    let r = make({}, live);
    await expect(r.svc.create(customer, { items: [{ productId: 'p1', qty: 1 }], paymentMethod: 'cod' })).rejects.toThrow();
    expect(r.saved[0].items[0].commissionPct).toBe(12);
    r = make({ commissionPct: '250' }, live);
    await expect(r.svc.create(customer, { items: [{ productId: 'p1', qty: 1 }], paymentMethod: 'cod' })).rejects.toThrow();
    expect(r.saved[0].items[0]).toMatchObject({ commissionPct: 100, commissionUsd: 19.99 });
    r = make({ commissionPct: '-5' }, live);
    await expect(r.svc.create(customer, { items: [{ productId: 'p1', qty: 1 }], paymentMethod: 'cod' })).rejects.toThrow();
    expect(r.saved[0].items[0]).toMatchObject({ commissionPct: 0, commissionUsd: 0 });
  });

  it('also stores it on client-priced (external) lines', async () => {
    const { svc, saved } = make({ commissionPct: '10' }, null);
    await expect(svc.create(customer, { items: [{ name: 'Ext thing', priceUsd: 50, qty: 2 }], paymentMethod: 'cod' })).rejects.toThrow('stop here');
    expect(saved[0].items[0]).toMatchObject({ commissionPct: 10, commissionUsd: 10 });
  });
});
