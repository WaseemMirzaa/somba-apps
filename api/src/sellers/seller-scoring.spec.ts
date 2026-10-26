import { DataSource, DeepPartial } from 'typeorm';
import { Order, OrderItem, Product, Review, Seller } from '../database/entities';
import { addProduct, addSeller, recordingEmitter, testDb } from '../testing/test-db';
import { BADGE_RULES, MIN_SETTLED_LINES, averageRating, badgeFor, fulfilmentRateOf } from './seller-scoring';
import { SellerScoringService } from './seller-scoring.service';

describe('rating and badge rules', () => {
  it('averages ratings to one decimal; nobody reviewed = 0', () => {
    expect(averageRating([])).toBe(0);
    expect(averageRating([5, 4])).toBe(4.5);
    expect(averageRating([5, 5, 4])).toBe(4.7);
    expect(averageRating([1, 2, 2])).toBe(1.7);
  });

  it('the fulfilment rate needs enough settled lines to mean anything', () => {
    expect(fulfilmentRateOf(MIN_SETTLED_LINES - 1, 0)).toBeNull();
    expect(fulfilmentRateOf(10, 0)).toBe(1);
    expect(fulfilmentRateOf(10, 1)).toBe(0.9);
    expect(fulfilmentRateOf(8, 3)).toBe(0.625);
  });

  describe('badgeFor', () => {
    const g = BADGE_RULES.gold;
    const s = BADGE_RULES.silver;
    it('gold needs many good reviews AND a proven delivery record', () => {
      expect(badgeFor({ rating: g.minRating, ratingCount: g.minReviews, fulfilmentRate: g.minFulfilment }, 'bronze')).toBe('gold');
      expect(badgeFor({ rating: 4.9, ratingCount: 200, fulfilmentRate: null }, 'bronze')).toBe('silver');
      expect(badgeFor({ rating: 4.9, ratingCount: 200, fulfilmentRate: 0.8 }, 'gold')).toBe('bronze');
      expect(badgeFor({ rating: 4.4, ratingCount: 200, fulfilmentRate: 1 }, 'gold')).toBe('silver');
      expect(badgeFor({ rating: 4.9, ratingCount: g.minReviews - 1, fulfilmentRate: 1 }, 'bronze')).toBe('silver');
    });
    it('silver needs a few good reviews and no bad record', () => {
      expect(badgeFor({ rating: s.minRating, ratingCount: s.minReviews, fulfilmentRate: null }, 'bronze')).toBe('silver');
      expect(badgeFor({ rating: s.minRating, ratingCount: s.minReviews, fulfilmentRate: s.minFulfilment }, 'bronze')).toBe('silver');
      expect(badgeFor({ rating: s.minRating, ratingCount: s.minReviews, fulfilmentRate: s.minFulfilment - 0.01 }, 'bronze')).toBe('bronze');
      expect(badgeFor({ rating: 3.9, ratingCount: 50, fulfilmentRate: 1 }, 'silver')).toBe('bronze');
      expect(badgeFor({ rating: 5, ratingCount: s.minReviews - 1, fulfilmentRate: 1 }, 'bronze')).toBe('bronze');
    });
    it('a new store with nothing is bronze', () => {
      expect(badgeFor({ rating: 0, ratingCount: 0, fulfilmentRate: null }, 'bronze')).toBe('bronze');
    });
    it('Somba Assured is granted by hand and never touched', () => {
      expect(badgeFor({ rating: 1, ratingCount: 0, fulfilmentRate: 0 }, 'somba_assured')).toBe('somba_assured');
    });
  });
});

