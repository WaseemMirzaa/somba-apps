import { DataSource } from 'typeorm';
import { Campaign, Category, Exchange, FlashSale, Order, OrderItem, Product, ProductView, Replacement, Seller, Translation } from '../database/entities';
import { CategoriesService } from '../catalog/categories.service';
import { ProductsService } from '../products/products.service';
import { addProduct, recordingEmitter, testDb, testTranslations } from '../testing/test-db';
import type { TranslationService } from '../translation/translation.service';
import { AfterSaleNames } from './after-sale-names';
import { ExchangesService } from './exchanges.service';
import { ReplacementsService } from './replacements.service';

let ds: DataSource;
let translations: TranslationService;
let products: ProductsService;
let names: AfterSaleNames;
let emitter: ReturnType<typeof recordingEmitter>;
let replacements: ReplacementsService;
let exchanges: ExchangesService;

const notifications = { toRole: async () => undefined, toUser: async () => undefined, toUsers: async () => undefined };
const admin = { id: 'a1', name: 'Admin', role: 'admin' };

beforeEach(async () => {
  ds = await testDb();
  translations = testTranslations(ds);
  emitter = recordingEmitter();
  const categories = new CategoriesService(ds.getRepository(Category), ds.getRepository(Product), emitter as never, translations);
  products = new ProductsService(
    ds.getRepository(Product),
    ds.getRepository(FlashSale),
    ds.getRepository(Seller),
    ds.getRepository(Campaign),
    ds.getRepository(ProductView),
    emitter as never,
    categories,
    translations,
  );
  names = new AfterSaleNames(ds.getRepository(OrderItem), translations, products);
  replacements = new ReplacementsService(
    ds.getRepository(Replacement),
    ds.getRepository(Order),
    ds.getRepository(Seller),
    notifications as never,
    emitter as never,
    products,
    names,
  );
  exchanges = new ExchangesService(ds.getRepository(Exchange), ds.getRepository(Order), ds.getRepository(Seller), notifications as never, emitter as never, products, names);
});
afterEach(async () => ds.destroy());

let n = 0;
async function order(lines: { product: Product; name?: string }[], status: Order['status'] = 'delivered'): Promise<Order> {
  const repo = ds.getRepository(Order);
  return repo.save(
    repo.create({
      reference: `SOM-${++n}`,
      customerId: 'c1',
      customerName: 'Cust',
      status,
      totalUsd: 10,
      items: lines.map((l) => ({ productId: l.product.id, productName: l.name ?? l.product.name, variant: 'Default', qty: 1, priceUsd: 10 })) as OrderItem[],
    }),
  );
}
const french = (entityType: 'product' | 'order_item', entityId: string, field: string, value: string) =>
  ds.getRepository(Translation).insert({ entityType, entityId, field, locale: 'fr', value, origin: entityType === 'order_item' ? 'snapshot' : 'author', sourceLang: null, sourceHash: null });

async function product(name: string, nameFr?: string) {
  const p = await addProduct(ds, { name });
  if (nameFr) await french('product', p.id, 'name', nameFr);
  return p;
}

