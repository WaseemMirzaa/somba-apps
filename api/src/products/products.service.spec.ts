import { ProductsService } from './products.service';
import type { Campaign, FlashSale, Product } from '../database/entities';

const product = (over: Partial<Product> = {}): Product =>
  ({ id: 'p1', name: 'Phone', sourceLang: 'en', categoryId: 'c1', price: 200, originalPrice: null, discount: 0, status: 'live', sellerId: 's1', stock: 5, ...over }) as Product;

const campaign = (over: Partial<Campaign> = {}): Campaign =>
  ({ id: 'c1', name: 'Spring', sellerId: 's1', discount: 25, status: 'active', startDate: null, endDate: null, productIds: [], ...over }) as Campaign;

function service(opts: { products?: Product[]; campaigns?: Campaign[]; flash?: Partial<FlashSale>[] }) {
  const rows = opts.products ?? [product()];
  const repo = { findOne: async ({ where }: { where: { id: string } }) => rows.find((p) => p.id === where.id) ?? null, find: async () => rows };
  const flash = { find: async () => opts.flash ?? [] };
  const campaigns = { find: async () => opts.campaigns ?? [] };
  const emitter = { registerFanout: () => undefined, toRoles: () => undefined, toUser: () => undefined };
  const sellers = { find: async () => [{ id: 's1', userId: null, name: 'Shop' }], findOne: async () => null };
  const categories = { names: async () => new Map([['c1', { name: 'Phones', nameFr: 'Téléphones' }]]) };
  const translations = {
    registerRepublisher: () => undefined,
    present: async (type: string, rs: { id: string; name?: string }[]) =>
      new Map(rs.map((r) => [r.id, { texts: type === 'product' ? { name: r.name, nameFr: r.name, description: null, descriptionFr: null } : { name: r.name, nameFr: r.name }, variantLabels: null, machineTranslated: [], translationStatus: 'done' }])),
  };
  return new ProductsService(repo as never, flash as never, sellers as never, campaigns as never, {} as never, emitter as never, categories as never, translations as never);
}

describe('ProductsService effective price', () => {
  it('leaves an undiscounted product alone and reports campaignPct 0', async () => {
    const p = await service({}).get('p1');
    expect(p).toMatchObject({ price: 200, basePrice: 200, priceSource: 'base', campaignPct: 0, campaignId: null });
  });

  it('applies a running store-wide campaign and keeps the old price as "was"', async () => {
    const p = await service({ campaigns: [campaign()] }).get('p1');
    expect(p).toMatchObject({ price: 150, originalPrice: 200, discount: 25, campaignPct: 25, campaignId: 'c1', campaignName: 'Spring', priceSource: 'campaign', basePrice: 200 });
  });

  it('does not touch the stored row object', async () => {
    const stored = product();
    const svc = service({ products: [stored], campaigns: [campaign()] });
    await svc.get('p1');
    expect(stored.price).toBe(200);
    expect(await svc.getRaw('p1')).toBe(stored);
  });

  it('ignores a campaign that is expired, pending, or for another store / product list', async () => {
    for (const c of [campaign({ endDate: '2020-01-01' }), campaign({ status: 'pending' }), campaign({ sellerId: 'other' }), campaign({ productIds: ['p9'] })]) {
      expect((await service({ campaigns: [c] }).get('p1'))?.price).toBe(200);
    }
  });

  it('takes the biggest of several campaigns', async () => {
    const p = await service({ campaigns: [campaign({ id: 'a', discount: 10 }), campaign({ id: 'b', discount: 30 })] }).get('p1');
    expect(p).toMatchObject({ price: 140, campaignId: 'b', campaignPct: 30 });
  });

  it('flash sale and campaign never stack: the lower price wins', async () => {
    const flash = (price: number) => [{ productId: 'p1', flashPrice: price, active: true, startsAt: null, endsAt: null }];
    expect(await service({ campaigns: [campaign()], flash: flash(190) }).get('p1')).toMatchObject({ price: 150, priceSource: 'campaign' });
    expect(await service({ campaigns: [campaign()], flash: flash(120) }).get('p1')).toMatchObject({ price: 120, priceSource: 'flash', campaignPct: 0, campaignId: null });
  });

  it('a campaign listing specific products only covers those', async () => {
    const svc = service({ products: [product(), product({ id: 'p2' })], campaigns: [campaign({ productIds: ['p2'] })] });
    expect((await svc.get('p1'))?.price).toBe(200);
    expect((await svc.get('p2'))?.price).toBe(150);
  });
});

describe('ProductsService delivery time (preparation + transit)', () => {
  function withStore(row: Partial<Product>, local: string | undefined, handlingDays = 0, expressDelivery = false) {
    const rows = [product(row)];
    const repo = { findOne: async () => rows[0], find: async () => rows };
    const emitter = { registerFanout: () => undefined, toRoles: () => undefined, toUser: () => undefined };
    const sellers = { find: async () => [{ id: 's1', userId: null, name: 'Shop', handlingDays, expressDelivery }], findOne: async () => null };
    const categories = { names: async () => new Map([['c1', { name: 'Phones', nameFr: 'Téléphones' }]]) };
    const translations = {
      registerRepublisher: () => undefined,
      present: async (_t: string, rs: { id: string; name?: string }[]) => new Map(rs.map((r) => [r.id, { texts: { name: r.name, nameFr: r.name, description: null, descriptionFr: null }, variantLabels: null, machineTranslated: [], translationStatus: 'done' }])),
    };
    const settingRows = { findOne: async () => (local === undefined ? null : { key: 'localDeliveryDays', value: local }) };
    return new ProductsService({ ...repo } as never, { find: async () => [] } as never, sellers as never, { find: async () => [] } as never, {} as never, emitter as never, categories as never, translations as never, undefined, settingRows as never);
  }

  it('serves prepDays, the total (prep + handling + local) and the legacy deliveryDays (prep + local, no handling)', async () => {
    const p = await withStore({ prepDays: 3, deliveryDays: 99 }, undefined, 2).get('p1');
    expect(p).toMatchObject({ prepDays: 3, sellerHandlingDays: 2, totalDeliveryDays: 6, deliveryDays: 4, sellerExpressDelivery: false });
    expect(p!.totalDeliveryDays).toBe(p!.deliveryDays + p!.sellerHandlingDays); // seller-platform-smoke L489
  });

  it('prepDays 0 is real: the product is served as 1 day (the platform\'s transit), never the old fallback of 3', async () => {
    expect(await withStore({ prepDays: 0 }, undefined).get('p1')).toMatchObject({ prepDays: 0, totalDeliveryDays: 1, deliveryDays: 1 });
    expect(await withStore({ prepDays: 0 }, '0').get('p1')).toMatchObject({ prepDays: 0, totalDeliveryDays: 1, deliveryDays: 1 }); // both clamped to at least 1
  });

  it('follows localDeliveryDays, and the express switch of the store is served', async () => {
    expect(await withStore({ prepDays: 2 }, '3', 0, true).get('p1')).toMatchObject({ totalDeliveryDays: 5, deliveryDays: 5, sellerExpressDelivery: true });
  });

  it('derives the preparation from the legacy figure for a row without one', async () => {
    expect(await withStore({ prepDays: undefined, deliveryDays: 4 }, undefined).get('p1')).toMatchObject({ prepDays: 3, deliveryDays: 4 });
  });
});
