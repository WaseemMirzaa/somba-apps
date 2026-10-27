import { crossedDown } from './inventory.service';
import { commerceWorld } from '../testing/commerce-db';
import type { World } from '../testing/commerce-db';
import type { Seller } from '../database/entities';
import { Order, OrderItem } from '../database/entities';

const BLACK_S = 'Size: S · Colour: Black';
const WHITE_M = 'Size: M · Colour: White';
const OPTIONS = [
  { name: 'Size', options: ['S', 'M'] },
  { name: 'Colour', options: ['Black', 'White'] },
];

let w: World;
let shop: Seller;
let owner: { id: string; role: string };
beforeEach(async () => {
  w = await commerceWorld();
  shop = await w.store('Kinshasa Traders', 'u-kt');
  owner = { id: 'u-kt', role: 'seller' };
});
afterEach(async () => w.ds.destroy());

const lows = () => w.notes.filter((n) => ['Low stock', 'Out of stock', 'Low stock alert'].includes(n.title));

describe('crossedDown', () => {
  it('is true only when a decrease takes the count from above the line to on or below it', () => {
    expect(crossedDown(11, 10, 10)).toBe(true);
    expect(crossedDown(20, 3, 10)).toBe(true);
    expect(crossedDown(10, 9, 10)).toBe(false); // already at the line
    expect(crossedDown(5, 4, 10)).toBe(false);
    expect(crossedDown(5, 8, 10)).toBe(false); // an increase never crosses downwards
    expect(crossedDown(12, 11, 10)).toBe(false);
  });
});

describe('low-stock notices (once per crossing)', () => {
  it('tells the seller and operations when a sale takes the product to the line, and not again below it', async () => {
    const p = await w.product(shop, { name: 'Phone case', stock: 12 });
    await w.products.reserve(p.id, 1); // 11
    expect(lows()).toHaveLength(0);
    await w.products.reserve(p.id, 1); // 10 = the default line
    const seller = lows().filter((n) => n.to === 'user:u-kt');
    expect(seller).toHaveLength(1);
    expect(seller[0]).toMatchObject({ title: 'Low stock', type: 'stock' });
    expect(seller[0].body).toBe('Phone case is down to 10 (alert at 10). Restock soon.');
    expect(lows().filter((n) => n.title === 'Low stock alert').map((n) => n.to).sort()).toEqual(['role:admin', 'role:admin_operations']);
    await w.products.reserve(p.id, 1); // 9
    await w.products.reserve(p.id, 1); // 8
    expect(lows().filter((n) => n.to === 'user:u-kt')).toHaveLength(1);
  });

  it('says so when it runs out, then re-arms after a restock above the line', async () => {
    const p = await w.product(shop, { name: 'Phone case', stock: 12 });
    await w.products.reserve(p.id, 12); // 12 -> 0 at once: out of stock, not "low"
    expect(lows().filter((n) => n.to === 'user:u-kt').map((n) => n.title)).toEqual(['Out of stock']);
    await w.products.restock(p.id, 30);
    await w.products.reserve(p.id, 25); // 30 -> 5: crosses again
    expect(lows().filter((n) => n.to === 'user:u-kt').map((n) => n.title)).toEqual(['Out of stock', 'Low stock']);
  });

  it('uses the store’s own line', async () => {
    await w.inventory.settings(owner, { lowStockThreshold: 3 });
    const p = await w.product(shop, { name: 'Phone case', stock: 8 });
    await w.products.reserve(p.id, 4); // 4: above the line of 3
    expect(lows()).toHaveLength(0);
    await w.products.reserve(p.id, 1); // 3
    expect(lows().filter((n) => n.to === 'user:u-kt')).toHaveLength(1);
  });

  it('watches an option’s own count when it has one, and names the option', async () => {
    const p = await w.product(shop, { name: 'T-shirt', stock: undefined, variants: OPTIONS, variantStock: { [BLACK_S]: 11, [WHITE_M]: 50 } });
    await w.products.reserve(p.id, 2, { variant: BLACK_S }); // 9 <= 10
    expect(lows().find((n) => n.to === 'user:u-kt')?.body).toBe('T-shirt (Size: S · Colour: Black) is down to 9 (alert at 10). Restock soon.');
    await w.products.reserve(p.id, 5, { variant: WHITE_M }); // 45: nothing
    expect(lows().filter((n) => n.to === 'user:u-kt')).toHaveLength(1);
  });

  it('a manual removal can trigger it too, an addition never does', async () => {
    const p = await w.product(shop, { stock: 14 });
    await w.inventory.adjust(owner, { productId: p.id, delta: 20 });
    expect(lows()).toHaveLength(0);
    await w.inventory.adjust(owner, { productId: p.id, delta: -30 });
    expect(lows().filter((n) => n.to === 'user:u-kt')).toHaveLength(1);
  });

  it('also sends a live event to the seller', async () => {
    const p = await w.product(shop, { stock: 11 });
    w.emitter.sent.length = 0;
    await w.products.reserve(p.id, 2);
    expect(w.emitter.sent.find((e) => e.event === 'stock:low')).toMatchObject({ to: 'user:u-kt', payload: { productId: p.id, stock: 9, threshold: 10, outOfStock: false } });
  });
});

