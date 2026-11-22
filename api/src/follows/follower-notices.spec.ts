import type { Seller } from '../database/entities';
import { Campaign, FlashSale } from '../database/entities';
import { commerceWorld } from '../testing/commerce-db';
import type { World } from '../testing/commerce-db';

/**
 * Where followers are told: every path that makes a store's deal or promotion live (created live, approved, started by a
 * sweep, edited live) calls `FollowsService.notifyFollowers` once; paths that do not make it live call nothing. The fan-out,
 * dedupe and French of the notice itself are in follows.service.spec.ts.
 */
let w: World;
let shop: Seller;
let told: Record<string, unknown>[];
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

beforeEach(async () => {
  w = await commerceWorld();
  shop = await w.store('Kinshasa Traders', 'u-kt');
  told = [];
  const follows = { notifyFollowers: jest.fn(async (n: Record<string, unknown>) => void told.push(n)) };
  for (const svc of [w.promos, w.coupons, w.campaigns]) (svc as unknown as { follows: unknown }).follows = follows;
});
afterEach(async () => w.ds.destroy());

describe('store coupons', () => {
  const mk = (over: Record<string, unknown> = {}) => w.coupons.create('u-kt', { code: 'SPRING10', type: 'percent', value: 10, ...over });

  it('a public active coupon tells followers, in both languages; a private one does not', async () => {
    await mk({ isPublic: false, code: 'PRIVATE1' });
    expect(told).toEqual([]);
    const c = await mk();
    expect(told).toEqual([{ storeRef: shop.id, kind: 'promotion', type: 'promo', sourceId: c.id, body: 'Code SPRING10: 10% off', bodyFr: 'Code SPRING10 : 10 % de réduction' }]);
    const f = await mk({ code: 'FIVE', type: 'fixed', value: 5.5 });
    expect(told[1]).toMatchObject({ sourceId: f.id, body: 'Code FIVE: $5.50 off', bodyFr: 'Code FIVE : 5,50 $ de réduction' });
  });

  it('an inactive or expired coupon does not; switching a private one public does', async () => {
    const off = await mk({ active: false });
    expect(told).toEqual([]);
    await w.coupons.setActive('u-kt', off.id, true);
    expect(told).toHaveLength(1);
    const priv = await mk({ code: 'LATER', isPublic: false });
    await w.coupons.update('u-kt', priv.id, { isPublic: true });
    expect(told).toHaveLength(2);
    const soon = await mk({ code: 'SOON', expiresAt: new Date(Date.now() + 1000).toISOString() });
    expect(told).toHaveLength(3);
    // a coupon that expired meanwhile is no promotion any more
    await w.ds.getRepository('Promo').update({ id: soon.id }, { expiresAt: new Date(Date.now() - 1000) } as never);
    await w.coupons.update('u-kt', soon.id, { description: 'edited' });
    expect(told).toHaveLength(3);
  });
});

describe('seller campaigns', () => {
  const user = { id: 'u-kt', name: 'KT', role: 'seller' };
  const make = (over: Record<string, unknown> = {}) => w.campaigns.create(user, { name: 'Spring Sale', discount: 20, ...over });

  it('tells followers when it goes live: approved with its start reached; not when pending, rejected or only scheduled', async () => {
    const live = await make({ startDate: day(-1), endDate: day(10) });
    expect(told).toEqual([]);
    await w.campaigns.setStatus(live.id, 'active');
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ storeRef: shop.id, kind: 'promotion', type: 'campaign', sourceId: live.id, body: 'Spring Sale: 20% off' });
    expect(told[0].bodyFr).toBe('Spring Sale : 20 % de réduction');
    const later = await make({ startDate: day(3), endDate: day(10) });
    await w.campaigns.setStatus(later.id, 'active'); // approved as scheduled
    const no = await make();
    await expect(w.campaigns.setStatus(no.id, 'rejected', 'Too deep a discount')).resolves.toBeDefined();
    expect(told).toHaveLength(1);
  });

  it('a scheduled campaign tells them once, when the sweep starts it', async () => {
    const c = await make({ startDate: day(3), endDate: day(10) });
    await w.campaigns.setStatus(c.id, 'active');
    expect(await w.campaigns.sweep(Date.now())).toBe(0);
    expect(told).toHaveLength(0);
    await w.ds.getRepository(Campaign).update({ id: c.id }, { startDate: day(-1) });
    expect(await w.campaigns.sweep()).toBe(1);
    expect(told).toHaveLength(1);
    expect(await w.campaigns.sweep()).toBe(0); // nothing moves again
    expect(told).toHaveLength(1);
  });
});

describe('flash sales (deals)', () => {
  const sale = async (over: Record<string, unknown> = {}, price = 40) => {
    const p = await w.product(shop, { name: 'Lamp', price });
    return { p, fs: await w.promos.createFlashSale({ productId: p.id, title: 'Lamp deal', flashPrice: 25, startsAt: hours(-1), endsAt: hours(5), ...over }) };
  };

  it('a sale created running tells followers once, with both prices in both languages', async () => {
    const { fs } = await sale();
    expect(told).toEqual([
      { storeRef: shop.id, kind: 'deal', type: 'flash', sourceId: fs.id, body: 'Lamp: $25.00 instead of $40.00', bodyFr: expect.stringMatching(/^.+ : 25,00 \$ au lieu de 40,00 \$$/) },
    ]);
  });

  it('a scheduled sale tells nobody until the sweep starts it, and not again on later sweeps', async () => {
    const { fs } = await sale({ startsAt: hours(1), endsAt: hours(5) });
    expect(told).toHaveLength(0);
    expect(await w.promos.sweepFlash(Date.now() + 2 * 3_600_000)).toBe(1);
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ sourceId: fs.id, type: 'flash' });
    expect(await w.promos.sweepFlash(Date.now() + 2 * 3_600_000)).toBe(0);
    expect(told).toHaveLength(1);
  });

  it('a sweep that runs long after the start (the API was down) does not announce an old deal', async () => {
    await sale({ startsAt: hours(1), endsAt: hours(100) });
    await w.promos.sweepFlash(Date.now() + 48 * 3_600_000);
    expect(told).toHaveLength(0);
  });

  it('a nomination tells nobody; approving it, once live, does', async () => {
    const p = await w.product(shop, { name: 'Fan', price: 20 });
    const nom = await w.promos.nominate(shop, { productId: p.id, flashPrice: 12, endsAt: hours(5) });
    expect(told).toHaveLength(0);
    await w.promos.decide(nom.id, true);
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ sourceId: nom.id, kind: 'deal' });
  });

  it('an edit that moves a scheduled sale live tells followers; an edit of a running one does not', async () => {
    const { fs } = await sale({ startsAt: hours(2), endsAt: hours(5) });
    expect(told).toHaveLength(0);
    await w.promos.updateFlashSale(fs.id, { startsAt: hours(-1) });
    expect(told).toHaveLength(1);
    await w.promos.updateFlashSale(fs.id, { flashPrice: 24 });
    expect(told).toHaveLength(1);
  });

  it('a sale on a product that is not live, or one that is switched off, tells nobody', async () => {
    const pending = await w.product(shop, { name: 'Draft', price: 30 }, 'pending');
    await w.promos.createFlashSale({ productId: pending.id, title: 'x', flashPrice: 20, startsAt: hours(-1), endsAt: hours(5) });
    const { fs } = await sale({ active: false });
    expect(told).toHaveLength(0);
    expect(await w.ds.getRepository(FlashSale).count()).toBe(2);
    void fs;
  });
});
