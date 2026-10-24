import { DataSource } from 'typeorm';
import { Category, Product, Translation } from '../database/entities';
import { addCategory, addProduct, recordingEmitter, testDb, testTranslations } from '../testing/test-db';
import { FakeTranslator } from '../translation/fake.translator';
import type { TranslationService } from '../translation/translation.service';
import { CategoriesService, categoryInUseMessage } from './categories.service';

let ds: DataSource;
let translations: TranslationService;
let emitter: ReturnType<typeof recordingEmitter>;
let svc: CategoriesService;

beforeEach(async () => {
  ds = await testDb();
  translations = testTranslations(ds, new FakeTranslator());
  emitter = recordingEmitter();
  svc = new CategoriesService(ds.getRepository(Category), ds.getRepository(Product), emitter as never, translations);
});
afterEach(async () => ds.destroy());

describe('writing categories', () => {
  it('English only: sourceLang en, the French name is filled in by a machine and the list is re-emitted', async () => {
    const c = await svc.create({ name: 'Gadgets', icon: '🔧' });
    expect(c).toMatchObject({ name: 'Gadgets', nameFr: 'Gadgets', sourceLang: 'en', productCount: 0 });
    emitter.sent.length = 0;
    await translations.runJob('category', c.id);
    const list = (await svc.list()).find((x) => x.id === c.id)!;
    expect(list).toMatchObject({ name: 'Gadgets', nameFr: '[fr] Gadgets', machineTranslated: ['nameFr'], translationStatus: 'done' });
    const pushed = emitter.sent.find((e) => e.event === 'categories:updated');
    expect(pushed?.to.split(',')).toEqual(expect.arrayContaining(['customer', 'guest', 'admin']));
    expect((pushed?.payload as { nameFr: string }[]).find((x) => x.nameFr === '[fr] Gadgets')).toBeTruthy();
  });

  it('French only: the French is the source and English follows', async () => {
    const c = await svc.create({ nameFr: 'Outils' });
    expect(c).toMatchObject({ sourceLang: 'fr', name: 'Outils', nameFr: 'Outils' });
    await translations.runJob('category', c.id);
    expect((await svc.list())[0]).toMatchObject({ name: '[en] Outils', nameFr: 'Outils' });
  });

  it('both names: no machine involved (the admin form no longer copies EN into FR)', async () => {
    const c = await svc.create({ name: 'Tools', nameFr: 'Outils' });
    await translations.runJob('category', c.id);
    expect((await svc.list())[0]).toMatchObject({ name: 'Tools', nameFr: 'Outils', machineTranslated: [] });
  });

  it('a category needs a name in at least one language', async () => {
    await expect(svc.create({ name: '', nameFr: '' })).rejects.toThrow('Enter a category name in English or French.');
    await expect(svc.create({ icon: 'x' })).rejects.toThrow('Enter a category name in English or French.');
  });

  it('a hand-written French name survives the machine; clearing it lets the machine fill it', async () => {
    const c = await svc.create({ name: 'Gadgets', nameFr: 'Bidules' });
    await translations.runJob('category', c.id);
    await svc.update(c.id, { name: 'Gadgets & Gizmos' });
    await translations.runJob('category', c.id);
    expect((await svc.list())[0]).toMatchObject({ name: 'Gadgets & Gizmos', nameFr: 'Bidules' });
    await svc.update(c.id, { nameFr: '' });
    await translations.runJob('category', c.id);
    expect((await svc.list())[0].nameFr).toBe('[fr] Gadgets & Gizmos');
  });

  it('icon, image and sort order update without touching the words', async () => {
    const c = await svc.create({ name: 'Gadgets', nameFr: 'Bidules' });
    const u = await svc.update(c.id, { icon: '📦', sortOrder: 4 });
    expect(u).toMatchObject({ icon: '📦', sortOrder: 4, nameFr: 'Bidules' });
    expect(await svc.update('missing', { icon: 'x' })).toBeNull();
  });
});

