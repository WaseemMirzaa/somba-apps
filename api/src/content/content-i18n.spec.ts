import { DataSource } from 'typeorm';
import { Campaign, CmsBlock, FlashSale, Order, OrderItem, Payout, Product, Seller, Translation } from '../database/entities';
import { CampaignsService } from '../flows/campaigns.service';
import { SellersService } from '../ops/sellers.service';
import { ProductsService } from '../products/products.service';
import { addProduct, addSeller, recordingEmitter, testDb, testTranslations } from '../testing/test-db';
import { FakeTranslator } from '../translation/fake.translator';
import type { TranslationService } from '../translation/translation.service';
import { CmsService } from './cms.service';
import { PromosService } from './promos.service';

let ds: DataSource;
let translations: TranslationService;
let emitter: ReturnType<typeof recordingEmitter>;

beforeEach(async () => {
  ds = await testDb();
  translations = testTranslations(ds, new FakeTranslator());
  emitter = recordingEmitter();
});
afterEach(async () => ds.destroy());

describe('CMS blocks', () => {
  const cms = () => new CmsService(ds.getRepository(CmsBlock), emitter as never, translations);

  it('English: the French appears after the job; title and body are served in both languages and re-emitted', async () => {
    const svc = cms();
    const b = await svc.upsert({ key: 'home-hero', title: 'Shop everything', body: 'Fast delivery across Kinshasa.', type: 'banner' });
    expect(b).toMatchObject({ title: 'Shop everything', titleFr: 'Shop everything', body: 'Fast delivery across Kinshasa.', sourceLang: 'en' });
    emitter.sent.length = 0;
    await translations.runJob('cms_block', b.id);
    const [out] = await svc.list(true);
    expect(out).toMatchObject({ titleFr: '[fr] Shop everything', bodyFr: '[fr] Fast delivery across Kinshasa.', machineTranslated: ['titleFr', 'bodyFr'] });
    expect(emitter.sent.find((e) => e.event === 'cms:updated')?.payload).toMatchObject({ key: 'home-hero', titleFr: '[fr] Shop everything' });
  });

  it('French only, then an English edit by hand; the admin\'s French survives', async () => {
    const svc = cms();
    const b = await svc.upsert({ key: 'k', titleFr: 'Grande vente', bodyFr: 'Tout doit partir.' });
    expect(b.sourceLang).toBe('fr');
    await translations.runJob('cms_block', b.id);
    expect((await svc.list(true))[0]).toMatchObject({ title: '[en] Grande vente', body: '[en] Tout doit partir.', titleFr: 'Grande vente' });
    await svc.upsert({ key: 'k', title: 'Big sale' });
    expect((await svc.list(true))[0]).toMatchObject({ title: 'Big sale', titleFr: 'Grande vente' });
  });

  it('a new block needs a title and a body; shoppers only see active blocks', async () => {
    const svc = cms();
    await expect(svc.upsert({ key: 'x', title: 'Only a title' })).rejects.toThrow('A new block needs a title and a body.');
    await expect(svc.upsert({ key: 'x', body: 'Only a body' })).rejects.toThrow('Enter a title in English or French.');
    await svc.upsert({ key: 'off', title: 'Hidden', body: 'b', active: false });
    await svc.upsert({ key: 'on', title: 'Shown', body: 'b' });
    expect((await svc.list(false)).map((b) => b.key)).toEqual(['on']);
    expect((await svc.list(true)).map((b) => b.key).sort()).toEqual(['off', 'on']);
  });
});

describe('flash sales', () => {
  function promos() {
    const categories = { names: async () => new Map(), resolveRef: async () => 'c1' };
    const productsSvc = new ProductsService(
      ds.getRepository(Product), ds.getRepository(FlashSale), ds.getRepository(Seller), ds.getRepository(Campaign), ds.getRepository('ProductView') as never,
      emitter as never, categories as never, translations,
    );
    return new PromosService(ds.getRepository('Promo') as never, ds.getRepository(FlashSale), ds.getRepository(Order), ds.getRepository(Product), emitter as never, productsSvc, translations);
  }

  it('serves title / titleFr and productName / productNameFr (joined from the product, never stored)', async () => {
    const p = await addProduct(ds, { name: 'Wireless Earbuds', price: 40 });
    await ds.getRepository(Translation).insert({ entityType: 'product', entityId: p.id, field: 'name', locale: 'fr', value: 'Écouteurs sans fil', origin: 'author', sourceLang: 'en', sourceHash: null });
    const svc = promos();
    const f = await svc.createFlashSale({ title: 'Weekend flash', productId: p.id, flashPrice: 10 });
    expect(f).toMatchObject({ title: 'Weekend flash', titleFr: 'Weekend flash', productName: 'Wireless Earbuds', productNameFr: 'Écouteurs sans fil', sourceLang: 'en' });
    expect(ds.getMetadata(FlashSale).columns.map((c) => c.propertyName)).not.toContain('productName');
    await translations.runJob('flash_sale', f.id);
    expect((await svc.listFlashSales(true))[0]).toMatchObject({ titleFr: '[fr] Weekend flash' });
    // renaming the product renames it in the sale too: it is joined, not copied
    await ds.getRepository(Product).update({ id: p.id }, { name: 'Wireless Earbuds Pro' });
    expect((await svc.listFlashSales(false))[0].productName).toBe('Wireless Earbuds Pro');
  });

  it('a sale titled only in French has sourceLang fr; a sale needs a title in one language', async () => {
    const p = await addProduct(ds, { price: 40 });
    const svc = promos();
    expect(await svc.createFlashSale({ titleFr: 'Vente éclair', productId: p.id, flashPrice: 10 })).toMatchObject({ sourceLang: 'fr', title: 'Vente éclair', titleFr: 'Vente éclair' });
    await expect(svc.createFlashSale({ productId: p.id, flashPrice: 10 })).rejects.toThrow('Enter a title in English or French.');
    await expect(svc.createFlashSale({ title: 'x', productId: p.id, flashPrice: 99 })).rejects.toThrow('below the normal price');
  });
});

