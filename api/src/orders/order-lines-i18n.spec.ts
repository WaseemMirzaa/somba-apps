import { DataSource } from 'typeorm';
import { Order, OrderItem, Product, Translation } from '../database/entities';
import { OrderItemTranslationSubscriber } from '../translation/order-item-translation.subscriber';
import { addProduct, testDb, testTranslations } from '../testing/test-db';
import type { TranslationService } from '../translation/translation.service';
import { OrdersService } from './orders.service';

let ds: DataSource;
let translations: TranslationService;
let subscriber: OrderItemTranslationSubscriber;

beforeEach(async () => {
  ds = await testDb();
  translations = testTranslations(ds);
  subscriber = new OrderItemTranslationSubscriber(ds, translations);
});
afterEach(async () => ds.destroy());

let n = 0;
async function order(items: Partial<OrderItem>[]): Promise<Order> {
  const repo = ds.getRepository(Order);
  return repo.save(
    repo.create({
      reference: `SOM-${++n}`,
      customerId: 'c1',
      customerName: 'Cust',
      items: items.map((i) => ({ qty: 1, priceUsd: 10, variant: 'Default', productName: 'Thing', ...i })) as OrderItem[],
    }),
  );
}
const load = (id: string) => ds.getRepository(Order).findOneOrFail({ where: { id } });

