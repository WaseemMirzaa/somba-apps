import { FlashSale, Order, Promo } from '../database/entities';
import type { Seller } from '../database/entities';
import { allocate, flashDiscountPct, flashPhase } from './promos.service';
import { commerceWorld } from '../testing/commerce-db';
import type { World } from '../testing/commerce-db';

let w: World;
let shop: Seller;
let other: Seller;
beforeEach(async () => {
  w = await commerceWorld();
  shop = await w.store('Kinshasa Traders', 'u-kt');
  other = await w.store('Other Shop', 'u-other');
});
afterEach(async () => w.ds.destroy());

const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const H = 3_600_000;

describe('allocate (a coupon split over lines)', () => {
  it('adds up to the total to the cent, in proportion', () => {
    expect(allocate(10, [50, 50])).toEqual([5, 5]);
    const shares = allocate(10, [10, 10, 10]);
    expect(shares.reduce((t, n) => t + n, 0)).toBeCloseTo(10, 2);
    expect(shares).toEqual([3.33, 3.33, 3.34]);
    expect(allocate(7.01, [3, 0, 7])).toEqual([2.1, 0, 4.91]);
  });
  it('gives nothing when there is nothing to give or nothing to give it to', () => {
    expect(allocate(0, [1, 2])).toEqual([0, 0]);
    expect(allocate(5, [0, 0])).toEqual([0, 0]);
  });
});

describe('flashPhase', () => {
  const sale = (over: Partial<FlashSale> = {}) => ({ active: true, status: 'approved' as const, startsAt: null, endsAt: null, ...over });
  it('is scheduled before the start, running inside, ended after or when switched off / not approved', () => {
    expect(flashPhase(sale({ startsAt: iso(H) }))).toBe('scheduled');
    expect(flashPhase(sale({ startsAt: iso(-H), endsAt: iso(H) }))).toBe('running');
    expect(flashPhase(sale({ endsAt: iso(-H) }))).toBe('ended');
    expect(flashPhase(sale())).toBe('running');
    expect(flashPhase(sale({ active: false }))).toBe('ended');
    expect(flashPhase(sale({ status: 'nominated' }))).toBe('ended');
    expect(flashPhase(sale({ status: 'declined' }))).toBe('ended');
  });
});

