import { Product } from '../database/entities';
import type { Seller } from '../database/entities';
import { commerceWorld } from '../testing/commerce-db';
import type { World } from '../testing/commerce-db';
import { MAX_IMPORT_ROWS, ProductImportService, TEMPLATE_HEADER, parseVariantCell } from './product-import.service';

let w: World;
let shop: Seller;
let importer: ProductImportService;
let planMax: number | undefined;
beforeEach(async () => {
  w = await commerceWorld();
  shop = await w.store('Kinshasa Traders', 'u-kt');
  planMax = undefined;
  const sellersSvc = {
    byUser: (id: string) => w.ds.getRepository('Seller').findOneBy({ userId: id }),
    plans: async () => [{ id: 'free', name: 'Free', maxProducts: planMax }],
  };
  importer = new ProductImportService(w.ds.getRepository('Seller') as never, w.ds.getRepository(Product), w.products, w.categories, sellersSvc as never, w.notes as never);
  // notifications: the importer only calls toAdmins
  (importer as unknown as { notifications: unknown }).notifications = { toAdmins: async (n: { title: string; body: string }) => void w.notes.push({ to: 'admins', ...n }) };
});
afterEach(async () => w.ds.destroy());

const seller = { id: 'u-kt', role: 'seller' };
const HEADER = 'name,nameFr,description,price,category,stock,sku,brand,weightKg,images,variants';

