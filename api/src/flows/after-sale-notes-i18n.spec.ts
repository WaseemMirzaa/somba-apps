import { DataSource } from 'typeorm';
import { Campaign, Category, Exchange, FlashSale, Order, OrderItem, Product, ProductView, Replacement, Seller, Translation } from '../database/entities';
import { CategoriesService } from '../catalog/categories.service';
import { ProductsService } from '../products/products.service';
import { addProduct, recordingEmitter, testDb, testTranslations } from '../testing/test-db';
import { FakeTranslator } from '../translation/fake.translator';
import type { TranslationService } from '../translation/translation.service';
import type { TranslatorProvider } from '../translation/translator.provider';
import { AfterSaleNames } from './after-sale-names';
import { ExchangesService } from './exchanges.service';
import { ReplacementsService } from './replacements.service';

/** Replacements and exchanges: the customer's reason and the seller's reason are translated before they are stored. */

let ds: DataSource;
let tr: TranslationService;
let fake: FakeTranslator;
let emitter: ReturnType<typeof recordingEmitter>;
let replacements: ReplacementsService;
let exchanges: ExchangesService;
let notices: { to: string; title: string; body: string; fr?: { title: string; body: string } }[];
let store: Seller;
let product: Product;

const customer = { id: 'c1', name: 'Marie', role: 'customer' };
const otherCustomer = { id: 'c2', name: 'Paul', role: 'customer' };
const sellerOne = { id: 'su1', name: 'Shop', role: 'seller' };
const sellerTwo = { id: 'su2', name: 'Other shop', role: 'seller' };
const ops = { id: 'a1', name: 'Ops', role: 'admin_operations' };
const marketing = { id: 'a2', name: 'Marketing', role: 'admin_marketing' };
const rider = { id: 'r1', name: 'Rider', role: 'rider' };
const NOTHING = 'Nothing to translate.';
const broken: TranslatorProvider = { name: 'fake', enabled: true, translate: async () => { throw new Error('503'); }, detect: async () => { throw new Error('503'); } };

function build(provider: TranslatorProvider) {
  tr = testTranslations(ds, provider);
  const categories = new CategoriesService(ds.getRepository(Category), ds.getRepository(Product), emitter as never, tr);
  const products = new ProductsService(
    ds.getRepository(Product),
    ds.getRepository(FlashSale),
    ds.getRepository(Seller),
    ds.getRepository(Campaign),
    ds.getRepository(ProductView),
    emitter as never,
    categories,
    tr,
  );
  const names = new AfterSaleNames(ds.getRepository(OrderItem), tr, products);
  const record = (to: string) => async (id: string, n: { title: string; body: string; fr?: { title: string; body: string } }) => void notices.push({ to: `${to}${id}`, ...n });
  const notifications = { toUser: record('user:'), toRole: record('role:'), toUsers: record('user:') };
  const logistics = { returnPickup: async () => null, replacementDelivery: async () => null };
  replacements = new ReplacementsService(ds.getRepository(Replacement), ds.getRepository(Order), ds.getRepository(Seller), notifications as never, emitter as never, products, names, { get: async () => null } as never, logistics as never, tr);
  exchanges = new ExchangesService(ds.getRepository(Exchange), ds.getRepository(Order), ds.getRepository(Seller), notifications as never, emitter as never, products, names, { apply: async () => undefined } as never, { get: async () => null } as never, logistics as never, tr);
}

let n = 0;
async function delivered(): Promise<Order> {
  const repo = ds.getRepository(Order);
  return repo.save(
    repo.create({
      reference: `SOM-${++n}`,
      customerId: customer.id,
      customerName: 'Marie',
      status: 'delivered',
      totalUsd: 10,
      items: [{ productId: product.id, productName: product.name, variant: 'Default', qty: 1, priceUsd: 10 }] as OrderItem[],
    }),
  );
}
const rowsOf = (id: string) => ds.getRepository(Translation).find({ where: { entityId: id }, order: { entityType: 'ASC', locale: 'ASC' } });
const sent = (event: string) => emitter.sent.filter((e) => e.event === event);

beforeEach(async () => {
  ds = await testDb();
  emitter = recordingEmitter();
  notices = [];
  fake = new FakeTranslator();
  store = await ds.getRepository(Seller).save(ds.getRepository(Seller).create({ name: 'Shop', userId: sellerOne.id, status: 'approved' }));
  await ds.getRepository(Seller).save(ds.getRepository(Seller).create({ name: 'Other shop', userId: sellerTwo.id, status: 'approved' }));
  product = await addProduct(ds, { name: 'Hat', stock: 50, sellerId: store.id });
  build(fake);
});
afterEach(async () => ds.destroy());