describe('flash sales: shoppers’ prices flip live', () => {
  const create = (productId: string, over: Record<string, unknown> = {}) => w.promos.createFlashSale({ title: 'Flash!', productId, flashPrice: 6, startsAt: iso(-H), endsAt: iso(H), ...over });

  it('creating a running sale re-emits the product at the flash price to shoppers, and tells the seller', async () => {
    const p = await w.product(shop, { name: 'Phone case', price: 10 });
    w.emitter.sent.length = 0;
    const sale = await create(p.id);
    expect(sale).toMatchObject({ status: 'approved', phase: 'running', productName: 'Phone case', basePrice: 10 });
    expect(sale.endsInMs).toBeGreaterThan(0);
    const upd = w.emitter.sent.find((e) => e.event === 'product:updated' && e.payload.id === p.id)!;
    expect(upd.payload).toMatchObject({ price: 6, priceSource: 'flash' });
    expect(upd.to.split(',')).toEqual(expect.arrayContaining(['customer', 'guest']));
    expect(w.emitter.sent.some((e) => e.event === 'flashsale:updated' && e.to.includes('customer'))).toBe(true);
    expect(w.notes.find((n) => n.title === 'Flash sale started')).toMatchObject({ to: 'user:u-kt', body: 'Phone case is now on flash sale at $6.00.', type: 'flash' });
  });

  it('tells "no end date" from "already over": endsAt null vs ended true (endsInMs is null for both)', async () => {
    const p = await w.product(shop, { name: 'Lamp', price: 10 });
    const running = await create(p.id);
    expect(running).toMatchObject({ ended: false, phase: 'running' });
    expect(running.endsInMs).toBeGreaterThan(0);
    expect(running.endsAt).toBeTruthy();
    const FlashSaleRepo = w.ds.getRepository('FlashSale');
    // No end date at all.
    await FlashSaleRepo.update({ id: running.id }, { endsAt: null });
    let [view] = await w.promos.presentFlash([await FlashSaleRepo.findOneByOrFail({ id: running.id }) as never]);
    expect(view).toMatchObject({ ended: false, endsAt: null, endsInMs: null, phase: 'running' });
    // An empty string is no end date either.
    await FlashSaleRepo.update({ id: running.id }, { endsAt: '' });
    [view] = await w.promos.presentFlash([await FlashSaleRepo.findOneByOrFail({ id: running.id }) as never]);
    expect(view.endsAt).toBeNull();
    expect(view.ended).toBe(false);
    // The end has passed.
    const past = iso(-60_000);
    await FlashSaleRepo.update({ id: running.id }, { endsAt: past });
    [view] = await w.promos.presentFlash([await FlashSaleRepo.findOneByOrFail({ id: running.id }) as never]);
    expect(view).toMatchObject({ ended: true, endsInMs: null, phase: 'ended' });
    expect(view.endsAt).toBe(past);
    // A nomination waiting for an answer is not "ended" (its phase is, as before: it changes no price) until its date passes; a declined one is.
    const row = await FlashSaleRepo.findOneByOrFail({ id: running.id });
    const waiting = await w.promos.presentFlash([{ ...row, status: 'nominated', endsAt: iso(H) } as never]);
    expect(waiting[0]).toMatchObject({ ended: false, phase: 'ended' });
    expect((await w.promos.presentFlash([{ ...row, status: 'nominated' } as never]))[0].ended).toBe(true); // its date passed
    expect((await w.promos.presentFlash([{ ...row, status: 'declined', endsAt: iso(H) } as never]))[0].ended).toBe(true);
  });

  it('a sale made without a percent gets it from the prices (and a new price re-derives it); a given percent wins', async () => {
    const p = await w.product(shop, { name: 'Radio', price: 20 });
    const auto = await create(p.id, { flashPrice: 15 });
    expect(auto.discount).toBe(25);
    expect((await create((await w.product(shop, { name: 'Radio 2', price: 20 })).id, { flashPrice: 15, discount: 10 })).discount).toBe(10);
    expect((await w.promos.updateFlashSale(auto.id, { flashPrice: 10 })).discount).toBe(50);
    expect((await w.promos.updateFlashSale(auto.id, { flashPrice: 5, discount: 40 })).discount).toBe(40);
    expect((await w.promos.updateFlashSale(auto.id, { title: 'Renamed' })).discount).toBe(40); // no price change: untouched
    expect(flashDiscountPct(20, 1)).toBe(90); // capped
    expect(flashDiscountPct(0, 1)).toBe(0);
    expect(flashDiscountPct(10, 12)).toBe(0);
  });

  it('a sale that starts later is announced as scheduled and changes no price yet', async () => {
    const p = await w.product(shop, { price: 10 });
    const sale = await create(p.id, { startsAt: iso(2 * H), endsAt: iso(5 * H) });
    expect(sale.phase).toBe('scheduled');
    expect(sale.startsInMs).toBeGreaterThan(0);
    expect((await w.products.get(p.id))?.price).toBe(10);
    expect(w.notes.find((n) => n.title === 'Flash sale scheduled')?.body).toMatch(/^Phone goes on flash sale at \$6\.00 from \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC\.$/);
  });

  it('the sweep starts and ends sales on their dates, once, and re-emits the price each time', async () => {
    const p = await w.product(shop, { name: 'Phone case', price: 10 });
    const sale = await create(p.id, { startsAt: iso(2 * H), endsAt: iso(5 * H) });
    expect(await w.promos.sweepFlash()).toBe(0);
    w.notes.length = 0;
    w.emitter.sent.length = 0;
    // Three hours later the sale is running.
    expect(await w.promos.sweepFlash(Date.now() + 3 * H)).toBe(1);
    expect(await w.promos.sweepFlash(Date.now() + 3 * H)).toBe(0); // announced once
    expect(w.notes.map((n) => n.title)).toEqual(['Flash sale started']);
    expect(w.emitter.sent.some((e) => e.event === 'flashsale:updated' && e.payload.phase === 'running')).toBe(true);
    // Six hours later it is over.
    expect(await w.promos.sweepFlash(Date.now() + 6 * H)).toBe(1);
    expect(w.notes.map((n) => n.title)).toEqual(['Flash sale started', 'Flash sale ended']);
    expect(await w.ds.getRepository(FlashSale).findOneByOrFail({ id: sale.id })).toMatchObject({ phase: 'ended' });
  });

  it('does not announce a sale that started or ended long ago (a late sweep after downtime)', async () => {
    const p = await w.product(shop, { price: 10 });
    const sale = await create(p.id, { startsAt: iso(-48 * H), endsAt: iso(48 * H) });
    await w.ds.getRepository(FlashSale).update({ id: sale.id }, { phase: 'scheduled' });
    w.notes.length = 0;
    await w.promos.sweepFlash();
    expect(w.notes.filter((n) => n.title === 'Flash sale started')).toHaveLength(0);
  });

  it('ending a sale puts the price back at once and tells the seller', async () => {
    const p = await w.product(shop, { name: 'Phone case', price: 10 });
    const sale = await create(p.id);
    expect((await w.products.get(p.id))?.price).toBe(6);
    w.emitter.sent.length = 0;
    const ended = await w.promos.endFlashSale(sale.id);
    expect(ended.phase).toBe('ended');
    expect((await w.products.get(p.id))?.price).toBe(10);
    expect(w.emitter.sent.find((e) => e.event === 'product:updated')?.payload).toMatchObject({ price: 10, priceSource: 'base' });
    expect(w.notes.find((n) => n.title === 'Flash sale ended')?.body).toBe('Phone case: the flash sale has ended; the price is back to normal.');
  });

  it('editing a sale changes the shoppers’ price live; deleting it removes it', async () => {
    const p = await w.product(shop, { price: 10 });
    const sale = await create(p.id);
    w.emitter.sent.length = 0;
    const edited = await w.promos.updateFlashSale(sale.id, { flashPrice: 4, title: 'Mega flash' });
    expect(edited).toMatchObject({ flashPrice: 4, title: 'Mega flash' });
    expect(w.emitter.sent.find((e) => e.event === 'product:updated')?.payload.price).toBe(4);
    await expect(w.promos.updateFlashSale(sale.id, { flashPrice: 10 })).rejects.toThrow('below the normal price');
    await expect(w.promos.updateFlashSale(sale.id, { startsAt: iso(5 * H), endsAt: iso(H) })).rejects.toThrow('after its start');
    w.emitter.sent.length = 0;
    await w.promos.deleteFlashSale(sale.id);
    expect(w.emitter.sent.find((e) => e.event === 'flashsale:removed')?.payload).toEqual({ id: sale.id, productId: p.id });
    expect((await w.products.get(p.id))?.price).toBe(10);
    await expect(w.promos.deleteFlashSale(sale.id)).rejects.toThrow('not found');
  });

  it('shoppers list only the running sales; `upcoming` adds the scheduled ones; `all` everything', async () => {
    const a = await w.product(shop, { name: 'A', price: 10 });
    const b = await w.product(shop, { name: 'B', price: 10 });
    const c = await w.product(shop, { name: 'C', price: 10 });
    await create(a.id);
    await create(b.id, { startsAt: iso(2 * H), endsAt: iso(5 * H) });
    const done = await create(c.id);
    await w.promos.endFlashSale(done.id);
    expect((await w.promos.listFlashSales(false)).map((s) => s.productName)).toEqual(['A']);
    expect((await w.promos.listFlashSales(false, { upcoming: true })).map((s) => s.productName).sort()).toEqual(['A', 'B']);
    expect(await w.promos.listFlashSales(true)).toHaveLength(3);
  });

  it('a flash price at or above the normal price is refused', async () => {
    const p = await w.product(shop, { price: 10 });
    await expect(create(p.id, { flashPrice: 10 })).rejects.toThrow('below the normal price ($10.00)');
    await expect(create(p.id, { startsAt: iso(H), endsAt: iso(-H) })).rejects.toThrow('after its start');
  });
});

