import { createHash } from 'crypto';
import { moveCategories, moveNameFr } from './i18n-moves';

/** A tiny in-memory stand-in for the three tables the moves touch, answering the exact SQL they send. */
function fakeDb(seed: { categories: { id: string; name: string; nameFr: string | null }[]; products: { id: string; name: string; nameFr: string | null; category: string; categoryFr: string | null; categoryId?: string | null }[]; campaigns?: { id: string; name: string; nameFr: string | null }[] }) {
  const categories = seed.categories.map((c) => ({ sortOrder: 0, ...c }));
  const products = seed.products.map((p) => ({ categoryId: null as string | null, ...p }));
  const campaigns = seed.campaigns ?? [];
  const translations: { id: string; entityType: string; entityId: string; field: string; locale: string; value: string; origin: string; sourceLang: string; sourceHash: string }[] = [];
  const q = {
    query: async (sql: string, params: unknown[] = []): Promise<any> => {
      if (/FROM `translations` WHERE `entityType` = \?/.test(sql)) return translations.filter((t) => t.entityType === params[0]).map((t) => ({ entityId: t.entityId }));
      if (/SELECT `id`, `name`, `nameFr` FROM `categories`/.test(sql)) return categories;
      if (/SELECT `id`, `name`, `nameFr` FROM `products`/.test(sql)) return products;
      if (/SELECT `id`, `name`, `nameFr` FROM `campaigns`/.test(sql)) return campaigns;
      if (/SELECT `id`, `category`, `categoryFr` FROM `products`/.test(sql)) return products.filter((p) => p.categoryId == null);
      if (/MAX\(`sortOrder`\)/.test(sql)) return [{ top: Math.max(-1, ...categories.map((c) => c.sortOrder)) }];
      if (/^INSERT INTO `categories`/.test(sql)) return void categories.push({ id: params[0] as string, name: params[1] as string, nameFr: null, sortOrder: params[2] as number });
      if (/^INSERT INTO `translations`/.test(sql)) {
        for (let i = 0; i < params.length; i += 5) {
          translations.push({ id: params[i] as string, entityType: params[i + 1] as string, entityId: params[i + 2] as string, field: 'name', locale: 'fr', value: params[i + 3] as string, origin: 'author', sourceLang: 'en', sourceHash: params[i + 4] as string });
        }
        return undefined;
      }
      if (/^UPDATE `products` SET `categoryId`/.test(sql)) {
        for (const id of params.slice(1)) products.find((p) => p.id === id)!.categoryId = params[0] as string;
        return undefined;
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
  return { q, categories, products, translations };
}

describe('moveNameFr (nameFr -> translations author rows)', () => {
  it('copies the French name when it is not empty and differs from the name', async () => {
    const db = fakeDb({ categories: [], products: [
      { id: 'p1', name: 'Phone', nameFr: 'Téléphone', category: 'x', categoryFr: null },
      { id: 'p2', name: 'Dress', nameFr: 'Dress', category: 'x', categoryFr: null },
      { id: 'p3', name: 'Soap', nameFr: '  ', category: 'x', categoryFr: null },
      { id: 'p4', name: 'Hat', nameFr: null, category: 'x', categoryFr: null },
      { id: 'p5', name: 'Cafe', nameFr: 'Café', category: 'x', categoryFr: null }, // differs by an accent only: still a French name
      { id: 'p6', name: 'Shoe', nameFr: ' Chaussure ', category: 'x', categoryFr: null },
    ] });
    expect(await moveNameFr(db.q, 'products', 'product')).toBe(3);
    expect(db.translations.map((t) => [t.entityId, t.value, t.origin])).toEqual([['p1', 'Téléphone', 'author'], ['p5', 'Café', 'author'], ['p6', 'Chaussure', 'author']]);
    expect(db.translations[0].sourceHash).toBe(createHash('sha1').update('en\nPhone').digest('hex'));
  });

  it('is idempotent: a second run copies nothing', async () => {
    const db = fakeDb({ categories: [], products: [{ id: 'p1', name: 'Phone', nameFr: 'Téléphone', category: 'x', categoryFr: null }] });
    expect(await moveNameFr(db.q, 'products', 'product')).toBe(1);
    expect(await moveNameFr(db.q, 'products', 'product')).toBe(0);
    expect(db.translations).toHaveLength(1);
  });

  it('works for categories and campaigns too', async () => {
    const db = fakeDb({ categories: [{ id: 'c1', name: 'Fashion', nameFr: 'Mode' }], products: [], campaigns: [{ id: 'k1', name: 'Sale', nameFr: 'Soldes' }] });
    await moveNameFr(db.q, 'categories', 'category');
    await moveNameFr(db.q, 'campaigns', 'campaign');
    expect(db.translations.map((t) => [t.entityType, t.entityId, t.value])).toEqual([['category', 'c1', 'Mode'], ['campaign', 'k1', 'Soldes']]);
  });
});

describe('moveCategories (category name -> categoryId)', () => {
  const cats = [
    { id: 'c1', name: 'Electronics', nameFr: 'Électronique' },
    { id: 'c2', name: 'Fashion', nameFr: 'Mode' },
  ];
  const p = (id: string, category: string, categoryFr: string | null = null) => ({ id, name: id, nameFr: null, category, categoryFr });

  it('matches names ignoring case and spaces, then the French name', async () => {
    const db = fakeDb({ categories: cats, products: [p('a', 'Electronics'), p('b', ' fashion '), p('c', 'MODE'), p('d', 'électronique')] });
    const out = await moveCategories(db.q);
    expect(out.created).toEqual([]);
    expect(Object.fromEntries(db.products.map((x) => [x.id, x.categoryId]))).toEqual({ a: 'c1', b: 'c2', c: 'c2', d: 'c1' });
  });

  it('creates a category for a name nobody has (once, however it is spelled), with its French name as an author row', async () => {
    const db = fakeDb({ categories: cats, products: [p('a', 'Groceries', 'Alimentation'), p('b', 'groceries'), p('c', 'Electronics')] });
    const out = await moveCategories(db.q);
    expect(out.created).toEqual(['Groceries']);
    const groceries = db.categories.find((c) => c.name === 'Groceries')!;
    expect(db.products.filter((x) => x.categoryId === groceries.id).map((x) => x.id)).toEqual(['a', 'b']);
    expect(db.translations).toHaveLength(1);
    expect(db.translations[0]).toMatchObject({ entityType: 'category', entityId: groceries.id, value: 'Alimentation' });
    expect(groceries.sortOrder).toBe(1);
  });

  it('accents are different names (Mode is not Modé), blanks become "Other"', async () => {
    const db = fakeDb({ categories: cats, products: [p('a', 'Modé'), p('b', ''), p('c', '   ')] });
    const out = await moveCategories(db.q);
    expect(out.created.sort()).toEqual(['Modé', 'Other']);
    expect(db.products.every((x) => x.categoryId)).toBe(true);
    expect(db.products.find((x) => x.id === 'b')!.categoryId).toBe(db.products.find((x) => x.id === 'c')!.categoryId);
  });

  it('leaves products that already have a category alone (safe to run again)', async () => {
    const db = fakeDb({ categories: cats, products: [{ ...p('a', 'Fashion'), categoryId: 'c1' }, p('b', 'Fashion')] });
    await moveCategories(db.q);
    expect(db.products.map((x) => x.categoryId)).toEqual(['c1', 'c2']);
  });
});
