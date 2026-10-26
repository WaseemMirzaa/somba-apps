import { Order, Promo } from '../database/entities';
import type { Seller } from '../database/entities';
import { MAX_COUPONS_PER_STORE } from './coupons.service';
import { commerceWorld } from '../testing/commerce-db';
import type { World } from '../testing/commerce-db';

let w: World;
let shop: Seller;
beforeEach(async () => {
  w = await commerceWorld();
  shop = await w.store('Kinshasa Traders', 'u-kt');
});
afterEach(async () => w.ds.destroy());

const create = (over: Record<string, unknown> = {}) => w.coupons.create('u-kt', { code: 'spring10', type: 'percent', value: 10, ...over });

describe('store coupons', () => {
  it('creates a coupon owned by the store, upper-cases the code, and tells the owner and admins', async () => {
    w.emitter.sent.length = 0;
    const c = await create({ description: '10% off' });
    expect(c).toMatchObject({ code: 'SPRING10', sellerId: shop.id, active: true, uses: 0, isPublic: true });
    expect(w.emitter.sent.map((e) => e.event)).toEqual(['coupon:updated', 'coupon:updated']);
  });

  it('refuses a duplicate code (platform or store), bad values, and a store that is not approved', async () => {
    await create();
    await expect(create()).rejects.toThrow('already exists');
    await w.ds.getRepository(Promo).save(w.ds.getRepository(Promo).create({ code: 'PLATFORM', type: 'percent', value: 5 }));
    await expect(create({ code: 'platform' })).rejects.toThrow('already exists');
    await expect(create({ code: 'a', value: 5 })).rejects.toThrow('Code');
    await expect(create({ code: 'bad code!' })).rejects.toThrow('letters, numbers');
    await expect(create({ code: 'BIG', value: 95 })).rejects.toThrow('Discount');
    await expect(create({ code: 'BIGFIX', type: 'fixed', value: 900 })).rejects.toThrow('Discount');
    await expect(create({ code: 'PAST', expiresAt: '2020-01-01' })).rejects.toThrow('in the future');
    const pending = await w.store('New Shop', 'u-new', { status: 'pending' });
    await expect(w.coupons.create('u-new', { code: 'NEW1', type: 'percent', value: 5 })).rejects.toThrow('must be approved');
    void pending;
    await expect(w.coupons.create('nobody', { code: 'NOPE', type: 'percent', value: 5 })).rejects.toThrow('Open a store first');
  });

  it(`holds at most ${MAX_COUPONS_PER_STORE} coupons`, async () => {
    for (let i = 0; i < MAX_COUPONS_PER_STORE; i++) await create({ code: `CODE${i}` });
    await expect(create({ code: 'ONEMORE' })).rejects.toThrow(`${MAX_COUPONS_PER_STORE} coupons`);
  });

  it('lists a seller’s own coupons with their use count; marketing lists every store’s', async () => {
    const mine = await create();
    const other = await w.store('Other Shop', 'u-other');
    await w.coupons.create('u-other', { code: 'OTHER5', type: 'fixed', value: 5 });
    await w.ds.getRepository(Order).save(w.ds.getRepository(Order).create({ reference: 'SOM-1', customerId: 'c', customerName: 'C', status: 'confirmed', promoCode: 'SPRING10' }));
    await w.ds.getRepository(Order).save(w.ds.getRepository(Order).create({ reference: 'SOM-2', customerId: 'c', customerName: 'C', status: 'cancelled', promoCode: 'SPRING10' }));
    const own = await w.coupons.list({ id: 'u-kt', role: 'seller' });
    expect(own.map((c) => [c.code, c.uses])).toEqual([['SPRING10', 1]]); // the cancelled order does not count
    const all = await w.coupons.list({ id: 'a', role: 'admin_marketing' });
    expect(all.map((c) => c.code).sort()).toEqual(['OTHER5', 'SPRING10']);
    expect((await w.coupons.list({ id: 'a', role: 'admin' }, other.id)).map((c) => c.code)).toEqual(['OTHER5']);
    expect(mine.id).toBeDefined();
  });

  it('the owner updates limits and visibility, but not the code or the kind; others get "not found"', async () => {
    const c = await create();
    const u = await w.coupons.update('u-kt', c.id, { value: 15, minOrder: 20, maxUses: 100, perUserLimit: 2, isPublic: false, code: 'HACK', type: 'fixed' });
    expect(u).toMatchObject({ code: 'SPRING10', type: 'percent', value: 15, minOrder: 20, maxUses: 100, perUserLimit: 2, isPublic: false });
    await expect(w.coupons.update('u-kt', c.id, { value: 99 })).rejects.toThrow('Discount');
    await w.store('Other Shop', 'u-other');
    await expect(w.coupons.update('u-other', c.id, { value: 5 })).rejects.toThrow('Coupon not found');
    await expect(w.coupons.setActive('u-other', c.id, false)).rejects.toThrow('Coupon not found');
  });

  it('deletes an unused coupon, but only switches off one that already discounted an order', async () => {
    const a = await create({ code: 'UNUSED' });
    const b = await create({ code: 'USED' });
    await w.ds.getRepository(Order).save(w.ds.getRepository(Order).create({ reference: 'SOM-3', customerId: 'c', customerName: 'C', status: 'delivered', promoCode: 'USED' }));
    expect(await w.coupons.remove('u-kt', a.id)).toEqual({ id: a.id, deleted: true });
    expect(await w.ds.getRepository(Promo).findOneBy({ id: a.id })).toBeNull();
    const r = await w.coupons.remove('u-kt', b.id);
    expect(r).toMatchObject({ id: b.id, deleted: false, coupon: { active: false, code: 'USED' } });
    expect(await w.ds.getRepository(Promo).findOneBy({ id: b.id })).not.toBeNull();
  });

  it('shows shoppers only a store’s active, public, unexpired coupons, and nothing for a store that is not approved', async () => {
    await create({ code: 'SHOWN', description: 'Welcome' });
    await create({ code: 'HIDDEN', isPublic: false });
    const off = await create({ code: 'OFF' });
    await w.coupons.setActive('u-kt', off.id, false);
    const exp = await create({ code: 'EXPIRED' });
    await w.ds.getRepository(Promo).update({ id: exp.id }, { expiresAt: new Date(Date.now() - 1000) });
    const shown = await w.coupons.publicOf(shop.id);
    expect(shown).toEqual([{ code: 'SHOWN', type: 'percent', value: 10, minOrder: 0, description: 'Welcome', sellerId: shop.id }]);
    expect(await w.coupons.publicOf('u-kt')).toHaveLength(1); // the owner's user id works too
    await w.ds.getRepository('Seller').update({ id: shop.id }, { status: 'suspended' });
    expect(await w.coupons.publicOf(shop.id)).toEqual([]);
  });
});

