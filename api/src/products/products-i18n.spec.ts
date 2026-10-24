import { DataSource } from 'typeorm';
import { Campaign, FlashSale, Product, ProductView, Seller, Translation } from '../database/entities';
import { CategoriesService } from '../catalog/categories.service';
import { addCategory, addSeller, recordingEmitter, testDb, testTranslations } from '../testing/test-db';
import { FakeTranslator } from '../translation/fake.translator';
import type { TranslationService } from '../translation/translation.service';
import { ProductsService, cleanListing, materialTextChange } from './products.service';
import type { ListingInput } from './products.service';

let ds: DataSource;
let fake: FakeTranslator;
let translations: TranslationService;
let emitter: ReturnType<typeof recordingEmitter>;
let products: ProductsService;
let categories: CategoriesService;
let seller: Seller;
let electronics: string;
let fashion: string;

beforeEach(async () => {
  ds = await testDb();
  fake = new FakeTranslator();
  translations = testTranslations(ds, fake);
  emitter = recordingEmitter();
  categories = new CategoriesService(ds.getRepository('Category') as never, ds.getRepository(Product), emitter as never, translations);
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
  seller = await addSeller(ds, { name: 'Kinshasa Traders' });
  electronics = (await addCategory(ds, 'Electronics', 'Électronique')).id;
  fashion = (await addCategory(ds, 'Fashion', 'Mode')).id;
});
afterEach(async () => ds.destroy());

const create = (input: ListingInput, status: 'live' | 'pending' = 'live') =>
  products.create(cleanListing({ price: 10, categoryId: electronics, ...input }, { partial: false, allowStatus: false }), { sellerId: seller.id, status });
const edit = (id: string, input: ListingInput) => products.update(id, cleanListing(input, { partial: true, allowStatus: false }));
const settle = async (id: string) => {
  await translations.runJob('product', id);
  return (await products.get(id))!;
};

describe('creating a listing: source language and what is served', () => {
  it('English only: sourceLang en, every compat field composed, French pending', async () => {
    const p = await create({
      name: 'Wireless Earbuds', description: 'Noise reduction.',
      variants: [{ name: 'Colour', options: ['Black', 'White'] }],
    });
    expect(p).toMatchObject({
      name: 'Wireless Earbuds', nameFr: 'Wireless Earbuds', description: 'Noise reduction.', descriptionFr: 'Noise reduction.',
      category: 'Electronics', categoryFr: 'Électronique', categoryId: electronics, sellerName: 'Kinshasa Traders',
      sourceLang: 'en', machineTranslated: [], translationStatus: 'pending',
    });
    expect(typeof p.variants).toBe('string');
    expect(p.variantLabels).toEqual({ en: [{ name: 'Colour', options: ['Black', 'White'] }], fr: [{ name: 'Colour', options: ['Black', 'White'] }] });
    expect(emitter.sent.find((e) => e.event === 'product:created')?.payload).toMatchObject({ id: p.id, sellerName: 'Kinshasa Traders', category: 'Electronics' });
  });

  it('once the job ran: French appears, marked machine-made, and the listing is re-emitted to shoppers and staff', async () => {
    const created = await create({ name: 'Wireless Earbuds', description: 'Noise reduction.', variants: [{ name: 'Colour', options: ['Black'] }] });
    emitter.sent.length = 0;
    const p = await settle(created.id);
    expect(p).toMatchObject({ name: 'Wireless Earbuds', nameFr: '[fr] Wireless Earbuds', descriptionFr: '[fr] Noise reduction.', translationStatus: 'done' });
    expect(p.machineTranslated.sort()).toEqual(['descriptionFr', 'nameFr', 'variantLabels.fr']);
    expect(p.variantLabels.fr).toEqual([{ name: '[fr] Colour', options: ['[fr] Black'] }]);
    expect(p.variants).toBe(created.variants); // the purchase key never moves
    const update = emitter.sent.find((e) => e.event === 'product:updated');
    expect(update?.to.split(',')).toEqual(expect.arrayContaining(['customer', 'guest', 'admin']));
    expect(update?.payload).toMatchObject({ id: p.id, nameFr: '[fr] Wireless Earbuds' });
  });

  it('French only: sourceLang fr, the base column holds the French, English follows', async () => {
    const created = await create({ nameFr: 'Chaussures de sport', descriptionFr: 'Légères et confortables.' });
    expect(created.sourceLang).toBe('fr');
    expect(created).toMatchObject({ name: 'Chaussures de sport', nameFr: 'Chaussures de sport' });
    expect((await ds.getRepository(Product).findOneByOrFail({ id: created.id })).name).toBe('Chaussures de sport');
    const p = await settle(created.id);
    expect(p).toMatchObject({ name: '[en] Chaussures de sport', nameFr: 'Chaussures de sport', description: '[en] Légères et confortables.', descriptionFr: 'Légères et confortables.' });
    expect(p.machineTranslated.sort()).toEqual(['description', 'name']);
  });

  it('both languages: the client\'s sourceLang decides which is the source; both read as typed, nothing is translated', async () => {
    const p = await create({ name: 'Phone', nameFr: 'Téléphone', sourceLang: 'fr' });
    expect(p).toMatchObject({ sourceLang: 'fr', name: 'Phone', nameFr: 'Téléphone' });
    await translations.runJob('product', p.id);
    expect(fake.calls).toHaveLength(0);
    expect((await products.get(p.id))?.translationStatus).toBe('done');
  });

  it('C-I1: a title is needed in at least one language', async () => {
    await expect(create({ description: 'No title' })).rejects.toThrow('Enter a product title in English or French.');
    await expect(create({ name: ' ', nameFr: '' })).rejects.toThrow('Enter a product title in English or French.');
    expect(await ds.getRepository(Product).count()).toBe(0);
  });

  it('the category is found by id, or by its English or French name; unknown ones are refused', async () => {
    expect((await create({ categoryId: undefined, category: 'fashion', name: 'A' })).categoryId).toBe(fashion);
    expect((await create({ categoryId: undefined, category: 'Mode', name: 'B' })).categoryId).toBe(fashion);
    expect((await create({ categoryId: undefined, category: 'MODE ', name: 'C' })).categoryId).toBe(fashion);
    await expect(create({ categoryId: undefined, category: 'Nope', name: 'D' })).rejects.toThrow('Choose a category from the list.');
    await expect(create({ categoryId: 'missing', name: 'E' })).rejects.toThrow('That category does not exist.');
    await expect(create({ categoryId: undefined, name: 'F' })).rejects.toThrow('Choose a category.');
  });

  it('an old demo listing keyed by the owner\'s user id still shows its store name', async () => {
    const owner = await addSeller(ds, { name: 'Owner Shop', userId: 'user-7' });
    const p = await products.create(cleanListing({ name: 'Legacy', price: 5, categoryId: electronics }, { partial: false, allowStatus: false }), { sellerId: 'user-7', status: 'live' });
    expect(p.sellerName).toBe(owner.name);
  });
});