describe('flash sale nomination by a seller', () => {
  const nominate = (productId: string, over: Record<string, unknown> = {}) => w.promos.nominate(shop, { productId, flashPrice: 6, endsAt: iso(5 * H), startsAt: iso(-H), title: 'Our flash', ...over });

  it('creates a pending nomination that changes no price and tells marketing', async () => {
    const p = await w.product(shop, { name: 'Phone case', price: 10 });
    const sale = await nominate(p.id);
    expect(sale).toMatchObject({ status: 'nominated', active: false, phase: 'ended', sellerId: shop.id, sellerName: 'Kinshasa Traders' });
    expect((await w.products.get(p.id))?.price).toBe(10);
    expect(w.notes.find((n) => n.title === 'Flash sale nominated')).toMatchObject({ to: 'role:admin_marketing', body: 'Kinshasa Traders proposes Phone case at $6.00.' });
    expect(await w.promos.listFlashSales(false)).toHaveLength(0); // shoppers never see it
    expect(await w.promos.listFlashSales(true)).toHaveLength(1);
  });

  it('needs no title: it is named after the product', async () => {
    const p = await w.product(shop, { name: 'Phone case', price: 10 });
    const sale = await w.promos.nominate(shop, { productId: p.id, flashPrice: 6, endsAt: iso(5 * H) });
    expect(sale).toMatchObject({ title: 'Phone case', status: 'nominated' });
  });

  it('only for the seller’s own live product, once at a time, with an end date', async () => {
    const mine = await w.product(shop, { price: 10 });
    const theirs = await w.product(other, { price: 10 });
    const pending = await w.product(shop, { price: 10 }, 'pending');
    await expect(nominate(theirs.id)).rejects.toThrow('only propose a flash sale on your own products');
    await expect(nominate(pending.id)).rejects.toThrow('live product');
    await expect(nominate(mine.id, { endsAt: undefined })).rejects.toThrow('date the flash sale ends');
    await nominate(mine.id);
    await expect(nominate(mine.id)).rejects.toThrow('already proposed');
  });

  it('approval turns it on and tells the seller; the prices flip live', async () => {
    const p = await w.product(shop, { name: 'Phone case', price: 10 });
    const sale = await nominate(p.id);
    w.emitter.sent.length = 0;
    const approved = await w.promos.decide(sale.id, true);
    expect(approved).toMatchObject({ status: 'approved', active: true, phase: 'running' });
    expect((await w.products.get(p.id))?.price).toBe(6);
    expect(w.notes.filter((n) => n.to === 'user:u-kt').map((n) => n.title)).toEqual(['Flash sale approved', 'Flash sale started']);
    expect(w.emitter.sent.find((e) => e.event === 'product:updated')?.payload.price).toBe(6);
    await expect(w.promos.decide(sale.id, true)).rejects.toThrow('not waiting for a decision');
  });

  it('a decline needs a reason, keeps the price, and tells the seller why', async () => {
    const p = await w.product(shop, { name: 'Phone case', price: 10 });
    const sale = await nominate(p.id);
    await expect(w.promos.decide(sale.id, false)).rejects.toThrow('reason');
    const declined = await w.promos.decide(sale.id, false, 'Too close to the normal price');
    expect(declined).toMatchObject({ status: 'declined', rejectReason: 'Too close to the normal price', active: false });
    expect((await w.products.get(p.id))?.price).toBe(10);
    expect(w.notes.find((n) => n.title === 'Flash sale declined')?.body).toBe('Your flash sale for Phone case was declined: Too close to the normal price');
  });

  it('cannot be approved after its end date; the seller sees their sales and nominations', async () => {
    const p = await w.product(shop, { price: 10 });
    const sale = await nominate(p.id, { startsAt: iso(-3 * H), endsAt: iso(H) });
    await w.ds.getRepository(FlashSale).update({ id: sale.id }, { endsAt: iso(-H) });
    await expect(w.promos.decide(sale.id, true)).rejects.toThrow('already passed');
    const mine = await w.promos.flashSalesOfStore([shop.id, 'u-kt']);
    expect(mine.map((s) => s.id)).toEqual([sale.id]);
    expect(await w.promos.flashSalesOfStore([other.id])).toHaveLength(0);
  });
});