describe('coupon use counts reach the seller (throttled)', () => {
  const orderWith = (reference: string, promoCode: string, status: 'confirmed' | 'cancelled' = 'confirmed') =>
    w.ds.getRepository(Order).save(w.ds.getRepository(Order).create({ reference, customerId: 'c', customerName: 'C', status, promoCode }));
  const pushes = (code: string) => w.emitter.sent.filter((e) => e.event === 'coupon:updated' && e.to === 'user:u-kt' && (e.payload as { code: string }).code === code);

  it('an order that used the code makes ONE push with the new count, however many orders came in', async () => {
    await create({ code: 'BURST' });
    w.emitter.sent.length = 0;
    for (let i = 0; i < 4; i++) {
      await orderWith(`SOM-B${i}`, 'BURST');
      w.coupons.usageChanged('BURST');
    }
    expect(pushes('BURST')).toHaveLength(0); // held back by the throttle
    await w.coupons.flushUsagePushes();
    expect(pushes('BURST')).toHaveLength(1);
    expect(pushes('BURST')[0].payload).toMatchObject({ code: 'BURST', uses: 4, sellerId: shop.id });
    // The admins hear the same change; nothing is left pending afterwards.
    expect(w.emitter.sent.some((e) => e.event === 'coupon:updated' && e.to.includes('admin'))).toBe(true);
    w.emitter.sent.length = 0;
    await w.coupons.flushUsagePushes();
    expect(w.emitter.sent).toHaveLength(0);
  });

  it('a cancelled order brings the count back down', async () => {
    await create({ code: 'BACK' });
    const o = await orderWith('SOM-C1', 'BACK');
    await orderWith('SOM-C2', 'BACK');
    w.coupons.usageChanged('BACK');
    await w.coupons.flushUsagePushes();
    expect(pushes('BACK').pop()?.payload).toMatchObject({ uses: 2 });
    await w.ds.getRepository(Order).update({ id: o.id }, { status: 'cancelled' });
    w.coupons.usageChanged('BACK');
    await w.coupons.flushUsagePushes();
    expect(pushes('BACK').pop()?.payload).toMatchObject({ uses: 1 });
  });

  it('platform promo codes, unknown codes and blanks send nothing to anyone', async () => {
    await w.ds.getRepository(Promo).save(w.ds.getRepository(Promo).create({ code: 'PLATFORM', type: 'percent', value: 5 }));
    w.emitter.sent.length = 0;
    for (const code of ['PLATFORM', 'NOPE', '', null, undefined]) w.coupons.usageChanged(code);
    await w.coupons.flushUsagePushes();
    expect(w.emitter.sent).toHaveLength(0);
  });

  it('with the throttle off (COUPON_USAGE_PUSH_MS=0) the push goes out at once', async () => {
    process.env.COUPON_USAGE_PUSH_MS = '0';
    try {
      await create({ code: 'NOW' });
      await orderWith('SOM-N1', 'NOW');
      w.emitter.sent.length = 0;
      w.coupons.usageChanged('NOW');
      await new Promise((r) => setTimeout(r, 100));
      expect(pushes('NOW')).toHaveLength(1);
    } finally {
      delete process.env.COUPON_USAGE_PUSH_MS;
    }
  });
});