describe('replacements carry productNameFr', () => {
  it('uses the snapshot of the order line, even if the product was renamed since', async () => {
    const p = await product('Wireless Earbuds', 'Écouteurs (nouveau nom)');
    const o = await order([{ product: p }]);
    await french('order_item', o.items[0].id, 'productName', 'Écouteurs sans fil');
    const rep = await replacements.create(admin, { orderId: o.id, sku: p.id, productName: 'Wireless Earbuds', reason: 'Dead on arrival', condition: 'customer_reported' });
    expect(rep).toMatchObject({ productName: 'Wireless Earbuds', productNameFr: 'Écouteurs sans fil', reason: 'Dead on arrival', condition: 'customer_reported' });
    const [listed] = await replacements.list(admin);
    expect(listed).toMatchObject({ id: rep.id, productNameFr: 'Écouteurs sans fil' });
  });

  it('falls back to the product\'s current translation when the line has no snapshot (older orders)', async () => {
    const p = await product('Hat', 'Chapeau');
    const o = await order([{ product: p }]);
    const rep = await replacements.create(admin, { orderId: o.id, sku: p.id, productName: 'Hat' });
    expect(rep.productNameFr).toBe('Chapeau');
  });

  it('is null when the item cannot be told: no matching line and not a product', async () => {
    const p = await product('Hat', 'Chapeau');
    const o = await order([{ product: p }]);
    const rep = await replacements.create(admin, { orderId: o.id, sku: 'A', productName: 'Cov Item' });
    expect(rep.productNameFr).toBeNull();
    expect((await replacements.list(admin))[0].productNameFr).toBeNull();
  });

  it('is null when the stored name is not that item\'s name (free text must not borrow another text\'s translation)', async () => {
    const p = await product('Hat', 'Chapeau');
    const o = await order([{ product: p }]);
    const rep = await replacements.create(admin, { orderId: o.id, sku: p.id, productName: 'My lovely old hat' });
    expect(rep.productNameFr).toBeNull();
  });

  it('matches a name written with different case or spacing', async () => {
    const p = await product('Hat', 'Chapeau');
    const o = await order([{ product: p }]);
    expect((await replacements.create(admin, { orderId: o.id, sku: p.id, productName: '  hat ' })).productNameFr).toBe('Chapeau');
  });

  it('every update event carries it: created and status changes', async () => {
    const p = await product('Hat', 'Chapeau');
    const o = await order([{ product: p }]);
    const rep = await replacements.create(admin, { orderId: o.id, sku: p.id, productName: 'Hat' });
    const approved = await replacements.setStatus(rep.id, 'approved');
    expect(approved).toMatchObject({ status: 'approved', productNameFr: 'Chapeau' });
    const events = emitter.sent.filter((e) => e.event === 'replacement:updated');
    expect(events.length).toBeGreaterThanOrEqual(4); // ops + customer on create, ops + customer on status
    for (const e of events) expect(e.payload).toMatchObject({ id: rep.id, productNameFr: 'Chapeau' });
  });

  it('the customer\'s own list has it too', async () => {
    const p = await product('Hat', 'Chapeau');
    const o = await order([{ product: p }]);
    await replacements.create(admin, { orderId: o.id, sku: p.id, productName: 'Hat' });
    expect((await replacements.list({ id: 'c1', role: 'customer' }))[0].productNameFr).toBe('Chapeau');
    expect(await replacements.list({ id: 'someone-else', role: 'customer' })).toEqual([]);
  });
});

describe('exchanges carry fromNameFr and toNameFr', () => {
  it('resolves the item given back, and leaves what the customer typed untranslated', async () => {
    const p = await product('Wireless Earbuds', 'Écouteurs (nouveau nom)');
    const o = await order([{ product: p }]);
    await french('order_item', o.items[0].id, 'productName', 'Écouteurs sans fil');
    const ex = await exchanges.create(admin, { orderId: o.id, fromSku: p.id, fromName: 'Wireless Earbuds', toSku: p.id, toName: 'Wireless Earbuds (other size)', reason: 'Too small' });
    expect(ex).toMatchObject({ fromName: 'Wireless Earbuds', fromNameFr: 'Écouteurs sans fil', toName: 'Wireless Earbuds (other size)', toNameFr: null, reason: 'Too small' });
  });

  it('resolves the item wanted when it is another listing (named as the listing is)', async () => {
    const hat = await product('Hat', 'Chapeau');
    const cap = await product('Cap', 'Casquette');
    const o = await order([{ product: hat }]);
    const ex = await exchanges.create(admin, { orderId: o.id, fromSku: hat.id, fromName: 'Hat', toSku: cap.id, toName: 'Cap' });
    expect(ex).toMatchObject({ fromNameFr: 'Chapeau', toNameFr: 'Casquette' });
  });

  it('is null for both when nothing matches', async () => {
    const o = await order([{ product: await product('Hat') }]);
    const ex = await exchanges.create(admin, { orderId: o.id, fromSku: 'A', fromName: 'Cov Item', toSku: 'B', toName: 'Bigger one' });
    expect(ex).toMatchObject({ fromNameFr: null, toNameFr: null });
  });

  it('the list and every update event carry them', async () => {
    const p = await product('Hat', 'Chapeau');
    const o = await order([{ product: p }]);
    const ex = await exchanges.create(admin, { orderId: o.id, fromSku: p.id, fromName: 'Hat', toSku: p.id, toName: 'Hat' });
    await exchanges.setStatus(ex.id, 'approved');
    expect((await exchanges.list(admin))[0]).toMatchObject({ fromNameFr: 'Chapeau', toNameFr: 'Chapeau' });
    const events = emitter.sent.filter((e) => e.event === 'exchange:updated');
    expect(events.length).toBeGreaterThanOrEqual(4);
    for (const e of events) expect(e.payload).toMatchObject({ id: ex.id, fromNameFr: 'Chapeau', toNameFr: 'Chapeau' });
  });
});