describe('SellerScoringService', () => {
  let ds: DataSource;
  let emitter: ReturnType<typeof recordingEmitter>;
  let notices: { to: string; title: string; body: string }[];
  let svc: SellerScoringService;
  beforeEach(async () => {
    ds = await testDb();
    emitter = recordingEmitter();
    notices = [];
    svc = new SellerScoringService(
      ds.getRepository(Seller),
      ds.getRepository(Review),
      ds.getRepository(OrderItem),
      ds.getRepository(Product),
      emitter as never,
      { toUser: async (to: string, n: { title: string; body: string }) => void notices.push({ to, ...n }) } as never,
      { withPlanState: async (s: Seller) => ({ id: s.id, rating: s.rating, badge: s.badge }) } as never,
    );
  });
  afterEach(() => ds.destroy());

  async function review(productId: string, rating: number, status: 'visible' | 'hidden' = 'visible') {
    const r = ds.getRepository(Review);
    return r.save(r.create({ productId, userId: 'u', author: 'a', rating, text: 'ok', status }));
  }
  async function line(sellerId: string, productId: string, fulfilment: OrderItem['fulfilment'], orderStatus: Order['status']) {
    const orders = ds.getRepository(Order);
    const o = await orders.save(orders.create({ reference: `R${Math.random().toString(36).slice(2, 8)}`, customerId: 'c', customerName: 'c', status: orderStatus, paymentMethod: 'cod', subtotalUsd: 1, totalUsd: 1 } as DeepPartial<Order>));
    const items = ds.getRepository(OrderItem);
    return items.save(items.create({ orderId: o.id, productId, productName: 'P', qty: 1, priceUsd: 1, sellerId, fulfilment } as DeepPartial<OrderItem>));
  }

  it('rates a store from the VISIBLE reviews of its products only', async () => {
    const s = await addSeller(ds, { userId: 'o1' });
    const other = await addSeller(ds, { userId: 'o2' });
    const p = await addProduct(ds, { sellerId: s.id });
    const q = await addProduct(ds, { sellerId: s.userId! }); // older data keyed by the owner id
    const po = await addProduct(ds, { sellerId: other.id });
    await review(p.id, 5);
    await review(q.id, 4);
    await review(p.id, 1, 'hidden');
    await review(po.id, 1);
    const scores = await svc.scoresOf(s);
    expect(scores).toMatchObject({ rating: 4.5, ratingCount: 2, fulfilmentRate: null });
  });

  it('measures fulfilment from settled lines: delivered vs cancelled by the seller', async () => {
    const s = await addSeller(ds, { userId: 'o1' });
    const p = await addProduct(ds, { sellerId: s.id });
    for (let i = 0; i < 8; i++) await line(s.id, p.id, 'received', 'delivered');
    await line(s.id, p.id, 'cancelled', 'confirmed');
    await line(s.id, p.id, 'cancelled', 'processing');
    await line(s.id, p.id, 'open', 'confirmed'); // still in flight: not settled
    await line('someone-else', p.id, 'cancelled', 'confirmed');
    const scores = await svc.scoresOf(s);
    expect(scores.fulfilmentRate).toBe(0.8);
  });

  it('recompute saves rating, count, rate and badge, tells owner and admins, and notices a badge change', async () => {
    const s = await addSeller(ds, { userId: 'o1' });
    const p = await addProduct(ds, { sellerId: s.id });
    for (let i = 0; i < 5; i++) await review(p.id, 5);
    const saved = await svc.recompute(s);
    expect(saved).toMatchObject({ rating: 5, ratingCount: 5, badge: 'silver' });
    expect(saved.scoreUpdatedAt).toBeInstanceOf(Date);
    expect(emitter.sent.some((e) => e.to === 'user:o1' && e.event === 'seller:updated')).toBe(true);
    expect(emitter.sent.some((e) => e.event === 'seller:updated' && e.to.includes('admin'))).toBe(true);
    expect(notices).toMatchObject([{ to: 'o1', title: 'Seller badge updated', body: 'Your store badge is now silver (was bronze).' }]);
    // nothing changed: nothing announced
    emitter.sent.length = 0;
    notices.length = 0;
    await svc.recompute(await ds.getRepository(Seller).findOneByOrFail({ id: s.id }));
    expect(emitter.sent).toHaveLength(0);
    expect(notices).toHaveLength(0);
  });

  it('a hidden review stops counting and the badge drops back', async () => {
    const s = await addSeller(ds, { userId: 'o1' });
    const p = await addProduct(ds, { sellerId: s.id });
    const rs: Review[] = [];
    for (let i = 0; i < 5; i++) rs.push(await review(p.id, 5));
    await svc.recompute(s);
    await ds.getRepository(Review).update({ id: rs[0].id }, { status: 'hidden' });
    const after = await svc.recompute(await ds.getRepository(Seller).findOneByOrFail({ id: s.id }));
    expect(after).toMatchObject({ ratingCount: 4, badge: 'bronze' });
  });

  it('leaves a store with no evidence alone (a demo store keeps its curated rating and badge)', async () => {
    const s = await addSeller(ds, { userId: 'o1', rating: 4.6, badge: 'silver' });
    const out = await svc.recompute(s);
    expect(out).toMatchObject({ rating: 4.6, badge: 'silver', scoreUpdatedAt: null });
    expect(notices).toHaveLength(0);
    expect(emitter.sent).toHaveLength(0);
  });

  it('once scored, a store follows the data even when it drops back to nothing', async () => {
    const s = await addSeller(ds, { userId: 'o1' });
    const p = await addProduct(ds, { sellerId: s.id });
    const r = await review(p.id, 5);
    await svc.recompute(s);
    await ds.getRepository(Review).update({ id: r.id }, { status: 'hidden' });
    const out = await svc.recompute(await ds.getRepository(Seller).findOneByOrFail({ id: s.id }));
    expect(out).toMatchObject({ rating: 0, ratingCount: 0 });
  });

  it('keeps Somba Assured and skips rejected stores in the sweep', async () => {
    const assured = await addSeller(ds, { userId: 'o1', badge: 'somba_assured' });
    const rejected = await addSeller(ds, { userId: 'o2', status: 'rejected' });
    const normal = await addSeller(ds, { userId: 'o3' });
    await review((await addProduct(ds, { sellerId: normal.id })).id, 4);
    expect(await svc.recomputeAll()).toBe(2);
    expect((await ds.getRepository(Seller).findOneByOrFail({ id: assured.id })).badge).toBe('somba_assured');
    expect((await ds.getRepository(Seller).findOneByOrFail({ id: rejected.id })).scoreUpdatedAt).toBeNull();
    expect((await ds.getRepository(Seller).findOneByOrFail({ id: normal.id })).scoreUpdatedAt).not.toBeNull();
  });
});
