import { cleanListing, cleanSku, materialTextChange } from './products.service';
import type { ListingInput } from './products.service';
import { commerceWorld } from '../testing/commerce-db';
import type { World } from '../testing/commerce-db';
import type { Seller } from '../database/entities';

const UP1 = 'http://localhost:3001/uploads/b5a32395-887e-47f3-9030-2c3b07e3115f.png';
const UP2 = 'http://localhost:3001/uploads/c5a32395-887e-47f3-9030-2c3b07e3115f.jpg';
const HTTPS = 'https://cdn.example.com/a.jpg';

const clean = (input: ListingInput, partial = false) => cleanListing({ price: 10, ...input }, { partial, allowStatus: false });

describe('cleanListing: pictures, sku, brand, weight', () => {
  it('a gallery sets the cover to its first picture', () => {
    const c = clean({ images: [UP1, HTTPS] });
    expect(c.columns).toMatchObject({ images: [UP1, HTTPS], image: UP1 });
  });

  it('a cover sent with the gallery goes first', () => {
    expect(clean({ images: [UP1, HTTPS], image: HTTPS }).columns).toMatchObject({ images: [HTTPS, UP1], image: HTTPS });
  });

  it('a lone cover only sets image (the service keeps the rest of the gallery)', () => {
    const c = clean({ image: UP1 });
    expect(c.columns.image).toBe(UP1);
    expect(c.columns.images).toBeUndefined();
    expect(clean({ image: null }).columns.image).toBeNull();
  });

  it('refuses a picture that is neither ours nor https, in either field', () => {
    expect(() => clean({ image: 'http://evil.example.com/x.png' })).toThrow('upload or a secure');
    expect(() => clean({ images: [UP1, 'javascript:alert(1)'] })).toThrow('Picture 2');
    expect(() => clean({ images: Array.from({ length: 9 }, (_, i) => `https://a.example.com/${i}.png`) })).toThrow('At most 8');
  });

  it('sku, brand and weight are validated', () => {
    expect(clean({ sku: ' TSH-001 ', brand: 'Somba', weightGrams: 250 }).columns).toMatchObject({ sku: 'TSH-001', brand: 'Somba', weightGrams: 250 });
    expect(clean({ weightKg: '0.35' }).columns.weightGrams).toBe(350);
    expect(clean({ sku: '' }).columns.sku).toBeNull();
    expect(() => clean({ sku: 'bad sku!' })).toThrow('SKU can use');
    expect(() => clean({ weightGrams: 0 })).toThrow('Weight');
    expect(() => clean({ weightKg: 5000 })).toThrow('Weight');
    expect(cleanSku('A/B-1 .#')).toBe('A/B-1 .#');
  });

  it('carries variantStock as sent for the service to check against the options', () => {
    expect(clean({ variantStock: { x: 1 } }).variantStock).toEqual({ x: 1 });
    expect(clean({ variantStock: null }).variantStock).toBeNull();
    expect(clean({}).variantStock).toBeUndefined();
  });
});

let w: World;
let shop: Seller;
beforeEach(async () => {
  w = await commerceWorld();
  shop = await w.store();
});
afterEach(async () => w.ds.destroy());

const edit = (id: string, input: ListingInput) => w.products.update(id, cleanListing(input, { partial: true, allowStatus: false }));

describe('pictures', () => {
  it('are stored as a list, the cover is the first, and they are served as an array', async () => {
    const p = await w.product(shop, { images: [UP1, HTTPS] });
    expect(p.images).toEqual([UP1, HTTPS]);
    expect(p.image).toBe(UP1);
    expect((await w.products.get(p.id))?.images).toEqual([UP1, HTTPS]);
  });

  it('an old client that sends only `image` still works', async () => {
    const p = await w.product(shop, { image: UP1 });
    expect(p.images).toEqual([UP1]);
    expect(p.image).toBe(UP1);
  });

  it('changing the cover keeps the other pictures; clearing it drops the cover only', async () => {
    const p = await w.product(shop, { images: [UP1, HTTPS, UP2] });
    const a = await edit(p.id, { image: UP2 });
    expect(a?.images).toEqual([UP2, HTTPS]);
    expect(a?.image).toBe(UP2);
    const b = await edit(p.id, { image: null });
    expect(b?.images).toEqual([HTTPS]);
    expect(b?.image).toBe(HTTPS);
  });

  it('a new gallery replaces the old one', async () => {
    const p = await w.product(shop, { images: [UP1, HTTPS] });
    const a = await edit(p.id, { images: [UP2] });
    expect(a?.images).toEqual([UP2]);
    expect(a?.image).toBe(UP2);
    expect((await edit(p.id, { images: [] }))?.image).toBeNull();
  });

  it('a change of pictures counts as a material change (moderation)', async () => {
    const p = await w.product(shop, { images: [UP1] });
    expect(materialTextChange(p, clean({ images: [UP1, HTTPS] }, true))).toBe(true);
    expect(materialTextChange(p, clean({ images: [UP1] }, true))).toBe(false);
    expect(materialTextChange(p, clean({ brand: 'New' }, true))).toBe(true);
  });
});

describe('sku: unique per seller (C-CM1)', () => {
  it('refuses a second product of the same seller with the same sku, in any case', async () => {
    await w.product(shop, { sku: 'TSH-001' });
    await expect(w.product(shop, { sku: 'tsh-001' })).rejects.toThrow('already used by another of your products');
  });

  it('two sellers may use the same sku', async () => {
    const other = await w.store('Other Shop');
    await w.product(shop, { sku: 'SAME' });
    await expect(w.product(other, { sku: 'SAME' })).resolves.toBeDefined();
  });

  it('an edit may keep its own sku but not take another product’s', async () => {
    const a = await w.product(shop, { sku: 'A-1' });
    const b = await w.product(shop, { sku: 'B-1' });
    await expect(edit(a.id, { sku: 'A-1', brand: 'x' })).resolves.toBeDefined();
    await expect(edit(b.id, { sku: 'A-1' })).rejects.toThrow('already used');
    expect((await edit(b.id, { sku: null }))?.sku).toBeNull();
  });

  it('the database refuses it too (two saves racing)', async () => {
    const a = await w.product(shop, { sku: 'DB-1' });
    // Bypass the service check: write straight to the table.
    const b = await w.product(shop, { sku: 'DB-2' });
    await expect(w.ds.getRepository('Product').update({ id: b.id }, { sku: a.sku })).rejects.toThrow();
  });

  it('brand and weight are stored and served', async () => {
    const p = await w.product(shop, { brand: 'Somba', weightKg: 1.25 });
    expect(p).toMatchObject({ brand: 'Somba', weightGrams: 1250 });
  });
});

describe('served galleries and removal', () => {
  it('a listing with only a cover is served as a gallery of one', async () => {
    const p = await w.product(shop, { name: 'Old style' });
    await w.ds.getRepository('Product').update({ id: p.id }, { image: UP1, images: null });
    expect((await w.products.get(p.id))?.images).toEqual([UP1]);
  });

  it('removing a listing frees its SKU', async () => {
    const a = await w.product(shop, { sku: 'REUSE-1' });
    await w.products.remove(a.id);
    await expect(w.product(shop, { sku: 'REUSE-1' })).resolves.toBeDefined();
  });
});