describe('inventory:adjust', () => {
  it('adds and removes by delta and returns the new numbers', async () => {
    const p = await w.product(shop, { stock: 10 });
    expect(await w.inventory.adjust(owner, { productId: p.id, delta: 5, reason: 'return_restock', note: 'customer return' })).toMatchObject({ stock: 15, stockAfter: 15, delta: 5, reason: 'return_restock' });
    expect(await w.inventory.adjust(owner, { productId: p.id, delta: '-3' })).toMatchObject({ stock: 12, reason: 'manual_adjust' });
  });

  it('adjusts one option by its label in any case, and refuses a label that is not an option', async () => {
    const p = await w.product(shop, { stock: undefined, variants: OPTIONS, variantStock: { [BLACK_S]: 2, [WHITE_M]: 5 } });
    const r = await w.inventory.adjust(owner, { productId: p.id, variant: 'size: s · colour: black', delta: 4 });
    expect(r).toMatchObject({ variant: BLACK_S, variantStock: { [BLACK_S]: 6, [WHITE_M]: 5 }, stock: 11 });
    await expect(w.inventory.adjust(owner, { productId: p.id, variant: 'Size: XL · Colour: Black', delta: 1 })).rejects.toThrow('Choose a size');
    const plain = await w.product(shop, { stock: 3 });
    await expect(w.inventory.adjust(owner, { productId: plain.id, variant: 'Size: S', delta: 1 })).rejects.toThrow('no options');
  });

  it('validates the delta and the reason', async () => {
    const p = await w.product(shop, { stock: 3 });
    for (const delta of [0, 1.5, 'x', undefined, 2_000_000]) {
      await expect(w.inventory.adjust(owner, { productId: p.id, delta })).rejects.toThrow('whole number of units');
    }
    await expect(w.inventory.adjust(owner, { productId: p.id, delta: 1, reason: 'sale' })).rejects.toThrow('Reason must be one of');
    await expect(w.inventory.adjust(owner, { productId: p.id, delta: -4 })).rejects.toThrow('only 3 in stock');
  });

  it('a seller cannot touch another seller’s product; an admin can touch any', async () => {
    const other = await w.store('Other Shop', 'u-other');
    const p = await w.product(other, { stock: 3 });
    await expect(w.inventory.adjust(owner, { productId: p.id, delta: 1 })).rejects.toThrow('Product not found');
    await expect(w.inventory.adjust({ id: 'a1', role: 'admin_operations' }, { productId: p.id, delta: 1 })).resolves.toMatchObject({ stock: 4 });
    await expect(w.inventory.adjust({ id: 'c1', role: 'customer' }, { productId: p.id, delta: 1 })).rejects.toThrow('Product not found');
  });
});

describe('inventory:movements', () => {
  it('lists the ledger newest first with paging, and only for the owner', async () => {
    const p = await w.product(shop, { stock: 10 });
    await w.inventory.adjust(owner, { productId: p.id, delta: 1 });
    await w.inventory.adjust(owner, { productId: p.id, delta: 2 });
    await w.products.reserve(p.id, 1, { orderId: 'o9' });
    const all = await w.inventory.movements(owner, { productId: p.id });
    expect(all.total).toBe(4);
    expect(all.items.map((m) => m.reason)).toContain('sale');
    expect(all.items.find((m) => m.reason === 'sale')).toMatchObject({ orderId: 'o9', delta: -1 });
    const page = await w.inventory.movements(owner, { productId: p.id, limit: 2, offset: 2 });
    expect(page.items).toHaveLength(2);
    const other = await w.store('Other Shop', 'u-other');
    await expect(w.inventory.movements({ id: 'u-other', role: 'seller' }, { productId: p.id })).rejects.toThrow('Product not found');
    void other;
  });
});

