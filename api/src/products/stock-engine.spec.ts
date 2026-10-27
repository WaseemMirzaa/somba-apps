import { BadRequestException } from '@nestjs/common';
import { commerceWorld } from '../testing/commerce-db';
import type { World } from '../testing/commerce-db';
import type { Seller } from '../database/entities';

const BLACK_S = 'Size: S · Colour: Black';
const WHITE_M = 'Size: M · Colour: White';
const OPTIONS = [
  { name: 'Size', options: ['S', 'M'] },
  { name: 'Colour', options: ['Black', 'White'] },
];

let w: World;
let shop: Seller;
beforeEach(async () => {
  w = await commerceWorld();
  shop = await w.store();
});
afterEach(async () => w.ds.destroy());

const row = async (id: string) => (await w.products.getRaw(id))!;
const ledger = async (id: string) => (await w.products.movementsOf(id, { take: 50, skip: 0 })).items;

describe('reserve / restock (a product without options)', () => {
  it('takes units atomically and never oversells', async () => {
    const p = await w.product(shop, { stock: 5 });
    const results = await Promise.all(Array.from({ length: 12 }, () => w.products.reserve(p.id, 1, { reason: 'sale' })));
    expect(results.filter(Boolean)).toHaveLength(5);
    expect((await row(p.id)).stock).toBe(0);
    expect(await w.products.reserve(p.id, 1)).toBe(false);
  });

  it('writes one ledger line per change, with the reason, order and stock after', async () => {
    const p = await w.product(shop, { stock: 5 });
    await w.products.reserve(p.id, 2, { orderId: 'o1' });
    await w.products.restock(p.id, 1, { orderId: 'o1', reason: 'cancel_restock' });
    const lines = await ledger(p.id);
    const byReason = Object.fromEntries(lines.map((l) => [l.reason, l]));
    expect(lines).toHaveLength(3); // initial + sale + cancel_restock
    expect(byReason.initial).toMatchObject({ delta: 5, stockAfter: 5, sellerId: shop.id });
    expect(byReason.sale).toMatchObject({ delta: -2, stockAfter: 3, orderId: 'o1' });
    expect(byReason.cancel_restock).toMatchObject({ delta: 1, stockAfter: 4, orderId: 'o1' });
  });

  it('tells shoppers and staff about the new stock', async () => {
    const p = await w.product(shop, { stock: 5 });
    w.emitter.sent.length = 0;
    await w.products.reserve(p.id, 1);
    const ev = w.emitter.sent.find((e) => e.event === 'product:updated')!;
    expect(ev.to.split(',')).toEqual(expect.arrayContaining(['customer', 'guest', 'admin']));
    expect(ev.payload.stock).toBe(4);
  });

  it('a restock of an unknown product is a no-op', async () => {
    await expect(w.products.restock('nope', 3)).resolves.toBeUndefined();
  });
});

describe('stock per option', () => {
  const split = async (_stock: number, entries: Record<string, number>) => w.product(shop, { stock: undefined, variants: OPTIONS, variantStock: entries });

  it('creating with a split sets the total from it', async () => {
    const p = await split(0, { [BLACK_S]: 3, [WHITE_M]: 4 });
    expect(p.variantStock).toEqual({ [BLACK_S]: 3, [WHITE_M]: 4 });
    expect(p.stock).toBe(7);
  });

  it('an option sells from its own count, and only that count', async () => {
    const p = await split(0, { [BLACK_S]: 2, [WHITE_M]: 5 });
    expect(await w.products.reserve(p.id, 2, { variant: BLACK_S })).toBe(true);
    expect(await w.products.reserve(p.id, 1, { variant: BLACK_S })).toBe(false); // that option is sold out although the product has 5 left
    const after = await row(p.id);
    expect(after.variantStock).toEqual({ [BLACK_S]: 0, [WHITE_M]: 5 });
    expect(after.stock).toBe(5);
  });

  it('an option with no entry draws on the shared pool', async () => {
    const p = await w.product(shop, { stock: 10, variants: OPTIONS, variantStock: { [BLACK_S]: 3 } }); // pool = 10 - ... see below
    const before = await row(p.id);
    const pool = before.stock - 3;
    expect(await w.products.reserve(p.id, pool, { variant: WHITE_M })).toBe(true);
    expect(await w.products.reserve(p.id, 1, { variant: WHITE_M })).toBe(false);
    expect((await row(p.id)).variantStock).toEqual({ [BLACK_S]: 3 });
    expect(await w.products.availableFor(p.id, BLACK_S)).toBe(3);
  });

  it('concurrent orders for one option never oversell it', async () => {
    const p = await split(0, { [BLACK_S]: 4, [WHITE_M]: 50 });
    const results = await Promise.all(Array.from({ length: 15 }, () => w.products.reserve(p.id, 1, { variant: BLACK_S })));
    expect(results.filter(Boolean)).toHaveLength(4);
    const after = await row(p.id);
    expect(after.variantStock?.[BLACK_S]).toBe(0);
    expect(after.stock).toBe(50);
  });

  it('a restock gives the units back to the option', async () => {
    const p = await split(0, { [BLACK_S]: 2, [WHITE_M]: 5 });
    await w.products.reserve(p.id, 2, { variant: BLACK_S, orderId: 'o1' });
    await w.products.restock(p.id, 2, { variant: BLACK_S, orderId: 'o1', reason: 'return_restock' });
    const after = await row(p.id);
    expect(after.variantStock).toEqual({ [BLACK_S]: 2, [WHITE_M]: 5 });
    const last = (await ledger(p.id)).find((l) => l.reason === 'return_restock')!;
    expect(last).toMatchObject({ variant: BLACK_S, delta: 2 });
  });
});

