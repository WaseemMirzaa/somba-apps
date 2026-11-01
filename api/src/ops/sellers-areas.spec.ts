import { DataSource } from 'typeorm';
import { ENTITIES, Hub, Seller } from '../database/entities';
import { geoWorld } from '../testing/geo-world';
import { addSeller } from '../testing/test-db';
import { SellersService } from './sellers.service';

/** A store's pickup area decides its origin warehouse; a store in an area nobody serves can prepare itself but not sell. */
describe('sellers and pickup areas', () => {
  let ds: DataSource;
  let w: Awaited<ReturnType<typeof geoWorld>>;
  let svc: SellersService;
  let hub: Hub;

  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true });
    await ds.initialize();
    w = await geoWorld(ds);
    const emitter = { toRoles: () => undefined, toUser: () => undefined };
    svc = new SellersService(
      ds.getRepository(Seller),
      ds.getRepository('Product') as never,
      ds.getRepository('Order') as never,
      ds.getRepository('OrderItem') as never,
      ds.getRepository('Payout') as never,
      { toUser: async () => undefined, toRole: async () => undefined } as never,
      emitter as never,
      { registerPlanSettledHandler: () => undefined } as never,
      { get: async () => null } as never,
      { publishUpdated: async () => undefined, list: async () => [] } as never,
      undefined,
      w.geo,
    );
    hub = await ds.getRepository(Hub).save(ds.getRepository(Hub).create({ name: 'Entrepôt Kinshasa', city: 'Kinshasa', active: true }));
    await w.coverage.assign({ hubId: hub.id, areaIds: [(await w.area('CD-KN')).id] });
  });
  afterEach(async () => ds.destroy());

  it('takes the pickup area from the pin and sets the origin warehouse that covers it', async () => {
    await addSeller(ds, { userId: 'u1', name: 'Shop' });
    const out = await svc.updateProfile('u1', { pickupAddress: '14 Avenue du Commerce, Gombe', pickupLat: -4.3031, pickupLng: 15.3033 });
    expect(out).toMatchObject({ originHubId: hub.id, originHubName: 'Entrepôt Kinshasa', pickupServed: true });
    expect(out.pickupAreaChain.map((a) => a.code)).toEqual(['CD', 'CD-KN', 'CD-KN-KIN', 'CD-KN-D-LUK', 'CD-KN-GOM']);
    expect((await ds.getRepository(Seller).findOneOrFail({ where: { userId: 'u1' } })).pickupAreaId).toBe((await w.area('CD-KN-GOM')).id);
  });

  it('an explicit pickup area wins over the pin, and null clears it', async () => {
    await addSeller(ds, { userId: 'u1', name: 'Shop' });
    const lmt = await w.area('CD-KN-LMT');
    const out = await svc.updateProfile('u1', { pickupAreaId: lmt.id, pickupLat: -4.3031, pickupLng: 15.3033 });
    expect(out.pickupAreaChain[out.pickupAreaChain.length - 1].code).toBe('CD-KN-LMT');
    const cleared = await svc.updateProfile('u1', { pickupAreaId: null });
    expect(cleared).toMatchObject({ pickupAreaId: null, pickupAreaChain: [], pickupServed: false, originHubId: null });
    await expect(svc.updateProfile('u1', { pickupAreaId: 'nope' })).rejects.toThrow('Area not found.');
  });

  it('a store in an area nobody serves can be set up but cannot list products, with the contract message', async () => {
    const seller = await addSeller(ds, { userId: 'u1', name: 'Shop' });
    const out = await svc.updateProfile('u1', { pickupAreaId: (await w.area('CD-HK-LUB')).id });
    expect(out).toMatchObject({ pickupServed: false, originHubId: null });
    await expect(svc.assertPickupServed(await ds.getRepository(Seller).findOneOrFail({ where: { id: seller.id } }))).rejects.toThrow(
      'Your pickup area is not served yet. You can prepare your store; sales open when we deliver there.',
    );
    // a store with no area at all is not blocked here (the pin switch decides)
    await svc.updateProfile('u1', { pickupAreaId: null });
    await expect(svc.assertPickupServed({ pickupAreaId: null })).resolves.toBeUndefined();
    // opening a warehouse there lifts the block
    const lub = await ds.getRepository(Hub).save(ds.getRepository(Hub).create({ name: 'Entrepôt Lubumbashi', city: 'Lubumbashi', active: true }));
    await w.coverage.assign({ hubId: lub.id, areaIds: [(await w.area('CD-HK-LUB')).id] });
    await svc.updateProfile('u1', { pickupAreaId: (await w.area('CD-HK-LUB')).id });
    await expect(svc.assertPickupServed(await ds.getRepository(Seller).findOneOrFail({ where: { id: seller.id } }))).resolves.toBeUndefined();
  });

  it('keeps the area out of the public storefront', async () => {
    const seller = await addSeller(ds, { userId: 'u1', name: 'Shop' });
    await svc.updateProfile('u1', { pickupAreaId: (await w.area('CD-KN-GOM')).id });
    const sf = await svc.storefront(seller.id);
    expect(sf?.seller).toBeTruthy();
    for (const k of ['pickupAreaId', 'pickupAreaChain', 'pickupServed', 'originHubId', 'originHubName', 'pickupAddress']) expect(sf?.seller).not.toHaveProperty(k);
  });
});
