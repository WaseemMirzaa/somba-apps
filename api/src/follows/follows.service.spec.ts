import { DataSource } from 'typeorm';
import { Notification, Product, Seller, StoreFollow } from '../database/entities';
import { addProduct, recordingEmitter, testDb } from '../testing/test-db';
import { FollowsService, MAX_FOLLOWS } from './follows.service';

let ds: DataSource;
let emitter: ReturnType<typeof recordingEmitter>;
let svc: FollowsService;
let store: Seller;
let other: Seller;
let sent: { users: string[]; title: string; body: string; type?: string; entityId?: string; fr?: { title: string; body: string } }[];
let liveHooks: ((p: never) => Promise<void> | void)[];

const ana = { id: 'c1' };
const ben = { id: 'c2' };

beforeEach(async () => {
  ds = await testDb();
  emitter = recordingEmitter();
  sent = [];
  liveHooks = [];
  store = await ds.getRepository(Seller).save(ds.getRepository(Seller).create({ name: 'Kinshasa Traders', userId: 'su1', status: 'approved', logoUrl: 'http://x/logo.png' }));
  other = await ds.getRepository(Seller).save(ds.getRepository(Seller).create({ name: 'Goma Goods', userId: 'su2', status: 'approved' }));
  const notifications = {
    toUsers: async (users: string[], n: { title: string; body: string; type?: string; entityId?: string; fr?: { title: string; body: string } }) => {
      sent.push({ users: [...users], ...n });
      // What the real service does: one saved row per user (the once-per-product guard reads these).
      for (const u of users) await ds.getRepository(Notification).save(ds.getRepository(Notification).create({ userId: u, role: 'customer', title: n.title, body: n.body, type: n.type ?? 'system', entityId: n.entityId ?? null } as never));
    },
  };
  const products = { onWentLive: (fn: (typeof liveHooks)[number]) => void liveHooks.push(fn) };
  svc = new FollowsService(ds.getRepository(StoreFollow), ds.getRepository(Seller), ds.getRepository(Product), ds.getRepository(Notification), notifications as never, emitter as never, products as never);
  svc.onModuleInit();
});
afterEach(async () => ds.destroy());

describe('following a store', () => {
  it('follow, unfollow and flip; the state says whether I follow and how many do', async () => {
    expect(await svc.state(ana.id, store.id)).toEqual({ sellerId: store.id, following: false, followers: 0 });
    expect(await svc.toggle(ana, store.id)).toEqual({ sellerId: store.id, following: true, followers: 1 });
    expect(await svc.toggle(ben, store.id, true)).toMatchObject({ following: true, followers: 2 });
    expect(await svc.state(null, store.id)).toMatchObject({ following: false, followers: 2 }); // a guest sees the count only
    expect(await svc.toggle(ana, store.id)).toMatchObject({ following: false, followers: 1 });
    expect(await svc.toggle(ana, store.id, false)).toMatchObject({ following: false, followers: 1 }); // already off: no change
  });

  it('following twice keeps one row (the unique index backs the check)', async () => {
    await svc.toggle(ana, store.id, true);
    await svc.toggle(ana, store.id, true);
    expect(await ds.getRepository(StoreFollow).count()).toBe(1);
    await expect(ds.getRepository(StoreFollow).insert({ userId: ana.id, sellerId: store.id })).rejects.toThrow();
  });

  it('the owner’s account id works as a reference too (older listings carry it), and resolves to the store', async () => {
    expect(await svc.toggle(ana, 'su1')).toMatchObject({ sellerId: store.id, following: true });
  });

  it('refuses an unknown, pending or suspended store, your own store, and a blank reference', async () => {
    await expect(svc.toggle(ana, 'nope')).rejects.toThrow('Store not found.');
    await expect(svc.toggle(ana, '')).rejects.toThrow('Choose a store');
    const pending = await ds.getRepository(Seller).save(ds.getRepository(Seller).create({ name: 'New', userId: 'su3', status: 'pending' }));
    await expect(svc.toggle(ana, pending.id)).rejects.toThrow('Store not found.');
    await expect(svc.toggle({ id: 'su1' }, store.id)).rejects.toThrow('your own store');
    expect(await ds.getRepository(StoreFollow).count()).toBe(0);
  });

  it(`stops at ${MAX_FOLLOWS} stores per customer`, async () => {
    const repo = ds.getRepository(StoreFollow);
    await repo.insert(Array.from({ length: MAX_FOLLOWS }, (_, i) => ({ userId: ana.id, sellerId: `fake-${i}` })));
    await expect(svc.toggle(ana, store.id, true)).rejects.toThrow(`up to ${MAX_FOLLOWS} stores`);
    // Unfollowing is always allowed, and so is following when there is room again.
    await repo.delete({ userId: ana.id, sellerId: 'fake-0' });
    expect((await svc.toggle(ana, store.id, true)).following).toBe(true);
  });

  it('tells the customer’s other devices', async () => {
    await svc.toggle(ana, store.id);
    expect(emitter.sent.filter((e) => e.to === 'user:c1' && e.event === 'follows:updated')).toEqual([
      { to: 'user:c1', event: 'follows:updated', payload: { sellerId: store.id, following: true, followers: 1 } },
    ]);
  });
});