describe('replacements', () => {
  it('the customer’s reason is translated first: the view, every event and the seller notice carry both languages', async () => {
    const o = await delivered();
    const rep = await replacements.create(customer, { orderId: o.id, itemId: o.items[0].id, reason: 'Le produit est arrivé cassé' });
    const both = { sourceLang: 'fr', fr: 'Le produit est arrivé cassé', en: '[en] Le produit est arrivé cassé' };
    expect(rep.reason).toBe('Le produit est arrivé cassé');
    expect(rep.reasonI18n).toEqual(both);
    expect((await rowsOf(rep.id)).map((r) => [r.entityType, r.field, r.locale])).toEqual([['replacement_reason', 'reason', 'en']]);
    for (const e of sent('replacement:updated')) expect(e.payload.reasonI18n).toEqual(both);
    expect((await replacements.list(sellerOne))[0].reasonI18n).toEqual(both);
    expect((await replacements.list(sellerOne))[0].customerId).toBeUndefined(); // the seller's copy still hides the customer's id
    const n1 = notices.find((x) => x.title === 'Replacement requested on your item')!;
    expect(n1.body).toContain(': [en] Le produit est arrivé cassé');
    expect(n1.fr?.body).toContain(': Le produit est arrivé cassé');
  });

  it('the seller’s reason is translated (sellerReasonI18n) and the customer notice follows their language', async () => {
    const o = await delivered();
    const rep = await replacements.create(customer, { orderId: o.id, itemId: o.items[0].id, reason: 'Dead on arrival' });
    notices.length = 0;
    const out = await replacements.respond(sellerOne, rep.id, false, 'Garantie expirée depuis longtemps');
    expect(out.status).toBe('rejected');
    expect(out.sellerReasonI18n).toEqual({ sourceLang: 'fr', fr: 'Garantie expirée depuis longtemps', en: '[en] Garantie expirée depuis longtemps' });
    const n2 = notices.find((x) => x.to === `user:${customer.id}`)!;
    expect(n2.body).toContain('— [en] Garantie expirée');
    expect(n2.fr?.body).toContain('— Garantie expirée depuis longtemps');
  });

  it('a failing translator still files and answers the request: no error, no field', async () => {
    build(broken);
    const o = await delivered();
    const rep = await replacements.create(customer, { orderId: o.id, itemId: o.items[0].id, reason: 'Le produit est arrivé cassé' });
    expect('reasonI18n' in rep).toBe(false);
    const out = await replacements.respond(sellerOne, rep.id, false, 'Garantie expirée');
    expect(out.status).toBe('rejected');
    expect('sellerReasonI18n' in out).toBe(false);
    expect(await rowsOf(rep.id)).toHaveLength(0);
  });

  it('translate:text: the customer, the store, the deciding desk may; others get "Nothing to translate."', async () => {
    const o = await delivered();
    const rep = await replacements.create(customer, { orderId: o.id, itemId: o.items[0].id, reason: 'Le produit est arrivé cassé' });
    fake.calls.length = 0;
    for (const who of [customer, sellerOne, ops]) {
      expect(await replacements.translate(who, 'replacement_reason', rep.id, 'en')).toMatchObject({ text: '[en] Le produit est arrivé cassé' });
    }
    expect(fake.calls).toHaveLength(0);
    for (const who of [otherCustomer, sellerTwo, marketing, rider]) {
      await expect(replacements.translate(who, 'replacement_reason', rep.id, 'en')).rejects.toThrow(NOTHING);
      await expect(replacements.translate(who, 'replacement_reply', rep.id, 'en')).rejects.toThrow(NOTHING);
    }
    await expect(replacements.translate(customer, 'replacement_reason', '00000000-0000-4000-8000-000000000000', 'en')).rejects.toThrow(NOTHING);
    await expect(replacements.translate(customer, 'exchange_reason', rep.id, 'en')).rejects.toThrow(NOTHING);
    await expect(tr.translateStored('replacement_reason', rep.id, 'en', { staff: true })).rejects.toThrow(NOTHING);
    expect(fake.calls).toHaveLength(0);
  });
});

describe('exchanges', () => {
  const ask = (o: Order, reason: string) => exchanges.create(customer, { orderId: o.id, itemId: o.items[0].id, toSku: 'ext:other', toName: 'Hat in M', reason });

  it('the customer’s reason is translated first: the view and every event carry both languages', async () => {
    const o = await delivered();
    const ex = await ask(o, 'Trop petit, je voudrais la taille M');
    const both = { sourceLang: 'fr', fr: 'Trop petit, je voudrais la taille M', en: '[en] Trop petit, je voudrais la taille M' };
    expect(ex.reasonI18n).toEqual(both);
    expect((await rowsOf(ex.id)).map((r) => [r.entityType, r.field, r.locale])).toEqual([['exchange_reason', 'reason', 'en']]);
    for (const e of sent('exchange:updated')) expect(e.payload.reasonI18n).toEqual(both);
    expect((await exchanges.get(sellerOne, ex.id)).reasonI18n).toEqual(both);
  });

  it('the seller’s reason: sellerReasonI18n on the view and a notice in each language', async () => {
    const o = await delivered();
    const ex = await ask(o, 'Too small');
    notices.length = 0;
    const out = await exchanges.respond(sellerOne, ex.id, false, 'Nous sommes en rupture pour cette taille');
    expect(out.sellerReasonI18n).toEqual({ sourceLang: 'fr', fr: 'Nous sommes en rupture pour cette taille', en: '[en] Nous sommes en rupture pour cette taille' });
    const n3 = notices.find((x) => x.to === `user:${customer.id}`)!;
    expect(n3.body).toContain('— [en] Nous sommes en rupture');
    expect(n3.fr?.body).toContain('— Nous sommes en rupture pour cette taille');
  });

  it('a failing translator still files the exchange', async () => {
    build(broken);
    const o = await delivered();
    const ex = await ask(o, 'Trop petit');
    expect('reasonI18n' in ex).toBe(false);
  });

  it('translate:text refuses everyone who cannot read the exchange', async () => {
    const o = await delivered();
    const ex = await ask(o, 'Trop petit, je voudrais la taille M');
    for (const who of [customer, sellerOne, ops]) {
      expect(await exchanges.translate(who, 'exchange_reason', ex.id, 'en')).toMatchObject({ text: '[en] Trop petit, je voudrais la taille M' });
    }
    fake.calls.length = 0;
    for (const who of [otherCustomer, sellerTwo, marketing, rider]) {
      await expect(exchanges.translate(who, 'exchange_reason', ex.id, 'en')).rejects.toThrow(NOTHING);
    }
    await expect(tr.translateStored('exchange_reason', ex.id, 'en', { staff: true })).rejects.toThrow(NOTHING);
    expect(fake.calls).toHaveLength(0);
  });
});