describe('promos.validate: platform codes and store coupons', () => {
  const platform = (over: Partial<Promo> = {}) => w.ds.getRepository(Promo).save(w.ds.getRepository(Promo).create({ code: 'WELCOME', type: 'percent', value: 10, ...over }));
  const line = (productId: string, sellerId: string | null, priceUsd: number, qty = 1) => ({ productId, sellerId, priceUsd, qty });

  it('a platform code discounts the whole subtotal and never needs the lines', async () => {
    await platform();
    expect(await w.promos.validate('welcome', 100, 'c1')).toMatchObject({ ok: true, discount: 10, code: 'WELCOME' });
    expect((await w.promos.validate('welcome', 100, 'c1', [line('p', shop.id, 100)])).lineDiscounts).toBeUndefined();
  });

  it('a store coupon discounts only that store’s lines and says how each line shares it', async () => {
    await w.coupons.create('u-kt', { code: 'KT20', type: 'percent', value: 20 });
    const lines = [line('a', shop.id, 50, 2), line('b', other.id, 100), line('c', shop.id, 25)];
    const v = await w.promos.validate('kt20', 225, 'c1', lines);
    expect(v).toMatchObject({ ok: true, discount: 25, sellerId: shop.id, sellerName: 'Kinshasa Traders' });
    // A platform code belongs to no store.
    await w.ds.getRepository(Promo).save(w.ds.getRepository(Promo).create({ code: 'PLAT5', type: 'percent', value: 5 }));
    expect(await w.promos.validate('PLAT5', 100, 'c1')).not.toHaveProperty('sellerName');
    expect(v.lineDiscounts).toEqual([20, 0, 5]);
  });

  it('a fixed store coupon is capped at the store’s share of the cart', async () => {
    await w.coupons.create('u-kt', { code: 'KT50', type: 'fixed', value: 50 });
    const v = await w.promos.validate('KT50', 140, 'c1', [line('a', shop.id, 30), line('b', other.id, 110)]);
    expect(v).toMatchObject({ ok: true, discount: 30, lineDiscounts: [30, 0] });
  });

  it('its minimum order is measured on the store’s lines', async () => {
    await w.coupons.create('u-kt', { code: 'KTMIN', type: 'percent', value: 10, minOrder: 80 });
    const lines = [line('a', shop.id, 50), line('b', other.id, 500)];
    expect(await w.promos.validate('KTMIN', 550, 'c1', lines)).toMatchObject({ ok: false, reason: 'Minimum order $80.' });
    expect((await w.promos.validate('KTMIN', 600, 'c1', [line('a', shop.id, 90), line('b', other.id, 500)])).ok).toBe(true);
  });

  it('needs the lines, and a cart with none of the store’s products is refused with the store’s name', async () => {
    await w.coupons.create('u-kt', { code: 'KT20', type: 'percent', value: 20 });
    expect(await w.promos.validate('KT20', 100, 'c1')).toMatchObject({ ok: false, reason: expect.stringContaining('one store’s products') });
    expect(await w.promos.validate('KT20', 100, 'c1', [line('b', other.id, 100)])).toMatchObject({ ok: false, reason: 'This coupon only applies to products from Kinshasa Traders.' });
    expect(await w.promos.validate('KT20', 100, 'c1', [line('x', null, 100)])).toMatchObject({ ok: false });
  });

  it('honours the usage limits like any code', async () => {
    const coupon = await w.coupons.create('u-kt', { code: 'ONCE', type: 'percent', value: 10, perUserLimit: 1, maxUses: 1 });
    expect((await w.promos.validate('ONCE', 100, 'c1', [line('a', shop.id, 100)])).ok).toBe(true);
    await w.ds.getRepository(Order).save(w.ds.getRepository(Order).create({ reference: 'SOM-9', customerId: 'c1', customerName: 'C', status: 'confirmed', promoCode: 'ONCE' }));
    expect(await w.promos.validate('ONCE', 100, 'c1', [line('a', shop.id, 100)])).toMatchObject({ ok: false, reason: 'This code is no longer available.' });
    expect(coupon.code).toBe('ONCE');
  });

  it('switched off, expired: invalid', async () => {
    const c = await w.coupons.create('u-kt', { code: 'OFF1', type: 'percent', value: 10 });
    await w.coupons.setActive('u-kt', c.id, false);
    expect((await w.promos.validate('OFF1', 100, 'c1', [line('a', shop.id, 100)])).reason).toBe('Invalid code.');
    await w.ds.getRepository(Promo).update({ id: c.id }, { active: true, expiresAt: new Date(Date.now() - 1000) });
    expect((await w.promos.validate('OFF1', 100, 'c1', [line('a', shop.id, 100)])).reason).toBe('This code has expired.');
  });

  it('store coupons never show in the platform list and cannot be switched by the platform call', async () => {
    const c = await w.coupons.create('u-kt', { code: 'KT20', type: 'percent', value: 20 });
    await platform();
    expect((await w.promos.list(true)).map((p) => p.code)).toEqual(['WELCOME']);
    expect((await w.promos.list(false)).map((p) => p.code)).toEqual(['WELCOME']);
    expect(await w.promos.setActive(c.id, false)).toBeNull();
  });
});