describe('the Following list', () => {
  it('lists my stores, newest follow first, with public fields only', async () => {
    await addProduct(ds, { sellerId: store.id });
    await addProduct(ds, { sellerId: store.id, status: 'pending' });
    await addProduct(ds, { sellerId: 'su1' }); // an older listing carrying the owner's account id
    await svc.toggle(ana, store.id);
    await new Promise((r) => setTimeout(r, 1100)); // createdAt has a one-second grain on SQLite
    await svc.toggle(ana, other.id);
    await svc.toggle(ben, store.id);
    const list = await svc.list(ana.id);
    expect(list.map((s) => s.name)).toEqual(['Goma Goods', 'Kinshasa Traders']);
    expect(list[1]).toMatchObject({ id: store.id, logoUrl: 'http://x/logo.png', productCount: 2 });
    expect(JSON.stringify(list)).not.toContain('su1'); // no owner account id, no address, no KYC
    expect(Object.keys(list[0]).sort()).toEqual(['badge', 'bannerUrl', 'followedAt', 'id', 'logoUrl', 'name', 'productCount', 'rating']);
    expect(await svc.list('nobody')).toEqual([]);
  });

  it('a store that is suspended drops out; it comes back when reinstated', async () => {
    await svc.toggle(ana, store.id);
    await ds.getRepository(Seller).update({ id: store.id }, { status: 'suspended' });
    expect(await svc.list(ana.id)).toEqual([]);
    await ds.getRepository(Seller).update({ id: store.id }, { status: 'approved' });
    expect(await svc.list(ana.id)).toHaveLength(1);
  });
});

describe('a new product from a followed store', () => {
  const live = (p: Product) => ({ id: p.id, name: p.name, nameFr: 'Téléphone', sellerId: p.sellerId });

  it('registers for the went-live hook and tells every follower once, in English and French, not the owner', async () => {
    expect(liveHooks).toHaveLength(1);
    await svc.toggle(ana, store.id);
    await svc.toggle(ben, store.id);
    await svc.toggle(ana, other.id);
    const p = await addProduct(ds, { name: 'Phone', sellerId: store.id });
    await liveHooks[0](live(p) as never);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: 'store',
      entityId: p.id,
      title: 'New from a store you follow',
      body: 'Kinshasa Traders: Phone',
      fr: { title: 'Nouveau chez une boutique que vous suivez', body: 'Kinshasa Traders : Téléphone' },
    });
    expect(sent[0].users.sort()).toEqual(['c1', 'c2']);
  });

  it('only once per product: approving it again after an edit does not notify twice', async () => {
    await svc.toggle(ana, store.id);
    const p = await addProduct(ds, { name: 'Phone', sellerId: store.id });
    expect(await svc.tellFollowers(live(p))).toBe(1);
    expect(await svc.tellFollowers(live(p))).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it('knows a listing by the owner’s account id, ignores stores with no followers, and unapproved stores', async () => {
    const p = await addProduct(ds, { name: 'Phone', sellerId: 'su1' });
    expect(await svc.tellFollowers(live(p))).toBe(0); // nobody follows yet
    await svc.toggle(ana, store.id);
    expect(await svc.tellFollowers(live(p))).toBe(1);
    const q = await addProduct(ds, { name: 'Case', sellerId: store.id });
    await ds.getRepository(Seller).update({ id: store.id }, { status: 'suspended' });
    expect(await svc.tellFollowers(live(q))).toBe(0);
    expect(await svc.tellFollowers({ id: 'x', name: 'x', nameFr: 'x', sellerId: null } as never)).toBe(0);
  });

  it('an unfollowed store stops telling me', async () => {
    await svc.toggle(ana, store.id);
    await svc.toggle(ana, store.id);
    expect(await svc.tellFollowers(live(await addProduct(ds, { sellerId: store.id })))).toBe(0);
  });

  it('a failing notice is logged, not thrown into the listing change', async () => {
    await svc.toggle(ana, store.id);
    (svc as unknown as { notifications: { toUsers: () => Promise<void> } }).notifications.toUsers = async () => {
      throw new Error('push is down');
    };
    await expect(svc.tellFollowers(live(await addProduct(ds, { sellerId: store.id })))).resolves.toBe(1);
  });
});
