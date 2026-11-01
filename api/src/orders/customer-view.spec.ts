import { BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { localDay } from '../common/delivery/estimate';

const rider = { id: 'r1', name: 'Rita Rider', phone: '+243900000009' };

function make(over: { product?: Record<string, unknown>; settings?: Record<string, string> } = {}) {
  const calls = { reserve: 0, saved: 0, last: null as null | Record<string, unknown> };
  const registered: Record<string, (u: string, p: unknown) => unknown> = {};
  const orders = {
    save: async (o: unknown) => {
      calls.saved++;
      calls.last = o as Record<string, unknown>;
      return o;
    },
    create: (o: unknown) => o,
    // The order and its translation snapshot are saved in one transaction; the fake runs it with the same save.
    manager: {
      find: async (_e: unknown, q: { where: { id: { _value?: string[] } } }) => (q ? [rider] : []),
      transaction: async (fn: (m: unknown) => unknown) => fn({ save: orders.save }),
    },
  };
  const product = { id: 'p1', name: 'Sneaker', nameFr: 'Basket', translationStatus: 'done', variantLabels: { en: [], fr: [] }, status: 'live', price: 10, stock: 5, sellerId: 's1', variants: JSON.stringify([{ name: 'Size', options: ['41', '42'] }]), ...over.product };
  const emitter = { registerFanout: () => undefined, registerUserView: (_e: string[], fn: (u: string, p: unknown) => unknown) => (registered.view = fn), toUser: () => undefined, toRoles: () => undefined };
  const noop = { registerOrderSettledHandler: () => undefined, registerFailedHandler: () => undefined, assertMethodAllowed: async () => undefined };
  const products = { get: async () => product, findLiveByName: async () => null, reserve: async () => (calls.reserve++, true), restock: async () => undefined };
  const sellers = { findOne: async () => null };
  const settings = { get: async (k: string) => over.settings?.[k] ?? null };
  const svc = new OrdersService(orders as never, {} as never, sellers as never, noop as never, products as never, {} as never, emitter as never, noop as never, {} as never, {} as never, settings as never, undefined, undefined, undefined, {} as never, { route: async () => ({ feeUsd: 3, deliveryUsd: 3, transferUsd: 0, distanceKm: 1, destinationHubId: 'h1', destinationHub: { id: 'h1', name: 'H', city: 'C' }, originHubIds: [], originBySeller: {}, transfer: false, pinned: true, fallback: null }) } as never);
  return { svc, calls, view: registered.view };
}

const line = (variant?: string) => ({ items: [{ productId: 'p1', qty: 1, variant }], paymentMethod: 'cod' as const, deliveryFeeUsd: 1 });

describe('OrdersService.create: variants and delivery estimate', () => {
  it('refuses a line without the required choice and reserves nothing', async () => {
    const { svc, calls } = make();
    await expect(svc.create({ id: 'c1', name: 'C' }, line())).rejects.toThrow('Choose a size for "Sneaker".');
    await expect(svc.create({ id: 'c1', name: 'C' }, line('Size: 99'))).rejects.toThrow(BadRequestException);
    expect(calls.reserve).toBe(0);
    expect(calls.saved).toBe(0);
  });

  it('stamps the estimated delivery day from the seller-set delivery time; the shopper sends no date', async () => {
    const { svc, calls } = make({ product: { deliveryDays: 5 } });
    await svc.create({ id: 'c1', name: 'C' }, line('Size: 41')).catch(() => undefined); // later steps need real services
    expect(calls.last?.estimatedDeliveryDate).toBe(localDay(new Date(), 5));
    expect(calls.last).not.toHaveProperty('deliverySlot');
  });
});

describe('customer view of an order', () => {
  const order = (status: string, riderId: string | null = 'r1') => ({ id: 'o1', customerId: 'c1', status, riderId, items: [] });

  it('adds the rider only while shipped / out for delivery, and only for the customer', async () => {
    const { svc, view } = make();
    for (const s of ['shipped', 'out_for_delivery']) {
      const out = (await view('c1', order(s))) as { rider: unknown };
      expect(out.rider).toEqual({ name: 'Rita Rider', phone: '+243900000009' });
    }
    for (const s of ['pending', 'confirmed', 'processing', 'delivered', 'cancelled']) {
      expect(view('c1', order(s))).not.toHaveProperty('rider');
    }
    expect(view('someone-else', order('shipped'))).not.toHaveProperty('rider');
    expect(view('c1', order('shipped', null))).not.toHaveProperty('rider');
    const list = await svc.withRiders([order('shipped'), order('delivered')] as never);
    expect(list[0]).toHaveProperty('rider');
    expect(list[1]).not.toHaveProperty('rider');
  });
});