describe('C-I3: renaming keeps the products', () => {
  it('products point at categoryId, so they follow a rename and show the new name', async () => {
    const c = await svc.create({ name: 'Gadgets', nameFr: 'Bidules' });
    const p = await addProduct(ds, { categoryId: c.id });
    await svc.update(c.id, { name: 'Gizmos' });
    expect((await ds.getRepository(Product).findOneByOrFail({ id: p.id })).categoryId).toBe(c.id);
    expect((await svc.list())[0]).toMatchObject({ name: 'Gizmos', productCount: 1, usedBy: 1 });
  });
});

describe('C-I2: a category in use cannot be deleted', () => {
  it('refuses with the number of products, naming what to do', async () => {
    const c = await svc.create({ name: 'Gadgets', nameFr: 'Bidules' });
    await addProduct(ds, { categoryId: c.id });
    await expect(svc.remove(c.id)).rejects.toThrow('1 product uses this category. Move it to another category first.');
    await addProduct(ds, { categoryId: c.id, status: 'draft' });
    await expect(svc.remove(c.id)).rejects.toThrow('2 products use this category. Move them to another category first.');
    expect(await ds.getRepository(Category).count()).toBe(1);
  });

  it('the database says the same: the foreign key refuses a direct delete', async () => {
    const c = await svc.create({ name: 'Gadgets', nameFr: 'Bidules' });
    await addProduct(ds, { categoryId: c.id });
    await expect(ds.getRepository(Category).delete({ id: c.id })).rejects.toThrow(/FOREIGN KEY/i);
  });

  it('works once the products moved; soft-removed listings no longer hold the category', async () => {
    const c = await svc.create({ name: 'Gadgets', nameFr: 'Bidules' });
    const other = await svc.create({ name: 'Other', nameFr: 'Autre' });
    const live = await addProduct(ds, { categoryId: c.id });
    const gone = await addProduct(ds, { categoryId: c.id, status: 'removed' });
    await ds.getRepository(Product).update({ id: live.id }, { categoryId: other.id });
    await svc.remove(c.id);
    expect((await svc.list()).map((x) => x.id)).toEqual([other.id]);
    expect((await ds.getRepository(Product).findOneByOrFail({ id: gone.id })).categoryId).toBeNull();
    expect(await ds.getRepository(Translation).count({ where: { entityType: 'category', entityId: c.id } })).toBe(0);
  });
});

describe('finding a category', () => {
  it('by id, or by name in either language, ignoring case and accents', async () => {
    const c = await addCategory(ds, 'Electronics', 'Électronique');
    expect(await svc.resolveRef({ id: c.id })).toBe(c.id);
    for (const name of ['Electronics', 'electronics ', 'Électronique', 'electronique', 'ÉLECTRONIQUE']) expect(await svc.resolveRef({ name })).toBe(c.id);
    await expect(svc.resolveRef({ name: 'Nope' })).rejects.toThrow('Choose a category from the list.');
    await expect(svc.resolveRef({ id: 'nope' })).rejects.toThrow('That category does not exist.');
    await expect(svc.resolveRef({})).rejects.toThrow('Choose a category.');
  });

  it('names() gives both languages by id', async () => {
    const c = await addCategory(ds, 'Fashion', 'Mode');
    expect((await svc.names([c.id, c.id, ''])).get(c.id)).toEqual({ name: 'Fashion', nameFr: 'Mode' });
    expect((await svc.names([])).size).toBe(0);
  });
});

describe('categoryInUseMessage (C-I2 wording)', () => {
  it.each([
    [1, '1 product uses this category. Move it to another category first.'],
    [2, '2 products use this category. Move them to another category first.'],
    [5, '5 products use this category. Move them to another category first.'],
    [120, '120 products use this category. Move them to another category first.'],
  ])('%i -> %s', (n, text) => {
    expect(categoryInUseMessage(n)).toBe(text);
  });
});