describe('inventory:settings', () => {
  it('reads 10 by default and sets a new line (0..100000)', async () => {
    expect(await w.inventory.settings(owner)).toEqual({ lowStockThreshold: 10 });
    expect(await w.inventory.settings(owner, { lowStockThreshold: 25 })).toEqual({ lowStockThreshold: 25 });
    expect((await w.ds.getRepository('Seller').findOneBy({ id: shop.id })) as Seller).toMatchObject({ lowStockThreshold: 25 });
    for (const bad of [-1, 1.5, 'x', 200_000]) await expect(w.inventory.settings(owner, { lowStockThreshold: bad })).rejects.toThrow('low-stock alert');
  });
  it('an admin names the store', async () => {
    expect(await w.inventory.settings({ id: 'a', role: 'admin' }, { sellerId: shop.id, lowStockThreshold: 4 })).toEqual({ lowStockThreshold: 4 });
    await expect(w.inventory.settings({ id: 'a', role: 'admin' }, {})).rejects.toThrow('sellerId');
  });
});

describe('inventory:overview', () => {
  it('lists products with split, pool, reserved and low flags, and filters', async () => {
    const low = await w.product(shop, { name: 'Almost gone', sku: 'LOW-1', stock: 4 });
    const fine = await w.product(shop, { name: 'Plenty', stock: 100 });
    const out = await w.product(shop, { name: 'Sold out', stock: 0 });
    // 3 units of "Plenty" are reserved by an open order.
    const order = await w.ds.getRepository(Order).save(w.ds.getRepository(Order).create({ reference: 'SOM-1', customerId: 'c', customerName: 'C', status: 'confirmed' }));
    await w.ds.getRepository(OrderItem).save(w.ds.getRepository(OrderItem).create({ orderId: order.id, productId: fine.id, productName: 'Plenty', qty: 3, priceUsd: 10 }));
    const view = await w.inventory.overview(owner);
    expect(view.summary).toEqual({ products: 3, units: 104, outOfStock: 1, lowStock: 1 });
    expect(view.items.map((i) => i.name)).toEqual(['Sold out', 'Almost gone', 'Plenty']); // emptiest first
    expect(view.items.find((i) => i.productId === fine.id)).toMatchObject({ reserved: 3, low: false, outOfStock: false, pool: 100 });
    expect(view.items.find((i) => i.productId === out.id)).toMatchObject({ outOfStock: true });
    expect((await w.inventory.overview(owner, { low: true })).items.map((i) => i.productId).sort()).toEqual([low.id, out.id].sort());
    expect((await w.inventory.overview(owner, { q: 'low-1' })).items.map((i) => i.productId)).toEqual([low.id]);
    expect((await w.inventory.overview(owner, { limit: 1, offset: 1 })).items).toHaveLength(1);
  });
});

describe('cart:validate', () => {
  it('checks every line against the stock of its own option and sums repeated lines', async () => {
    const shirt = await w.product(shop, { name: 'T-shirt', stock: undefined, variants: OPTIONS, variantStock: { [BLACK_S]: 2, [WHITE_M]: 5 } });
    const plain = await w.product(shop, { name: 'Case', stock: 1 });
    const gone = await w.product(shop, { name: 'Gone', stock: 5 }, 'pending');
    const r = await w.inventory.validateCart('c1', [
      { productId: shirt.id, variant: BLACK_S, qty: 2 },
      { productId: shirt.id, variant: BLACK_S, qty: 1 }, // the same option again: 3 > 2
      { productId: shirt.id, variant: WHITE_M, qty: 5 },
      { productId: plain.id, qty: 2 },
      { productId: gone.id, qty: 1 },
      { productId: shirt.id, variant: 'Size: XL · Colour: Black', qty: 1 },
    ]);
    expect(r.ok).toBe(false);
    expect(r.lines.map((l) => [l.ok, l.available])).toEqual([
      [true, 2],
      [false, 2],
      [true, 5],
      [false, 1],
      [false, 0],
      [false, 0],
    ]);
    expect(r.lines[1].reason).toBe('Only 2 of "T-shirt" (Size: S · Colour: Black) left in stock.');
    expect(r.lines[3].reason).toBe('Only 1 of "Case" left in stock.');
    expect(r.lines[4].reason).toBe('This product is no longer available.');
    expect(r.lines[5].reason).toContain('Choose a size');
  });

  it('is ok when everything fits', async () => {
    const plain = await w.product(shop, { stock: 3 });
    expect((await w.inventory.validateCart('c1', [{ productId: plain.id, qty: 3 }])).ok).toBe(true);
    expect((await w.inventory.validateCart('c1', [])).ok).toBe(true);
  });
});