describe('order lines are served with productNameFr and variantFr', () => {
  it('uses the snapshot written when the order was placed', async () => {
    const p = await addProduct(ds, { name: 'Wireless Earbuds' });
    const o = await order([{ productId: p.id, productName: 'Wireless Earbuds', variant: 'Colour: Black' }]);
    await translations.snapshot(ds.manager, [
      { entityId: o.items[0].id, field: 'productName', locale: 'fr', value: 'Écouteurs sans fil' },
      { entityId: o.items[0].id, field: 'variant', locale: 'fr', value: 'Couleur : Noir' },
    ]);
    const line = (await load(o.id)).items[0];
    expect(line).toMatchObject({ productName: 'Wireless Earbuds', productNameFr: 'Écouteurs sans fil', variant: 'Colour: Black', variantFr: 'Couleur : Noir' });
  });

  it('a later rename of the product never rewrites the order (the snapshot wins)', async () => {
    const p = await addProduct(ds, { name: 'Wireless Earbuds' });
    const o = await order([{ productId: p.id, productName: 'Wireless Earbuds' }]);
    await translations.snapshot(ds.manager, [{ entityId: o.items[0].id, field: 'productName', locale: 'fr', value: 'Écouteurs sans fil' }]);
    await ds.getRepository(Translation).insert({ entityType: 'product', entityId: p.id, field: 'name', locale: 'fr', value: 'Nouveau nom', origin: 'author', sourceLang: 'en', sourceHash: null });
    expect((await load(o.id)).items[0].productNameFr).toBe('Écouteurs sans fil');
  });

  it('an older order (no snapshot) falls back to the product\'s CURRENT translation, option labels included', async () => {
    const p = await addProduct(ds, { name: 'Hat', variants: JSON.stringify([{ name: 'Colour', options: ['Red', 'Blue'] }]) });
    const repo = ds.getRepository(Translation);
    await repo.insert([
      { entityType: 'product', entityId: p.id, field: 'name', locale: 'fr', value: 'Chapeau', origin: 'author', sourceLang: 'en', sourceHash: null },
      { entityType: 'product', entityId: p.id, field: 'variants', locale: 'fr', value: JSON.stringify([{ name: 'Couleur', options: ['Rouge', 'Bleu'] }]), origin: 'author', sourceLang: 'en', sourceHash: null },
    ]);
    const o = await order([{ productId: p.id, productName: 'Hat', variant: 'Colour: Blue' }]);
    expect((await load(o.id)).items[0]).toMatchObject({ productNameFr: 'Chapeau', variantFr: 'Couleur: Bleu' });
  });

  it('else the name and label as stored (deleted product, client-priced line)', async () => {
    const o = await order([
      { productId: 'gone', productName: 'Old Thing', variant: 'Size: 42' },
      { productId: 'ext:Widget', productName: 'Widget' },
    ]);
    const lines = (await load(o.id)).items;
    expect(lines.map((l) => [l.productNameFr, l.variantFr])).toEqual(expect.arrayContaining([['Old Thing', 'Size: 42'], ['Widget', null]]));
  });

  describe('a product without options has no variantFr (null, not "Default")', () => {
    it.each([['Default'], ['']])('canonical variant %j -> variantFr null, whatever the product is', async (variant) => {
      const p = await addProduct(ds, { name: 'Hat' });
      await ds.getRepository(Translation).insert({ entityType: 'product', entityId: p.id, field: 'name', locale: 'fr', value: 'Chapeau', origin: 'author', sourceLang: 'en', sourceHash: null });
      const o = await order([
        { productId: p.id, productName: 'Hat', variant }, // product with a French name
        { productId: 'gone', productName: 'Old Thing', variant }, // product that no longer exists
        { productId: 'ext:Widget', productName: 'Widget', variant }, // client-priced line
      ]);
      const lines = (await load(o.id)).items;
      expect(lines).toHaveLength(3);
      for (const l of lines) expect(l.variantFr).toBeNull();
      expect(lines.find((l) => l.productId === p.id)?.productNameFr).toBe('Chapeau'); // the name is still translated
    });

    it('even a stray snapshot row cannot bring the word back', async () => {
      const p = await addProduct(ds, { name: 'Hat' });
      const o = await order([{ productId: p.id, productName: 'Hat', variant: 'Default' }]);
      await translations.snapshot(ds.manager, [{ entityId: o.items[0].id, field: 'variant', locale: 'fr', value: 'Default' }]);
      expect((await load(o.id)).items[0].variantFr).toBeNull();
    });

    it('serializes as null (what clients receive), next to a line that has options', async () => {
      const p = await addProduct(ds, { name: 'Hat', variants: JSON.stringify([{ name: 'Colour', options: ['Red'] }]) });
      const o = await order([{ productId: p.id, productName: 'Hat', variant: 'Colour: Red' }, { productId: p.id, productName: 'Hat', variant: 'Default' }]);
      const wire = JSON.parse(JSON.stringify((await load(o.id)).items)) as { variant: string; variantFr: string | null }[];
      expect(wire.find((l) => l.variant === 'Default')).toHaveProperty('variantFr', null);
      expect(wire.find((l) => l.variant === 'Colour: Red')?.variantFr).toBe('Colour: Red');
    });
  });

  it('a product without a French name serves the English one', async () => {
    const p = await addProduct(ds, { name: 'Wireless Earbuds' });
    const o = await order([{ productId: p.id, productName: 'Wireless Earbuds' }]);
    expect((await load(o.id)).items[0].productNameFr).toBe('Wireless Earbuds');
  });

  it('lines loaded together are resolved with one lookup of snapshots and one of products', async () => {
    const p = await addProduct(ds, { name: 'Wireless Earbuds' });
    for (let i = 0; i < 12; i++) await order([{ productId: p.id }, { productId: p.id }]);
    const rowsFor = jest.spyOn(translations, 'rowsFor');
    const orders = await ds.getRepository(Order).find();
    expect(orders).toHaveLength(12);
    expect(orders.every((o) => o.items.every((i) => typeof i.productNameFr === 'string'))).toBe(true);
    expect(rowsFor.mock.calls.filter(([type]) => type === 'order_item')).toHaveLength(1);
    expect(rowsFor.mock.calls.filter(([type]) => type === 'product')).toHaveLength(1);
  });

  it('the seller\'s redacted view and the rider\'s list read the same lines (they load orders the same way)', async () => {
    const p = await addProduct(ds, { name: 'Wireless Earbuds' });
    const o = await order([{ productId: p.id }]);
    await translations.snapshot(ds.manager, [{ entityId: o.items[0].id, field: 'productName', locale: 'fr', value: 'Écouteurs' }]);
    const viaQuery = await ds.getRepository(Order).createQueryBuilder('o').leftJoinAndSelect('o.items', 'i').where('o.id = :id', { id: o.id }).getOne();
    expect(viaQuery?.items[0].productNameFr).toBe('Écouteurs');
    void subscriber;
  });
});