describe('adjustStock (a person corrects by a number of units)', () => {
  it('adds and removes by delta, and composes with a sale in between', async () => {
    const p = await w.product(shop, { stock: 10 });
    await w.products.adjustStock(p.id, 5, { reason: 'manual_adjust', actorId: 'u1', note: 'found in the back' });
    await w.products.reserve(p.id, 3);
    await w.products.adjustStock(p.id, -2, { reason: 'manual_adjust', actorId: 'u1' });
    expect((await row(p.id)).stock).toBe(10);
    const manual = (await ledger(p.id)).filter((l) => l.reason === 'manual_adjust');
    expect(manual).toHaveLength(2);
    expect(manual.find((l) => l.delta === 5)).toMatchObject({ actorId: 'u1', note: 'found in the back' });
  });

  it('refuses to go below zero, and says how many there are', async () => {
    const p = await w.product(shop, { stock: 3 });
    await expect(w.products.adjustStock(p.id, -4, {})).rejects.toThrow('only 3 in stock');
    expect((await row(p.id)).stock).toBe(3);
  });

  it('refuses zero, and an unknown product', async () => {
    const p = await w.product(shop, { stock: 3 });
    await expect(w.products.adjustStock(p.id, 0, {})).rejects.toThrow(BadRequestException);
    await expect(w.products.adjustStock('nope', 1, {})).rejects.toThrow('Product not found');
  });

  it('adjusts one option', async () => {
    const p = await w.product(shop, { stock: undefined, variants: OPTIONS, variantStock: { [BLACK_S]: 2, [WHITE_M]: 5 } });
    await w.products.adjustStock(p.id, 3, { variant: BLACK_S });
    expect((await row(p.id)).variantStock).toEqual({ [BLACK_S]: 5, [WHITE_M]: 5 });
    await expect(w.products.adjustStock(p.id, -6, { variant: BLACK_S })).rejects.toThrow('for "Size: S · Colour: Black"');
  });
});

describe('editing the product keeps the two numbers consistent', () => {
  const edit = (id: string, input: Record<string, unknown>) => w.products.update(id, (require('./products.service') as typeof import('./products.service')).cleanListing(input, { partial: true, allowStatus: false }));

  it('setting stock per option moves the total with it; the pool is kept', async () => {
    const p = await w.product(shop, { stock: 10, variants: OPTIONS });
    const updated = await edit(p.id, { variantStock: { [BLACK_S]: 4 } });
    expect(updated?.variantStock).toEqual({ [BLACK_S]: 4 });
    expect(updated?.stock).toBe(14); // the 10 that nobody claimed stay in the pool
  });

  it('an explicit total must cover the entries', async () => {
    const p = await w.product(shop, { stock: 10, variants: OPTIONS });
    await expect(edit(p.id, { stock: 2, variantStock: { [BLACK_S]: 4 } })).rejects.toThrow('below the stock set per option');
    const ok = await edit(p.id, { stock: 6, variantStock: { [BLACK_S]: 4 } });
    expect(ok?.stock).toBe(6);
  });

  it('removing an option drops its entry (its units go to the pool)', async () => {
    const p = await w.product(shop, { stock: undefined, variants: OPTIONS, variantStock: { [BLACK_S]: 3, [WHITE_M]: 4 } });
    const updated = await edit(p.id, { variants: [{ name: 'Size', options: ['S', 'M'] }] });
    expect(updated?.variantStock).toBeNull();
    expect(updated?.stock).toBe(7);
  });

  it('clearing the split keeps the total', async () => {
    const p = await w.product(shop, { stock: undefined, variants: OPTIONS, variantStock: { [BLACK_S]: 3, [WHITE_M]: 4 } });
    const updated = await edit(p.id, { variantStock: null });
    expect(updated?.variantStock).toBeNull();
    expect(updated?.stock).toBe(7);
  });

  it('an absolute stock edit is written to the ledger as a manual adjustment', async () => {
    const p = await w.product(shop, { stock: 10 });
    await edit(p.id, { stock: 4 });
    const manual = (await ledger(p.id)).find((l) => l.reason === 'manual_adjust')!;
    expect(manual).toMatchObject({ delta: -6, stockAfter: 4 });
  });
});
