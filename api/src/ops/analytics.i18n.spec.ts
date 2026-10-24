import { DataSource } from 'typeorm';
import {
  Category,
  DeliveryTask,
  Dispute,
  FlashSale,
  Campaign,
  Hub,
  Order,
  OrderItem,
  Payment,
  Payout,
  Product,
  ProductView,
  Review,
  Seller,
  Translation,
  User,
  WarehouseBatch,
} from '../database/entities';
import { CategoriesService } from '../catalog/categories.service';
import { ProductsService } from '../products/products.service';
import { addCategory, addProduct, addSeller, recordingEmitter, testDb, testTranslations } from '../testing/test-db';
import { sourceHash } from '../translation/translatable';
import type { TranslationService } from '../translation/translation.service';
import { AnalyticsService } from './analytics.service';

let ds: DataSource;
let translations: TranslationService;
let products: ProductsService;
let analytics: AnalyticsService;

beforeEach(async () => {
  ds = await testDb();
  translations = testTranslations(ds);
  const emitter = recordingEmitter();
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
  const r = <T extends object>(e: new () => T) => ds.getRepository(e);
  analytics = new AnalyticsService(
    ds,
    r(Order),
    r(OrderItem),
    r(Payment),
    r(Product),
    r(User),
    r(Seller),
    r(Payout),
    r(Dispute),
    r(DeliveryTask),
    r(Review),
    r(ProductView),
    r(Hub),
    r(WarehouseBatch),
    { get: async () => '12' } as never,
    categories,
    products,
  );
});
afterEach(async () => ds.destroy());

let n = 0;
async function order(lines: { product: Product; qty?: number; price?: number }[]): Promise<Order> {
  const repo = ds.getRepository(Order);
  return repo.save(
    repo.create({
      reference: `SOM-${++n}`,
      customerId: 'c1',
      customerName: 'Cust',
      totalUsd: 10,
      items: lines.map((l) => ({ productId: l.product.id, productName: l.product.name, variant: 'Default', qty: l.qty ?? 1, priceUsd: l.price ?? 10 })) as OrderItem[],
    }),
  );
}
const french = (entityType: 'product' | 'category', entityId: string, value: string) =>
  ds.getRepository(Translation).insert({ entityType, entityId, field: 'name', locale: 'fr', value, origin: 'author', sourceLang: 'en', sourceHash: null });

describe('analytics:seller topProducts carry nameFr', () => {
  it('serves name and nameFr for every best seller', async () => {
    const seller = await addSeller(ds);
    const earbuds = await addProduct(ds, { name: 'Wireless Earbuds', sellerId: seller.id });
    const hat = await addProduct(ds, { name: 'Hat', sellerId: seller.id });
    await french('product', earbuds.id, 'Écouteurs sans fil');
    await order([{ product: earbuds, qty: 3 }]);
    await order([{ product: hat, qty: 1, price: 4 }]);

    const stats = await analytics.sellerStats(seller, 30, 5);
    expect(stats.topProducts).toEqual([
      { productId: earbuds.id, name: 'Wireless Earbuds', nameFr: 'Écouteurs sans fil', units: 3, revenue: 30 },
      { productId: hat.id, name: 'Hat', nameFr: 'Hat', units: 1, revenue: 4 }, // no French yet: the English title, never empty
    ]);
  });

  it('a product written in French serves its French title and the machine English', async () => {
    const seller = await addSeller(ds);
    const p = await addProduct(ds, { name: 'Chapeau', sourceLang: 'fr', sellerId: seller.id });
    await ds.getRepository(Translation).insert({ entityType: 'product', entityId: p.id, field: 'name', locale: 'en', value: 'Hat', origin: 'machine', sourceLang: 'fr', sourceHash: sourceHash('fr', 'Chapeau') });
    await order([{ product: p }]);
    const [top] = (await analytics.sellerStats(seller)).topProducts;
    expect(top).toMatchObject({ name: 'Hat', nameFr: 'Chapeau' });
  });

  it('both languages follow the listing, so a rename shows in each (the order line keeps its old name)', async () => {
    const seller = await addSeller(ds);
    const p = await addProduct(ds, { name: 'Wireless Earbuds', sellerId: seller.id });
    await order([{ product: p }]);
    await ds.getRepository(Product).update({ id: p.id }, { name: 'Earbuds Pro' });
    await french('product', p.id, 'Écouteurs Pro');
    const [top] = (await analytics.sellerStats(seller)).topProducts;
    expect(top).toMatchObject({ name: 'Earbuds Pro', nameFr: 'Écouteurs Pro' });
  });

  it('looks the titles up in one batch, however many products are listed', async () => {
    const seller = await addSeller(ds);
    for (let i = 0; i < 8; i++) await order([{ product: await addProduct(ds, { name: `Thing ${i}`, sellerId: seller.id }), price: 10 + i }]);
    const names = jest.spyOn(products, 'names');
    const rowsFor = jest.spyOn(translations, 'rowsFor');
    const { topProducts } = await analytics.sellerStats(seller, 30, 8);
    expect(topProducts).toHaveLength(8);
    expect(names).toHaveBeenCalledTimes(1);
    expect(rowsFor.mock.calls.filter(([type]) => type === 'product')).toHaveLength(1);
  });

  it('a store with no sales has an empty list', async () => {
    const seller = await addSeller(ds);
    expect((await analytics.sellerStats(seller)).topProducts).toEqual([]);
  });
});

describe('analytics:admin gmvByCategory carries categoryFr', () => {
  it('serves category and categoryFr per bucket, and "Other" / "Autres" for products without a category', async () => {
    const electronics = await addCategory(ds, 'Electronics', 'Électronique');
    const fashion = await addCategory(ds, 'Fashion'); // no French yet
    const phone = await addProduct(ds, { name: 'Phone', categoryId: electronics.id });
    const shirt = await addProduct(ds, { name: 'Shirt', categoryId: fashion.id });
    const loose = await addProduct(ds, { name: 'Loose', categoryId: null });
    await order([{ product: phone, price: 100 }]);
    await order([{ product: shirt, price: 30 }]);
    await order([{ product: loose, price: 5 }]);

    const { gmvByCategory } = await analytics.adminStats();
    expect(gmvByCategory).toEqual([
      { category: 'Electronics', categoryFr: 'Électronique', categoryId: electronics.id, gmv: 100, orders: 1 },
      { category: 'Fashion', categoryFr: 'Fashion', categoryId: fashion.id, gmv: 30, orders: 1 },
      { category: 'Other', categoryFr: 'Autres', categoryId: null, gmv: 5, orders: 1 },
    ]);
  });

  it('a renamed category stays one bucket, in both languages', async () => {
    const c = await addCategory(ds, 'Gadgets', 'Bidules');
    await order([{ product: await addProduct(ds, { name: 'A', categoryId: c.id }) }]);
    await ds.getRepository(Category).update({ id: c.id }, { name: 'Gizmos' });
    const { gmvByCategory } = await analytics.adminStats();
    expect(gmvByCategory).toHaveLength(1);
    expect(gmvByCategory[0]).toMatchObject({ category: 'Gizmos', categoryFr: 'Bidules' });
  });
});
