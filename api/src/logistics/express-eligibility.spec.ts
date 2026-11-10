import { DataSource } from 'typeorm';
import { ENTITIES, Hub, Seller, User } from '../database/entities';
import { haversineKm } from '../common/geo/geo';
import { geoWorld } from '../testing/geo-world';
import { RoutingService } from './routing.service';
import { estimateOrder } from './order-estimate';
import { localDay } from '../common/delivery/estimate';

/**
 * The express eligibility matrix (the owner's rule: same commune + the seller switched express on => a rider goes straight from the
 * seller to the customer). Every exclusion falls back to a STANDARD route, and nothing about the standard route changes.
 */
describe('express eligibility (routing)', () => {
  let ds: DataSource;
  let routing: RoutingService;
  let world: Awaited<ReturnType<typeof geoWorld>>;
  let setting: Record<string, string>;
  let gombe: Hub;
  let limete: Hub;
  let seller: Seller;
  let seq = 0;

  const SELLER_PIN = { lat: -4.3152, lng: 15.3098 }; // Gombe
  const CUSTOMER_PIN = { lat: -4.3086, lng: 15.3171 }; // Gombe, about 1 km away
  const KM = haversineKm(SELLER_PIN, CUSTOMER_PIN);

  const mkHub = async (name: string, lat: number, lng: number, areaCode: string, cover: string[]) => {
    const hub = await ds.getRepository(Hub).save(ds.getRepository(Hub).create({ name, city: 'Kinshasa', country: 'X', lat, lng, active: true, areaId: (await world.area(areaCode)).id }));
    await world.coverage.assign({ hubId: hub.id, areaIds: await Promise.all(cover.map(async (c) => (await world.area(c)).id)) });
    return hub;
  };
  const mkRider = (hubId: string) => {
    const n = ++seq;
    return ds.getRepository(User).save(ds.getRepository(User).create({ emailHash: `h${n}`, email: `r${n}@t.test`, passwordHash: 'x', name: `Rider ${n}`, role: 'rider', hubId }));
  };
  const mkSeller = async (name: string, over: Partial<Seller> = {}) =>
    ds.getRepository(Seller).save(
      ds.getRepository(Seller).create({
        name,
        status: 'approved',
        pickupAddress: `${name} street`,
        pickupLat: SELLER_PIN.lat,
        pickupLng: SELLER_PIN.lng,
        pickupAreaId: (await world.area('CD-KN-GOM')).id,
        expressDelivery: true,
        ...over,
      }),
    );
  const address = async (over: { commune?: string; areaCode?: string; pin?: { lat: number; lng: number } | null } = {}) =>
    JSON.stringify({
      line1: '1 Rue',
      city: 'Kinshasa',
      commune: over.commune ?? 'Gombe',
      areaId: (await world.area(over.areaCode ?? 'CD-KN-GOM')).id,
      ...((over.pin === undefined ? CUSTOMER_PIN : over.pin) ? { geo: over.pin === undefined ? CUSTOMER_PIN : over.pin } : {}),
    });

  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true });
    await ds.initialize();
    setting = { expressDeliveryEnabled: 'true' };
    const hubOps = { ops: async () => ({ workStart: '00:00', workEnd: '23:59', workDays: [1, 2, 3, 4, 5, 6, 7], timezone: 'Africa/Kinshasa' }) };
    world = await geoWorld(ds, { settings: () => ({ ...setting }), hubOps });
    routing = world.routing;
    gombe = await mkHub('Entrepôt Kinshasa', -4.3105, 15.3136, 'CD-KN-GOM', ['CD-KN']);
    limete = await mkHub('Entrepôt Limete', -4.354, 15.347, 'CD-KN-LMT', ['CD-KN-D-MAM', 'CD-KN-D-TSH']);
    await mkRider(gombe.id);
    await mkRider(limete.id);
    seller = await mkSeller('Express Shop');
  });
  afterEach(async () => ds.destroy());

  const quote = async (over: { sellers?: Seller[]; addr?: string } = {}) =>
    routing.route({ shippingAddress: over.addr ?? (await address()), sellerIds: (over.sellers ?? [seller]).map((s) => s.id) });

  it('qualifies: same commune, one seller with express on, both pins, same warehouse', async () => {
    const r = await quote();
    expect(r).toMatchObject({
      deliveryMode: 'express',
      destinationHubId: gombe.id,
      originHubIds: [gombe.id],
      originBySeller: { [seller.id]: gombe.id },
      routeBySeller: { [seller.id]: [gombe.id] },
      transfer: false,
      transferUsd: 0,
      feeOverrideUsd: null,
      extraDays: 0,
      transitHours: 0,
      interCity: false,
      interCityDays: 0,
      expressDays: 0,
    });
    expect(r.origins[0].hops).toEqual([]);
    expect(r.expressStart).toBeInstanceOf(Date);
    // fee = min(max, base + perKm x km) from the SELLER pin to the customer pin (defaults 2 + 0.5/km, max 15)
    expect(r.distanceKm).toBe(Math.round(KM * 100) / 100);
    expect(r.feeUsd).toBe(Math.round((2 + 0.5 * KM) * 100) / 100);
    expect(r.deliveryUsd).toBe(r.feeUsd);
  });

  it('uses its own fee settings, caps them, and ignores the area\'s flat fee and the transfer fee', async () => {
    setting = { ...setting, expressBaseUsd: '3', expressPerKmUsd: '10', expressMaxUsd: '5', deliveryBaseUsd: '9', deliveryTransferUsd: '9' };
    const r = await quote();
    expect(r.feeUsd).toBe(5);
    await world.coverage.assign({ hubId: gombe.id, areaIds: [(await world.area('CD-KN-GOM')).id], feeOverrideUsd: 30 });
    // the same address, standard (seller off): the area's flat fee applies, so the override really is in force
    await ds.getRepository(Seller).update({ id: seller.id }, { expressDelivery: false });
    expect((await quote()).feeUsd).toBe(30 + 0);
    await ds.getRepository(Seller).update({ id: seller.id }, { expressDelivery: true });
    const again = await quote();
    expect(again).toMatchObject({ deliveryMode: 'express', feeUsd: 5, feeOverrideUsd: null, transferUsd: 0 });
  });

  it('carries expressDeliveryDays and counts the estimate from them', async () => {
    setting = { ...setting, expressDeliveryDays: '2' };
    const r = await quote();
    expect(r.expressDays).toBe(2);
    const e = estimateOrder(r, [{ sellerId: seller.id, prepDays: 1, handlingDays: 0 }], new Date(Date.now() - 60_000));
    // counted from the warehouse's next working moment (it is open round the clock in this test, so that is "now")
    expect(e).toMatchObject({ deliveryMode: 'express', prepDays: 1, routeDays: 2, estimateDays: 3, estimatedDeliveryDate: localDay(r.expressStart as Date, 3) });
  });

  describe('every exclusion gives a standard route', () => {
    const standard = (r: Awaited<ReturnType<typeof quote>>) => {
      expect(r.deliveryMode).toBe('standard');
      expect(r.expressDays).toBe(0);
      expect(r.expressStart).toBeNull();
    };

    it('the platform switch is off (or missing)', async () => {
      setting = { expressDeliveryEnabled: 'false' };
      standard(await quote());
      setting = {};
      standard(await quote());
    });

    it('two sellers on the order, even when both are in the commune and both have express on', async () => {
      const other = await mkSeller('Second Shop');
      standard(await quote({ sellers: [seller, other] }));
    });

    it('a line with no seller', async () => {
      standard(await routing.route({ shippingAddress: await address(), sellerIds: [null] }));
    });

    it('the seller has express off', async () => {
      await ds.getRepository(Seller).update({ id: seller.id }, { expressDelivery: false });
      standard(await quote());
    });

    it('the seller has no pickup area', async () => {
      await ds.getRepository(Seller).update({ id: seller.id }, { pickupAreaId: null });
      standard(await quote());
    });

    it('the seller has no pin', async () => {
      await ds.getRepository(Seller).update({ id: seller.id }, { pickupLat: null, pickupLng: null });
      standard(await quote());
    });

    it('the customer has no pin (the distance would be 0 and only the base fee charged)', async () => {
      standard(await quote({ addr: await address({ pin: null }) }));
    });

    it('a different commune under the SAME warehouse', async () => {
      const r = await quote({ addr: await address({ commune: 'Barumbu', areaCode: 'CD-KN-BRM', pin: { lat: -4.3277, lng: 15.3262 } }) });
      expect(r.destinationHubId).toBe(gombe.id);
      standard(r);
    });

    it('a different commune under ANOTHER warehouse (a normal transfer)', async () => {
      const limeteSeller = await mkSeller('Limete Shop', { pickupLat: -4.3561, pickupLng: 15.3492, pickupAreaId: (await world.area('CD-KN-LMT')).id });
      const r = await quote({ sellers: [limeteSeller] });
      expect(r).toMatchObject({ destinationHubId: gombe.id, originHubIds: [limete.id], transfer: true });
      standard(r);
    });

    it('a stand-in warehouse at the destination (the covering one has no active rider)', async () => {
      await ds.getRepository(User).update({ hubId: gombe.id }, { active: false });
      const r = await quote();
      expect(r.fallback).toBe('city');
      standard(r);
    });

    it('farther than expressMaxKm (0 = no limit)', async () => {
      setting = { ...setting, expressMaxKm: '0.5' };
      standard(await quote());
      setting = { ...setting, expressMaxKm: '5' };
      expect((await quote()).deliveryMode).toBe('express');
      setting = { ...setting, expressMaxKm: '0' };
      expect((await quote()).deliveryMode).toBe('express');
    });

    it('an excluded order keeps the standard fee, transfer and extra days exactly as before', async () => {
      await ds.getRepository(Seller).update({ id: seller.id }, { expressDelivery: false });
      const r = await quote();
      expect(r.feeUsd).toBe(Math.round((2 + 0.5 * haversineKm({ lat: -4.3105, lng: 15.3136 }, CUSTOMER_PIN)) * 100) / 100);
      expect(r.transferUsd).toBe(0);
    });
  });
});