describe('OrdersService.create writes the snapshot with the order', () => {
  const product = (over: Record<string, unknown> = {}) => ({
    id: 'p1', name: 'Wireless Earbuds', nameFr: 'Écouteurs sans fil', translationStatus: 'done', status: 'live', price: 20, stock: 9, sellerId: 's1', sellerName: 'Shop',
    variants: JSON.stringify([{ name: 'Colour', options: ['Black', 'White'] }]),
    variantLabels: { en: [], fr: [{ name: 'Couleur', options: ['Noir', 'Blanc'] }] },
    ...over,
  });

  function make(p: Record<string, unknown>) {
    const snapshots: { entityId: string; field: string; locale: string; value: string }[][] = [];
    const saved: { items: Record<string, unknown>[] }[] = [];
    let txs = 0;
    const save = async (o: { items: Record<string, unknown>[] }) => {
      o.items.forEach((i, k) => (i.id = `item-${k}`));
      saved.push(o);
      return o;
    };
    const orders: Record<string, unknown> = { create: (o: unknown) => o, save };
    orders.manager = { transaction: async (fn: (m: unknown) => unknown) => (txs++, fn({ save })) };
    const emitter = { registerFanout: () => undefined, registerUserView: () => undefined };
    const payments = { registerOrderSettledHandler: () => undefined, assertMethodAllowed: async () => undefined, processForOrder: async () => { throw new Error('stop here'); } };
    const products = { get: async () => p, findLiveByName: async () => null, reserve: async () => true, restock: async () => undefined };
    const tr = { snapshot: async (_m: unknown, rows: (typeof snapshots)[number]) => void snapshots.push(rows) };
    const svc = new OrdersService(
      orders as never, {} as never, { findOne: async () => null } as never, { registerFailedHandler: () => undefined } as never, products as never, {} as never,
      emitter as never, payments as never, {} as never, {} as never, { get: async () => null } as never, undefined, undefined, tr as never, {} as never, { route: async () => ({ feeUsd: 3, deliveryUsd: 3, transferUsd: 0, distanceKm: 1, destinationHubId: 'h1', destinationHub: { id: 'h1', name: 'H', city: 'C' }, originHubIds: [], originBySeller: {}, transfer: false, pinned: true, fallback: null }) } as never,
    );
    return { svc, snapshots, saved, txs: () => txs };
  }
  const buy = (svc: OrdersService, variant = 'Colour: Black') =>
    svc.create({ id: 'c1', name: 'C' }, { items: [{ productId: 'p1', qty: 1, variant }], paymentMethod: 'cod' }).catch(() => undefined);

  it('snapshots the French name and the French option label in the same transaction as the order', async () => {
    const { svc, snapshots, txs } = make(product());
    await buy(svc);
    expect(txs()).toBe(1);
    expect(snapshots).toEqual([
      [
        { entityId: 'item-0', field: 'productName', locale: 'fr', value: 'Écouteurs sans fil' },
        { entityId: 'item-0', field: 'variant', locale: 'fr', value: 'Couleur: Noir' },
      ],
    ]);
  });

  it('does not freeze a French that is only the English fallback of a translation still pending', async () => {
    const { svc, snapshots } = make(product({ nameFr: 'Wireless Earbuds', translationStatus: 'pending', variantLabels: { en: [], fr: JSON.parse(product().variants as string) } }));
    await buy(svc);
    expect(snapshots[0]).toEqual([]);
  });

  it('a product without options is placed with variantFr null, and no variant snapshot', async () => {
    const { svc, snapshots, saved } = make(product({ variants: null, variantLabels: { en: [], fr: [] } }));
    await buy(svc, 'Default');
    expect(saved.length).toBeGreaterThan(0); // saved with the order (and again when the failed payment cancels it)
    expect(saved[0].items[0]).toMatchObject({ variant: 'Default', variantFr: null, productNameFr: 'Écouteurs sans fil' });
    expect(snapshots[0]).toEqual([{ entityId: 'item-0', field: 'productName', locale: 'fr', value: 'Écouteurs sans fil' }]);
  });

  it('a product with options keeps its French label on the order it returns', async () => {
    const { svc, saved } = make(product());
    await buy(svc);
    expect(saved[0].items[0]).toMatchObject({ variant: 'Colour: Black', variantFr: 'Couleur: Noir' });
  });
});