describe('editing: author rows, clears, stale text, source switch', () => {
  it('a hand-written French title is an author row: served, not machine-made, and a retranslation keeps it (C-I6)', async () => {
    const created = await create({ name: 'Wireless Earbuds', description: 'Noise reduction.' });
    await settle(created.id);
    const p = (await edit(created.id, { nameFr: 'Mes écouteurs' }))!;
    expect(p).toMatchObject({ nameFr: 'Mes écouteurs' });
    expect(p.machineTranslated).not.toContain('nameFr');
    await translations.retranslate('product', created.id);
    const again = await settle(created.id);
    expect(again.nameFr).toBe('Mes écouteurs');
    expect(again.descriptionFr).toBe('[fr] Noise reduction.');
    const edited = (await edit(created.id, { name: 'Wireless Earbuds Pro' }))!;
    expect(edited).toMatchObject({ name: 'Wireless Earbuds Pro', nameFr: 'Mes écouteurs' });
    await translations.runJob('product', created.id);
    expect((await products.get(created.id))?.nameFr).toBe('Mes écouteurs');
  });

  it('clearing a translated field deletes the row and the machine fills it again', async () => {
    const created = await create({ name: 'Wireless Earbuds', nameFr: 'Mes écouteurs' });
    expect((await translations.rowsFor('product', [created.id])).get(created.id)).toHaveLength(1);
    const cleared = (await edit(created.id, { nameFr: '' }))!;
    expect(cleared.nameFr).toBe('Wireless Earbuds'); // falls back to the source until the machine is done
    expect((await translations.rowsFor('product', [created.id])).get(created.id)).toBeUndefined();
    expect((await settle(created.id)).nameFr).toBe('[fr] Wireless Earbuds');
  });

  it('changing the source text makes the machine row stale: it is not served and is re-translated', async () => {
    const created = await create({ name: 'Wireless Earbuds', description: 'Old text here.' });
    await settle(created.id);
    const p = (await edit(created.id, { description: 'New text here.' }))!;
    expect(p.descriptionFr).toBe('New text here.'); // the stale French is not shown
    expect(p.translationStatus).toBe('pending');
    expect((await settle(created.id)).descriptionFr).toBe('[fr] New text here.');
  });

  it('clearing the title in the source language when the other one has a title makes that the source', async () => {
    const created = await create({ name: 'Phone', nameFr: 'Téléphone', description: 'Light.', descriptionFr: 'Légère.' });
    const p = (await edit(created.id, { name: '' }))!;
    expect(p.sourceLang).toBe('fr');
    expect(p).toMatchObject({ nameFr: 'Téléphone', descriptionFr: 'Légère.', description: 'Light.' }); // nothing lost: the English text became an author row
    const row = await ds.getRepository(Product).findOneByOrFail({ id: created.id });
    expect(row).toMatchObject({ name: 'Téléphone', description: 'Légère.', sourceLang: 'fr' });
  });

  it('C-I1 holds on edits: the only title cannot be cleared', async () => {
    const created = await create({ name: 'Phone' });
    await expect(edit(created.id, { name: '' })).rejects.toThrow('Enter a product title in English or French.');
    expect((await products.get(created.id))?.name).toBe('Phone');
  });

  it('changes that touch no words queue nothing', async () => {
    const created = await create({ name: 'Phone' });
    await settle(created.id);
    const calls = fake.calls.length;
    await edit(created.id, { price: 12, stock: 4 });
    await translations.runJob('product', created.id);
    expect(fake.calls.length).toBe(calls);
  });

  it('retranslate() queues a fresh job and keeps author rows', async () => {
    const created = await create({ name: 'Phone', description: 'Light.' });
    await edit(created.id, { descriptionFr: 'Ma description' });
    await products.retranslate(created.id);
    await translations.runJob('product', created.id);
    expect(await products.get(created.id)).toMatchObject({ descriptionFr: 'Ma description', nameFr: '[fr] Phone' });
    expect(await products.retranslate('missing')).toBeNull();
  });
});