describe('lookups are batched', () => {
  it('a list of many requests costs one lookup of order lines, one of snapshots and one of listing titles', async () => {
    const p = await product('Hat', 'Chapeau');
    const q = await product('Cap', 'Casquette');
    for (let i = 0; i < 6; i++) {
      const o = await order([{ product: i % 2 ? p : q }]);
      const prod = i % 2 ? p : q;
      await replacements.create(admin, { orderId: o.id, sku: prod.id, productName: prod.name });
      await exchanges.create(admin, { orderId: o.id, fromSku: prod.id, fromName: prod.name, toSku: prod.id, toName: prod.name });
    }
    const lines = jest.spyOn(ds.getRepository(OrderItem), 'createQueryBuilder');
    const rowsFor = jest.spyOn(translations, 'rowsFor');
    const productNames = jest.spyOn(products, 'names');

    const reps = await replacements.list(admin);
    expect(reps).toHaveLength(6);
    expect(reps.map((r) => r.productNameFr).sort()).toEqual(['Casquette', 'Casquette', 'Casquette', 'Chapeau', 'Chapeau', 'Chapeau']);
    expect(lines).toHaveBeenCalledTimes(1);
    expect(rowsFor.mock.calls.filter(([t]) => t === 'order_item')).toHaveLength(1);
    expect(productNames).toHaveBeenCalledTimes(1);

    lines.mockClear();
    rowsFor.mockClear();
    productNames.mockClear();
    const exs = await exchanges.list(admin);
    expect(exs).toHaveLength(6);
    expect(exs.every((x) => x.fromNameFr && x.toNameFr)).toBe(true);
    expect(lines).toHaveBeenCalledTimes(1);
    expect(rowsFor.mock.calls.filter(([t]) => t === 'order_item')).toHaveLength(1);
    expect(productNames).toHaveBeenCalledTimes(1);
  });

  it('an empty list costs nothing', async () => {
    const lines = jest.spyOn(ds.getRepository(OrderItem), 'createQueryBuilder');
    expect(await replacements.list(admin)).toEqual([]);
    expect(await exchanges.list(admin)).toEqual([]);
    expect(lines).not.toHaveBeenCalled();
  });
});

describe('a failed lookup never breaks the list', () => {
  it('serves the requests with null French names', async () => {
    const p = await product('Hat', 'Chapeau');
    const o = await order([{ product: p }]);
    await replacements.create(admin, { orderId: o.id, sku: p.id, productName: 'Hat' });
    jest.spyOn(products, 'names').mockRejectedValue(new Error('db down'));
    const [r] = await replacements.list(admin);
    expect(r).toMatchObject({ productName: 'Hat', productNameFr: null });
  });
});