describe('campaigns', () => {
  function campaigns() {
    const notifications = { toRole: async () => undefined, toUser: async () => undefined };
    const productsSvc = { broadcastCampaignPrices: async () => undefined };
    return new CampaignsService(ds.getRepository(Campaign), ds.getRepository(Seller), ds.getRepository(Product), notifications as never, emitter as never, productsSvc as never, translations);
  }

  it('serves name / nameFr and the store name joined in (never stored); French follows by machine', async () => {
    const seller = await addSeller(ds, { name: 'Kinshasa Traders', userId: 'u1' });
    const svc = campaigns();
    const c = await svc.create({ id: 'u1', name: 'Kinshasa Traders' }, { name: 'Spring Sale', discount: 15 });
    expect(c).toMatchObject({ name: 'Spring Sale', nameFr: 'Spring Sale', sellerName: 'Kinshasa Traders', sellerId: seller.id, sourceLang: 'en' });
    expect(ds.getMetadata(Campaign).columns.map((x) => x.propertyName)).not.toEqual(expect.arrayContaining(['nameFr', 'sellerName']));
    await translations.runJob('campaign', c.id);
    expect((await svc.list({ id: 'u1', role: 'seller' }))[0]).toMatchObject({ nameFr: '[fr] Spring Sale', sellerName: 'Kinshasa Traders', machineTranslated: ['nameFr'] });
    // the store renames: the campaign follows
    await ds.getRepository(Seller).update({ id: seller.id }, { name: 'KT Group' });
    expect((await svc.list({ id: 'u1', role: 'seller' }))[0].sellerName).toBe('KT Group');
  });

  it('French only / hand-written French; an edit by hand is an author row', async () => {
    await addSeller(ds, { userId: 'u1' });
    const svc = campaigns();
    const c = await svc.create({ id: 'u1', name: 'S' }, { nameFr: 'Soldes de printemps', discount: 10 });
    expect(c).toMatchObject({ sourceLang: 'fr', name: 'Soldes de printemps' });
    await translations.runJob('campaign', c.id);
    expect((await svc.list({ id: 'u1', role: 'seller' }))[0]).toMatchObject({ name: '[en] Soldes de printemps', nameFr: 'Soldes de printemps' });
    const u = await svc.update({ id: 'u1', role: 'seller' }, c.id, { name: 'Spring Sale' });
    expect(u).toMatchObject({ name: 'Spring Sale', nameFr: 'Soldes de printemps', status: 'pending' });
    await expect(svc.create({ id: 'u1', name: 'S' }, { discount: 10 })).rejects.toThrow('Enter a campaign name in English or French.');
  });
});

describe('store descriptions', () => {
  function sellers() {
    const productsSvc = { publishUpdated: async () => undefined, list: async () => [] };
    const noop = { registerPlanSettledHandler: () => undefined };
    return new SellersService(
      ds.getRepository(Seller), ds.getRepository(Product), ds.getRepository(Order), ds.getRepository(OrderItem), ds.getRepository(Payout),
      { toUser: async () => undefined, toRole: async () => undefined } as never, emitter as never, noop as never, { get: async () => null } as never, productsSvc as never, translations,
    );
  }

  it('productCount is counted from live listings (never stored); description is served in both languages', async () => {
    const seller = await addSeller(ds, { name: 'Shop', userId: 'u1', description: null });
    await addProduct(ds, { sellerId: seller.id });
    await addProduct(ds, { sellerId: seller.id });
    await addProduct(ds, { sellerId: seller.id, status: 'draft' });
    const svc = sellers();
    const out = await svc.updateProfile('u1', { description: 'We sell the best gadgets in town.' });
    expect(out).toMatchObject({ description: 'We sell the best gadgets in town.', descriptionFr: 'We sell the best gadgets in town.', productCount: 2, sourceLang: 'en' });
    expect(ds.getMetadata(Seller).columns.map((c) => c.propertyName)).not.toContain('productCount');
    await translations.runJob('seller', seller.id);
    const sf = await svc.storefront(seller.id);
    expect(sf?.seller).toMatchObject({ descriptionFr: '[fr] We sell the best gadgets in town.', productCount: 2, machineTranslated: ['descriptionFr'] });
    expect(sf?.seller).not.toHaveProperty('userId');
  });

  it('a French description by hand is kept; the English is made from it', async () => {
    const seller = await addSeller(ds, { name: 'Shop', userId: 'u1' });
    const svc = sellers();
    await svc.updateProfile('u1', { descriptionFr: 'Les meilleurs gadgets de la ville.' });
    await translations.runJob('seller', seller.id);
    const sf = await svc.storefront(seller.id);
    expect(sf?.seller).toMatchObject({ descriptionFr: 'Les meilleurs gadgets de la ville.', description: '[en] Les meilleurs gadgets de la ville.' });
    expect((sf?.seller as unknown as { machineTranslated: string[] }).machineTranslated).toEqual(['description']);
    await expect(svc.updateProfile('u1', { descriptionFr: 'court' })).rejects.toThrow('French description must be 10-1000 characters.');
  });
});