describe('option labels (C-I4)', () => {
  const colour = [{ name: 'Colour', options: ['Red', 'Blue'] }];

  it('labels of the same shape are kept as author rows and never overwritten', async () => {
    const created = await create({ name: 'Hat', variants: colour, variantLabels: { fr: [{ name: 'Couleur', options: ['Rouge', 'Bleu'] }] } });
    const p = await settle(created.id);
    expect(p.variantLabels.fr).toEqual([{ name: 'Couleur', options: ['Rouge', 'Bleu'] }]);
    expect(p.machineTranslated).not.toContain('variantLabels.fr');
  });

  it('labels of the wrong shape are dropped and re-translated', async () => {
    const created = await create({ name: 'Hat', variants: colour, variantLabels: { fr: [{ name: 'Couleur', options: ['Rouge'] }] } });
    const p = await settle(created.id);
    expect(p.variantLabels.fr).toEqual([{ name: '[fr] Colour', options: ['[fr] Red', '[fr] Blue'] }]);
    expect(p.machineTranslated).toContain('variantLabels.fr');
  });

  it('changing the options drops the old labels (they no longer match) and re-translates', async () => {
    const created = await create({ name: 'Hat', variants: colour, variantLabels: { fr: [{ name: 'Couleur', options: ['Rouge', 'Bleu'] }] } });
    await settle(created.id);
    const p = (await edit(created.id, { variants: [{ name: 'Colour', options: ['Red', 'Blue', 'Green'] }] }))!;
    expect(p.variantLabels.fr[0].options).toHaveLength(3);
    expect((await settle(created.id)).variantLabels.fr).toEqual([{ name: '[fr] Colour', options: ['[fr] Red', '[fr] Blue', '[fr] Green'] }]);
  });

  it('sending the same options again leaves the labels alone', async () => {
    const created = await create({ name: 'Hat', variants: colour, variantLabels: { fr: [{ name: 'Couleur', options: ['Rouge', 'Bleu'] }] } });
    await settle(created.id);
    await edit(created.id, { variants: colour });
    expect((await products.get(created.id))?.variantLabels.fr).toEqual([{ name: 'Couleur', options: ['Rouge', 'Bleu'] }]);
  });

  it('removing the options empties both label lists', async () => {
    const created = await create({ name: 'Hat', variants: colour });
    await settle(created.id);
    const p = (await edit(created.id, { variants: [] }))!;
    expect(p.variants).toBeNull();
    expect(p.variantLabels).toEqual({ en: [], fr: [] });
  });
});