describe('products:import', () => {
  it('creates pending products from a CSV, bilingual through the usual pipeline, and reports every row', async () => {
    const csv = [
      HEADER,
      'Cotton T-shirt,T-shirt en coton,Soft,12.50,Fashion,40,TSH-001,Somba,0.2,https://cdn.example.com/1.jpg|https://cdn.example.com/2.jpg,Size=S|M;Colour=Black|White',
      'Phone case,,,6,Electronics,100,CASE-9,,,,',
    ].join('\n');
    // Fashion is not a category in this world: add it.
    await w.ds.getRepository('Category').save(w.ds.getRepository('Category').create({ name: 'Fashion' }));
    const r = await importer.import(seller, { csv });
    expect(r).toMatchObject({ total: 2, created: 2, failed: 0, dryRun: false, errors: [] });
    expect(r.products.map((p) => [p.row, p.name, p.sku])).toEqual([[2, 'Cotton T-shirt', 'TSH-001'], [3, 'Phone case', 'CASE-9']]);
    const shirt = (await w.products.get(r.products[0].productId!))!;
    expect(shirt).toMatchObject({ status: 'pending', sellerId: shop.id, name: 'Cotton T-shirt', nameFr: 'T-shirt en coton', price: 12.5, stock: 40, sku: 'TSH-001', brand: 'Somba', weightGrams: 200, image: 'https://cdn.example.com/1.jpg' });
    expect(shirt.images).toEqual(['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg']);
    expect(JSON.parse(shirt.variants!)).toEqual([{ name: 'Size', options: ['S', 'M'] }, { name: 'Colour', options: ['Black', 'White'] }]);
    // The other language of the second row is filled by the translator.
    const caseId = r.products[1].productId!;
    await w.translations.runJob('product', caseId);
    expect((await w.products.get(caseId))?.nameFr).toBe('[fr] Phone case');
    // Stock ledger says it came from an import.
    expect((await w.products.movementsOf(caseId, { take: 5, skip: 0 })).items[0].reason).toBe('import');
    // Admins were told once.
    expect(w.notes.filter((n) => n.title === 'Product awaiting review').map((n) => n.body)).toEqual(['2 products imported by Kinshasa Traders need moderation.']);
  });

  it('a bad row never blocks the good ones; each bad row says why', async () => {
    const csv = [
      HEADER,
      'Good,,,10,Electronics,5,G-1,,,,',
      ',,,10,Electronics,5,,,,,', // no title
      'No price,,,,Electronics,5,,,,,',
      'Bad price,,,abc,Electronics,5,,,,,',
      'Bad category,,,10,Nowhere,5,,,,,',
      'Bad image,,,10,Electronics,5,,,,http://insecure.example.com/x.png,',
      'Bad sku,,,10,Electronics,5,bad sku!,,,,',
      'Negative stock,,,10,Electronics,-3,,,,,',
      'Bad options,,,10,Electronics,5,,,,,Size',
    ].join('\n');
    const r = await importer.import(seller, { csv });
    expect(r).toMatchObject({ total: 9, created: 1, failed: 8 });
    const why = Object.fromEntries(r.errors.map((e) => [e.row, e.errors.join(' / ')]));
    expect(why[3]).toContain('Enter a product title in English or French');
    expect(why[4]).toContain('Price');
    expect(why[5]).toContain('Price');
    expect(why[6]).toContain('Choose a category from the list');
    expect(why[7]).toContain('upload or a secure');
    expect(why[8]).toContain('SKU can use');
    expect(why[9]).toContain('Stock');
    expect(why[10]).toContain('Size=S|M|L');
    expect(await w.ds.getRepository(Product).count()).toBe(1);
  });

  it('a row with several problems lists every one of them, not just the first', async () => {
    const csv = [
      HEADER,
      ',,,abc,Nowhere,-3,bad sku!,,,http://insecure.example.com/x.png,Size', // no title, bad price, category, stock, sku, image, options
      ',,,10,Electronics,5,,,,,', // only the title is missing
      'No price,,,,Electronics,5,,,,,', // only the price is missing
    ].join('\n');
    const r = await importer.import(seller, { csv, dryRun: true });
    const why = Object.fromEntries(r.errors.map((e) => [e.row, e.errors]));
    expect(why[2].join(' / ')).toEqual(expect.stringContaining('Enter a product title in English or French'));
    for (const part of ['Price', 'Choose a category from the list', 'Stock', 'SKU can use', 'upload or a secure', 'Size=S|M|L']) {
      expect(why[2].some((m) => m.includes(part))).toBe(true);
    }
    expect(new Set(why[2]).size).toBe(why[2].length); // no message twice
    expect(why[2].length).toBeGreaterThanOrEqual(7);
    expect(why[3]).toEqual(['Enter a product title in English or French.']);
    expect(why[4]).toHaveLength(1);
    expect(why[4][0]).toContain('Price');
  });

  it('a missing title no longer hides the price error (name AND price both reported)', async () => {
    const r = await importer.import(seller, { csv: [HEADER, ',,,,Electronics,5,,,,,'].join('\n'), dryRun: true });
    expect(r.errors[0].errors).toEqual(expect.arrayContaining([expect.stringContaining('title'), expect.stringContaining('Price')]));
  });

  it('catches duplicate SKUs inside the file and against the catalogue', async () => {
    await w.product(shop, { sku: 'EXISTING' });
    const csv = [HEADER, 'A,,,1,Electronics,1,NEW-1,,,,', 'B,,,1,Electronics,1,new-1,,,,', 'C,,,1,Electronics,1,EXISTING,,,,'].join('\n');
    const r = await importer.import(seller, { csv });
    expect(r.products.map((p) => p.name)).toEqual(['A']);
    expect(r.errors.map((e) => [e.row, e.errors[0]])).toEqual([
      [3, 'The SKU "new-1" appears twice in this file.'],
      [4, 'The SKU "EXISTING" is already used by another of your products.'],
    ]);
  });

  it('a dry run checks everything and creates nothing', async () => {
    const csv = [HEADER, 'A,,,1,Electronics,1,,,,,', ',,,1,Electronics,1,,,,,'].join('\n');
    const r = await importer.import(seller, { csv, dryRun: true });
    expect(r).toMatchObject({ dryRun: true, created: 0, failed: 1 });
    expect(r.products).toHaveLength(1);
    expect(r.products[0].productId).toBeUndefined();
    expect(await w.ds.getRepository(Product).count()).toBe(0);
    expect(w.notes).toHaveLength(0);
  });

  it('accepts rows as objects with French or English column names, and semicolon CSVs with decimal commas', async () => {
    const a = await importer.import(seller, { rows: [{ Nom: 'Stylo', 'Prix': '1,50', 'Catégorie': 'Électronique', Quantité: '3', Marque: 'Bic' }] });
    expect(a.created).toBe(1);
    expect(await w.products.get(a.products[0].productId!)).toMatchObject({ name: 'Stylo', price: 1.5, stock: 3, brand: 'Bic' });
    const b = await importer.import(seller, { csv: 'nom;prix;categorie;stock\nCahier;2,25;Electronics;7' });
    expect(b.created).toBe(1);
    expect(await w.products.get(b.products[0].productId!)).toMatchObject({ name: 'Cahier', price: 2.25 });
  });

  it('refuses a file without the essential columns, an empty file, too many rows, and a missing source', async () => {
    await expect(importer.import(seller, { csv: 'a,b\n1,2' })).rejects.toThrow('"name" column');
    await expect(importer.import(seller, { csv: 'name,stock\nx,1' })).rejects.toThrow('"price" column');
    await expect(importer.import(seller, { csv: 'name,price' })).rejects.toThrow('header line and at least one product');
    await expect(importer.import(seller, { rows: [] })).rejects.toThrow('no products');
    const many = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => ({ name: `P${i}`, price: 1, category: 'Electronics' }));
    await expect(importer.import(seller, { rows: many })).rejects.toThrow(`at most ${MAX_IMPORT_ROWS}`);
    await expect(importer.import(seller, {})).rejects.toThrow('`rows`, `csv` text or a `csvUrl`');
  });

  it('respects the plan’s listing cap', async () => {
    planMax = 2;
    await w.product(shop);
    const r = await importer.import(seller, { rows: [1, 2, 3].map((i) => ({ name: `P${i}`, price: 1, category: 'Electronics' })) });
    expect(r.created).toBe(1);
    expect(r.errors.map((e) => e.errors[0])).toEqual(['Your Free plan allows 2 listings: upgrade it to add more.', 'Your Free plan allows 2 listings: upgrade it to add more.']);
  });

  it('only sellers (their own store) and admins (a named store) can import; a store must be approved', async () => {
    await expect(importer.import({ id: 'c1', role: 'customer' }, { rows: [] })).rejects.toThrow('Only sellers or admins');
    await expect(importer.import({ id: 'nobody', role: 'seller' }, { rows: [{ name: 'x', price: 1 }] })).rejects.toThrow('Open a store first');
    await w.store('New Shop', 'u-new', { status: 'pending' });
    await expect(importer.import({ id: 'u-new', role: 'seller' }, { rows: [{ name: 'x', price: 1 }] })).rejects.toThrow('awaiting approval');
    const r = await importer.import({ id: 'a1', role: 'admin' }, { sellerId: shop.id, rows: [{ name: 'For KT', price: 3, category: 'Electronics' }] });
    expect(r.created).toBe(1);
    expect((await w.products.get(r.products[0].productId!))?.sellerId).toBe(shop.id);
    await expect(importer.import({ id: 'a1', role: 'admin' }, { rows: [{ name: 'x', price: 1 }] })).rejects.toThrow('sellerId');
  });

  it('refuses a csvUrl that is not a public https address', async () => {
    for (const url of ['http://example.com/p.csv', 'https://localhost/p.csv', 'https://127.0.0.1/p.csv', 'https://169.254.169.254/x', 'https://user:pw@example.com/p.csv', 'ftp://example.com/p.csv', 'nonsense']) {
      await expect(importer.import(seller, { csvUrl: url })).rejects.toThrow(/secure \(https\)|not valid/);
    }
  });

  it('gives a template whose header the importer understands', async () => {
    const t = importer.template();
    expect(t.columns).toEqual(TEMPLATE_HEADER);
    expect(t.csv.startsWith('﻿name,nameFr,description')).toBe(true);
    await w.ds.getRepository('Category').save(w.ds.getRepository('Category').create({ name: 'Fashion' }));
    const r = await importer.import(seller, { csv: t.csv, dryRun: true });
    expect(r).toMatchObject({ failed: 0, total: 2 });
  });

  it('variants cell format', () => {
    expect(parseVariantCell('Size=S|M; Colour:Black|White')).toEqual([{ name: 'Size', options: ['S', 'M'] }, { name: 'Colour', options: ['Black', 'White'] }]);
    expect(parseVariantCell('')).toBeNull();
  });
});