describe('lists, names, search', () => {
  it('filters by category id, by English or French name; an unknown name matches nothing', async () => {
    const a = await create({ name: 'Phone', categoryId: electronics });
    const b = await create({ name: 'Dress', categoryId: fashion });
    const ids = async (f: object) => (await products.list({ liveOnly: true, ...f })).map((p) => p.id);
    expect(await ids({ categoryId: fashion })).toEqual([b.id]);
    expect(await ids({ category: 'Electronics' })).toEqual([a.id]);
    expect(await ids({ category: 'Électronique' })).toEqual([a.id]);
    expect(await ids({ category: 'electronique' })).toEqual([a.id]);
    expect(await ids({ category: 'Nothing' })).toEqual([]);
    expect((await ids({})).sort()).toEqual([a.id, b.id].sort());
  });

  it('composes a whole page with a bounded number of lookups', async () => {
    for (let i = 0; i < 6; i++) await create({ name: `Item ${i}x` });
    const rowsFor = jest.spyOn(translations, 'rowsFor');
    const list = await products.list({ liveOnly: true });
    expect(list).toHaveLength(6);
    // products + their categories: one lookup each, however many listings
    expect(rowsFor.mock.calls.map(([type]) => type).sort()).toEqual(['category', 'product']);
  });

  it('names() gives both titles; describe() the words, category and store', async () => {
    const p = await create({ name: 'Phone', nameFr: 'Téléphone' });
    expect((await products.names([p.id])).get(p.id)).toEqual({ name: 'Phone', nameFr: 'Téléphone' });
    const raw = await products.getRaw(p.id);
    expect((await products.describe([raw!])).get(p.id)).toMatchObject({ name: 'Phone', nameFr: 'Téléphone', category: 'Electronics', categoryFr: 'Électronique', sellerName: 'Kinshasa Traders' });
  });

  it('search matches the French description and folds accents', async () => {
    const created = await create({ name: 'Shoes', descriptionFr: 'Légères et confortables.', nameFr: 'Chaussures' });
    expect((await products.search('legeres', 10)).ids).toContain(created.id);
    expect((await products.search('Chaussures', 10)).ids).toContain(created.id);
    expect((await products.search('Électronique', 10)).ids).toContain(created.id); // the French category
    expect((await products.search('zzzz', 10)).total).toBe(0);
  });

  it('remove() soft-removes and emits the composed listing to shoppers, guests and staff', async () => {
    const p = await create({ name: 'Phone' });
    emitter.sent.length = 0;
    const out = await products.remove(p.id);
    expect(out).toMatchObject({ status: 'removed', category: 'Electronics', sellerName: 'Kinshasa Traders' });
    expect(emitter.sent[0]).toMatchObject({ event: 'product:updated' });
    expect(emitter.sent[0].to.split(',')).toEqual(expect.arrayContaining(['customer', 'guest']));
  });

  it('publishUpdated() re-emits stored rows composed', async () => {
    const p = await create({ name: 'Phone', nameFr: 'Téléphone' });
    emitter.sent.length = 0;
    await products.publishUpdated([(await products.getRaw(p.id))!], ['customer']);
    expect(emitter.sent[0]).toMatchObject({ to: 'customer', event: 'product:updated', payload: { nameFr: 'Téléphone', category: 'Electronics' } });
  });
});

describe('moderation: what counts as a material change', () => {
  const served = async (input: ListingInput) => (await create({ name: 'Phone', description: 'Light.', ...input }))!;
  const change = async (p: Awaited<ReturnType<typeof served>>, patch: ListingInput, categoryId?: string) =>
    materialTextChange(p, cleanListing(patch, { partial: true, allowStatus: false }), categoryId);

  it('French edits count like English ones', async () => {
    const p = await served({});
    expect(await change(p, { nameFr: 'Téléphone' })).toBe(true);
    expect(await change(p, { descriptionFr: 'Légère.' })).toBe(true);
    expect(await change(p, { name: 'Phone 2' })).toBe(true);
    expect(await change(p, { description: 'Heavier.' })).toBe(true);
    expect(await change(p, { image: 'https://x/y.png' })).toBe(true);
    expect(await change(p, { variants: [{ name: 'Size', options: ['S'] }] })).toBe(true);
    expect(await change(p, {}, fashion)).toBe(true);
  });

  it('but not saving the same words again, a price below the threshold, or clearing what a machine wrote', async () => {
    const p = await served({});
    expect(await change(p, { name: 'Phone', description: 'Light.', price: 11 })).toBe(false);
    const done = await settle(p.id);
    expect(await change(done, { nameFr: done.nameFr })).toBe(false); // the machine's own text, sent back
    expect(await change(done, { nameFr: '' })).toBe(false); // clearing machine text: the machine just rewrites it
    const authored = (await edit(p.id, { nameFr: 'Mon titre' }))!;
    expect(await change(authored, { nameFr: '' })).toBe(true); // clearing a hand-written one is a change
    expect(await change(authored, { nameFr: 'Mon titre' })).toBe(false);
  });
});

describe('the tables behind it', () => {
  it('a saved listing keeps French in translations, never in product columns', async () => {
    const p = await create({ name: 'Phone', nameFr: 'Téléphone' });
    const cols = ds.getMetadata(Product).columns.map((c) => c.propertyName);
    for (const gone of ['nameFr', 'category', 'categoryFr', 'sellerName']) expect(cols).not.toContain(gone);
    expect(cols).toEqual(expect.arrayContaining(['categoryId', 'sourceLang']));
    expect(await ds.getRepository(Translation).findOneByOrFail({ entityType: 'product', entityId: p.id, field: 'name', locale: 'fr' })).toMatchObject({ origin: 'author', value: 'Téléphone' });
  });
});
