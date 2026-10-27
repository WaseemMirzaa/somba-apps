import { DataSource } from 'typeorm';
import { DeliveryTask, ENTITIES, Hub, Order, OrderItem, Product, Seller, TransferRun, User, WarehouseException } from '../database/entities';
import { DeliveryService } from '../delivery/delivery.service';
import { LogisticsService } from './logistics.service';
import type { Actor } from './logistics.service';
import { RoutingService } from './routing.service';
import { LanesService } from './lanes.service';
import { RunsService } from './runs.service';
import { sellerTracking } from '../orders/seller-tracking';
import { RolesService } from '../ops/roles.service';
import { RiderService } from '../warehouse/rider.service';
import { AuthService } from '../auth/auth.service';
import { geoWorld } from '../testing/geo-world';
import { testTranslations } from '../testing/test-db';
import { OrderItemTranslationSubscriber } from '../translation/order-item-translation.subscriber';
import type { TranslationService } from '../translation/translation.service';

/**
 * The whole journey on a real (in-memory SQLite) schema: routing, the three legs, scanning in, hub scoping, tiers,
 * returns and replacements. Two Kinshasa warehouses (Entrepôt Kinshasa covers the province, Entrepôt Limete two districts)
 * and one in Lubumbashi (covers the city), one rider each.
 */
describe('LogisticsService (three legs, scoping, tiers)', () => {
  let ds: DataSource;
  let logistics: LogisticsService;
  let delivery: DeliveryService;
  let routing: RoutingService;
  let lanesSvc: LanesService;
  let runs: RunsService;
  let world: Awaited<ReturnType<typeof geoWorld>>;
  let setting: Record<string, string>;
  const notif = { toUser: jest.fn(async () => undefined), toUsers: jest.fn(async () => undefined), toAdmins: jest.fn(async () => undefined), toRole: jest.fn(async () => undefined) };
  const emitter = { toUser: jest.fn(), toRoles: jest.fn(), toHub: jest.fn() };
  const payments = { markCollected: jest.fn(async () => undefined) };

  let gombe: Hub;
  let limete: Hub;
  let lubum: Hub;
  let riderG: User;
  let riderL: User;
  let riderLb: User;
  let sellerG: Seller; // pinned in Gombe -> origin Gombe
  let sellerL: Seller; // pinned in Limete -> origin Limete
  let seq = 0;

  const GOMBE_PIN = { lat: -4.3086, lng: 15.3171 };
  const LIMETE_PIN = { lat: -4.3498, lng: 15.3405 };
  const admin: Actor = { id: 'a1', role: 'admin', name: 'Admin', hubId: null, tier: null };
  const staff = (hub: Hub, tier: string): Actor => ({ id: `s-${hub.id}-${tier}`, role: 'warehouse_staff', name: 'Staff', hubId: hub.id, tier });

  const mkHub = async (name: string, city: string, lat: number, lng: number, areaCode: string, cover: string[], active = true) => {
    const hub = await ds.getRepository(Hub).save(ds.getRepository(Hub).create({ name, city, country: 'X', lat, lng, active, areaId: (await world.area(areaCode)).id }));
    if (cover.length) await world.coverage.assign({ hubId: hub.id, areaIds: await Promise.all(cover.map(async (c) => (await world.area(c)).id)) });
    return hub;
  };
  const mkUser = (role: User['role'], hubId: string | null, extra: Partial<User> = {}) => {
    const n = ++seq;
    return ds.getRepository(User).save(ds.getRepository(User).create({ emailHash: `h${n}`, email: `u${n}@t.test`, passwordHash: 'x', name: `${role}${n}`, role, hubId, ...extra }));
  };
  const mkSeller = async (name: string, pin: { lat: number; lng: number } | null, originHubId: string | null, areaCode: string | null = null) =>
    ds.getRepository(Seller).save(
      ds.getRepository(Seller).create({ name, status: 'approved', pickupAddress: `${name} street`, pickupLat: pin?.lat ?? null, pickupLng: pin?.lng ?? null, originHubId, pickupAreaId: areaCode ? (await world.area(areaCode)).id : null }),
    );

  /** A confirmed order with one line per seller. */
  const mkOrder = async (sellers: Seller[], opts: { pin?: { lat: number; lng: number } | null; cod?: boolean; city?: string; commune?: string } = {}) => {
    const n = ++seq;
    const pin = opts.pin === undefined ? GOMBE_PIN : opts.pin;
    const o = await ds.getRepository(Order).save(
      ds.getRepository(Order).create({
        reference: `SOM-${n}`,
        customerId: 'cust1',
        customerName: 'Marie Dubois',
        status: 'confirmed',
        paymentMethod: opts.cod ? 'cod' : 'stripe_card',
        totalUsd: 50,
        shippingAddress: JSON.stringify({ line1: '1 Rue', city: opts.city ?? 'Kinshasa', commune: opts.commune ?? 'Gombe', ...(pin ? { geo: pin } : {}) }),
        items: sellers.map((s) =>
          Object.assign(new OrderItem(), { productId: `p-${s.id}`, productName: 'Thing', variant: 'Default', qty: 1, priceUsd: 10, sellerId: s.id, sellerName: s.name, fulfilment: 'open' }),
        ),
      }),
    );
    return (await ds.getRepository(Order).findOne({ where: { id: o.id } }))!;
  };

  const tasksOf = (orderId: string) => ds.getRepository(DeliveryTask).find({ where: { orderId }, order: { createdAt: 'ASC', id: 'ASC' } });
  /** `kind:status` of every task of the order, sorted (tasks created in the same second have no stable order). */
  const kinds = async (orderId: string) => (await tasksOf(orderId)).map((t) => `${t.kind}:${t.status}`).sort();
  const orderStatus = async (orderId: string) => (await ds.getRepository(Order).findOne({ where: { id: orderId } }))!.status;
  /** Plan an order the way OrdersService does (the route is stored on the order first). */
  const place = async (sellers: Seller[], opts: Parameters<typeof mkOrder>[1] = {}) => {
    const order = await mkOrder(sellers, opts);
    const route = await routing.route({ shippingAddress: order.shippingAddress, sellerIds: sellers.map((s) => s.id) });
    await ds.getRepository(Order).update({ id: order.id }, { destinationHubId: route.destinationHubId, originHubIds: route.originHubIds, originBySeller: route.originBySeller, routeBySeller: route.routeBySeller });
    await logistics.planOrder((await ds.getRepository(Order).findOne({ where: { id: order.id } }))!);
    return { order: (await ds.getRepository(Order).findOne({ where: { id: order.id } }))!, route };
  };
  /** Scan a parcel in as its warehouse's staff would, after a rider collected it (a parcel nobody collected cannot be scanned). */
  const scan = async (taskId: string, hubId: string, actor: Actor | null = null) => {
    const t = (await ds.getRepository(DeliveryTask).findOne({ where: { id: taskId } }))!;
    if (t && ['unassigned', 'assigned'].includes(t.status)) await ds.getRepository(DeliveryTask).update({ id: taskId }, { status: 'picked_up' });
    return logistics.onScanIn(taskId, hubId, actor);
  };
  const assignAndScan = async (taskId: string) => {
    const t = (await ds.getRepository(DeliveryTask).findOne({ where: { id: taskId } }))!;
    const rider = [riderG, riderL, riderLb].find((r) => r.hubId === t.hubId)!;
    await logistics.assign(t.id, rider.id, admin);
    return scan(t.id, t.toHubId as string);
  };

  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true });
    await ds.initialize();
    setting = {};
    const settings = { all: async () => ({ ...setting }), get: async (k: string) => setting[k] ?? null };
    world = await geoWorld(ds, { settings: () => ({ ...setting }) });
    routing = world.routing;
    lanesSvc = world.lanes;
    logistics = new LogisticsService(
      ds.getRepository(DeliveryTask),
      ds.getRepository(Order),
      ds.getRepository(OrderItem),
      ds.getRepository(Hub),
      ds.getRepository(User),
      ds.getRepository(Seller),
      ds.getRepository(Product),
      ds.getRepository('AuditLog') as never,
      routing,
      lanesSvc,
      notif as never,
      emitter as never,
      settings as never,
    );
    runs = new RunsService(
      ds.getRepository(TransferRun),
      ds.getRepository(DeliveryTask),
      ds.getRepository(User),
      ds.getRepository(Hub),
      ds.getRepository(WarehouseException),
      ds.getRepository('AuditLog') as never,
      logistics,
      notif as never,
      emitter as never,
    );
    delivery = new DeliveryService(ds.getRepository(DeliveryTask), ds.getRepository(Order), emitter as never, payments as never, settings as never, logistics, runs);
    gombe = await mkHub('Entrepôt Kinshasa', 'Kinshasa', -4.3105, 15.3136, 'CD-KN-GOM', ['CD-KN']);
    limete = await mkHub('Entrepôt Limete', 'Kinshasa', -4.354, 15.347, 'CD-KN-LMT', ['CD-KN-D-MAM', 'CD-KN-D-TSH']);
    lubum = await mkHub('Entrepôt Lubumbashi', 'Lubumbashi', -11.6609, 27.4794, 'CD-HK-LUB', ['CD-HK-LUB']);
    riderG = await mkUser('rider', gombe.id);
    riderL = await mkUser('rider', limete.id);
    riderLb = await mkUser('rider', lubum.id);
    sellerG = await mkSeller('Gombe Seller', { lat: -4.3152, lng: 15.3098 }, gombe.id, 'CD-KN-GOM');
    sellerL = await mkSeller('Limete Seller', { lat: -4.3561, lng: 15.3492 }, limete.id, 'CD-KN-LMT');
    jest.clearAllMocks();
  });
  afterEach(async () => ds.destroy());

  describe('routing and fee', () => {
    it('sends the order to the warehouse covering the address area, and charges base + km', async () => {
      const r = await routing.route({ geo: LIMETE_PIN, commune: 'Limete', city: 'Kinshasa', sellerIds: [sellerL.id] });
      expect(r.destinationHubId).toBe(limete.id);
      expect(r.transfer).toBe(false);
      expect(r.pinned).toBe(true);
      expect(r.fallback).toBeNull();
      expect(r.destinationArea).toMatchObject({ code: 'CD-KN-LMT', served: true, hubName: 'Entrepôt Limete' });
      expect(r.destinationAreaChain.map((a) => a.level)).toEqual(['country', 'province', 'city', 'district', 'commune']);
      // 0.5 km-ish from the Limete hub: 2 + 0.5 x km
      expect(r.feeUsd).toBeGreaterThan(2);
      expect(r.feeUsd).toBeLessThan(4);
    });

    it('names the covering warehouse when another one stands in, and gives every hop its transit and price', async () => {
      await lanesSvc.upsert({ fromHubId: limete.id, toHubId: gombe.id, transitHours: 4, costUsd: 2.25, bidirectional: true });
      await ds.getRepository(User).update({ id: riderG.id }, { active: false });
      const r = await routing.route({ geo: GOMBE_PIN, commune: 'Gombe', sellerIds: [sellerL.id] });
      expect(r).toMatchObject({ destinationHubId: limete.id, fallback: 'city', coveringHubId: gombe.id, coveringHubName: 'Entrepôt Kinshasa' });
      // the seller is in Limete (staffed): no fallback there, and the lane Limete -> Limete is nothing to travel
      expect(r.origins[0]).toMatchObject({ hubId: limete.id, fallback: null, coveringHubId: null, hops: [], transitHours: 0 });
      await ds.getRepository(User).update({ id: riderG.id }, { active: true });
      const hop = await routing.route({ geo: GOMBE_PIN, commune: 'Gombe', sellerIds: [sellerL.id] });
      expect(hop.origins[0].hops).toEqual([{ fromHubId: limete.id, fromHubName: 'Entrepôt Limete', toHubId: gombe.id, toHubName: 'Entrepôt Kinshasa', transitHours: 4, costUsd: 2.25, laneCost: true }]);
      expect(hop.transferUsd).toBe(2.25);
      expect(hop.defaultTransferUsd).toBe(1.5); // the per-hop fee a lane without a price of its own would pay
    });

    it('a hop without a lane price shows the effective cost (the default transfer fee) and says the lane did not set it', async () => {
      // no lanes at all: one direct hop at the default fee
      const direct = await routing.route({ geo: GOMBE_PIN, commune: 'Gombe', sellerIds: [sellerL.id] });
      expect(direct.defaultTransferUsd).toBe(1.5);
      expect(direct.origins[0].hops).toEqual([{ fromHubId: limete.id, fromHubName: 'Entrepôt Limete', toHubId: gombe.id, toHubName: 'Entrepôt Kinshasa', transitHours: 0, costUsd: 1.5, laneCost: false }]);
      expect(direct.transferUsd).toBe(1.5);
      // a lane with no price: the default setting is the effective cost; the default follows the setting
      setting = { deliveryTransferUsd: '2.75' };
      await lanesSvc.upsert({ fromHubId: limete.id, toHubId: gombe.id, transitHours: 4 });
      const lane = await routing.route({ geo: GOMBE_PIN, commune: 'Gombe', sellerIds: [sellerL.id] });
      expect(lane.defaultTransferUsd).toBe(2.75);
      expect(lane.origins[0].hops).toMatchObject([{ transitHours: 4, costUsd: 2.75, laneCost: false }]);
      // a lane priced at zero is a lane price (free), not "no price"
      await lanesSvc.upsert({ fromHubId: limete.id, toHubId: gombe.id, transitHours: 4, costUsd: 0 });
      const free = await routing.route({ geo: GOMBE_PIN, commune: 'Gombe', sellerIds: [sellerL.id] });
      expect(free.origins[0].hops).toMatchObject([{ costUsd: 0, laneCost: true }]);
      expect(free.transferUsd).toBe(0);
      // the effective costs of the distinct hops add up to the transfer fee
      expect(lane.origins[0].hops.reduce((t, h) => t + h.costUsd, 0)).toBe(lane.transferUsd);
    });

    it('adds the transfer fee when a seller is served from another warehouse', async () => {
      const same = await routing.route({ geo: GOMBE_PIN, commune: 'Gombe', sellerIds: [sellerG.id] });
      const mixed = await routing.route({ geo: GOMBE_PIN, commune: 'Gombe', sellerIds: [sellerG.id, sellerL.id] });
      expect(mixed.destinationHubId).toBe(gombe.id);
      expect(mixed.originHubIds).toEqual([gombe.id, limete.id]);
      expect(mixed.transfer).toBe(true);
      expect(mixed.routeBySeller).toEqual({ [sellerG.id]: [gombe.id], [sellerL.id]: [limete.id, gombe.id] });
      expect(Number((mixed.feeUsd - same.feeUsd).toFixed(2))).toBe(1.5);
    });

    it('uses the fee settings and caps the distance part', async () => {
      setting = { deliveryBaseUsd: '1', deliveryPerKmUsd: '10', deliveryMaxUsd: '5', deliveryTransferUsd: '3' };
      const far = await routing.route({ geo: GOMBE_PIN, commune: 'Gombe', sellerIds: [sellerL.id] });
      expect(far.deliveryUsd).toBeLessThanOrEqual(5);
      expect(far.feeUsd).toBe(Number((far.deliveryUsd + 3).toFixed(2)));
    });

    it('a flat area fee replaces base + km (the transfer fee still applies)', async () => {
      const tshangu = (await world.area('CD-KN-D-TSH')).id;
      await world.coverage.assign({ hubId: limete.id, areaIds: [tshangu], feeOverrideUsd: 4 });
      const r = await routing.route({ commune: 'Masina', city: 'Kinshasa', geo: { lat: -4.37, lng: 15.395 }, sellerIds: [sellerG.id] });
      expect(r).toMatchObject({ destinationHubId: limete.id, deliveryUsd: 4, transferUsd: 1.5, feeUsd: 5.5, feeOverrideUsd: 4 });
    });

    it('a warehouse without riders is replaced by the nearest staffed one in the same city; a paused one by the wider area', async () => {
      await ds.getRepository(User).update({ id: riderL.id }, { active: false });
      const r = await routing.route({ geo: LIMETE_PIN, commune: 'Limete', sellerIds: [] });
      expect(r).toMatchObject({ destinationHubId: gombe.id, fallback: 'city', coveringHubId: limete.id, coveringHubName: 'Entrepôt Limete' });
      await ds.getRepository(User).update({ id: riderL.id }, { active: true });
      await ds.getRepository(Hub).update({ id: limete.id }, { active: false });
      world.geo.invalidateCoverage();
      // paused: its districts count as unserved by it, so the province owner takes over (no fallback)
      expect(await routing.route({ geo: LIMETE_PIN, commune: 'Limete', sellerIds: [] })).toMatchObject({ destinationHubId: gombe.id, fallback: null });
    });

    it('with no riders in the city it falls back to the nearest staffed warehouse of the province, and with none anywhere it stays put', async () => {
      // a staffed warehouse in another city of the same province covers nothing near
      const mat = await mkHub('Entrepôt Matadi', 'Matadi', -5.8167, 13.4833, 'CD-BC-MAT', ['CD-BC-MAT']);
      await mkUser('rider', mat.id);
      await ds.getRepository(User).createQueryBuilder().update(User).set({ active: false }).where("role = 'rider' AND hubId IN (:...ids)", { ids: [gombe.id, limete.id] }).execute();
      // Kinshasa has no staffed hub; Matadi is in another province -> nobody nearby: stays on the covering hub
      expect(await routing.route({ geo: GOMBE_PIN, commune: 'Gombe', sellerIds: [] })).toMatchObject({ destinationHubId: gombe.id, fallback: 'no_riders' });
      // the covering warehouse is named even though it is also the one that handles the order
      const stuck = await routing.route({ geo: GOMBE_PIN, commune: 'Gombe', sellerIds: [sellerG.id] });
      expect(stuck).toMatchObject({ destinationHubId: gombe.id, fallback: 'no_riders', coveringHubId: gombe.id, coveringHubName: 'Entrepôt Kinshasa' });
      expect(stuck.origins[0]).toMatchObject({ hubId: gombe.id, fallback: 'no_riders', coveringHubId: gombe.id, coveringHubName: 'Entrepôt Kinshasa' });
      await ds.getRepository(User).createQueryBuilder().update(User).set({ active: true }).where("role = 'rider' AND hubId = :id", { id: limete.id }).execute();
      expect(await routing.route({ geo: GOMBE_PIN, commune: 'Gombe', sellerIds: [] })).toMatchObject({ destinationHubId: limete.id, fallback: 'city' });
    });

    it('refuses an address nobody serves, naming the area', async () => {
      await expect(routing.route({ city: 'Paris', sellerIds: [] })).rejects.toThrow("We don't deliver to Paris yet.");
      await expect(routing.route({ city: 'Goma', sellerIds: [] })).rejects.toThrow("We don't deliver to Goma yet.");
      await expect(routing.route({ areaId: 'nope', sellerIds: [] })).rejects.toThrow('Area not found.');
      // an area that has no pin and no text at all
      await expect(routing.route({ sellerIds: [] })).rejects.toThrow("We don't deliver to this area yet.");
    });

    it('a seller whose pickup area is not served cannot be ordered from; one with no area sends to the destination', async () => {
      const goma = await mkSeller('Goma Seller', null, null, 'CD-NK-GOM');
      await expect(routing.route({ geo: GOMBE_PIN, commune: 'Gombe', sellerIds: [goma.id] })).rejects.toThrow('One seller in your cart cannot ship from their area yet.');
      const legacy = await mkSeller('Old Store', null, null);
      const r = await routing.route({ geo: GOMBE_PIN, commune: 'Gombe', sellerIds: [legacy.id] });
      expect(r.originHubIds).toEqual([gombe.id]);
      expect(r.transfer).toBe(false);
    });

    it('a store with only a pin (from before areas) is placed by the pin', async () => {
      const pinned = await mkSeller('Pin Store', { lat: -4.3561, lng: 15.3492 }, null);
      expect((await routing.route({ geo: GOMBE_PIN, commune: 'Gombe', sellerIds: [pinned.id] })).originHubIds).toEqual([limete.id]);
    });

    it('between cities: allowed with the extra days, refused when the switch is off', async () => {
      const r = await routing.route({ city: 'Lubumbashi', geo: { lat: -11.66, lng: 27.48 }, sellerIds: [sellerG.id] });
      expect(r).toMatchObject({ destinationHubId: lubum.id, interCity: true, interCityDays: 3, extraDays: 3, transfer: true });
      expect(r.routeBySeller[sellerG.id]).toEqual([gombe.id, lubum.id]);
      const local = await routing.route({ city: 'Lubumbashi', geo: { lat: -11.66, lng: 27.48 }, sellerIds: [] });
      expect(local).toMatchObject({ interCity: false, extraDays: 0 });
      setting.interCityTransferDays = '5';
      expect((await routing.route({ city: 'Lubumbashi', sellerIds: [sellerG.id] })).extraDays).toBe(5);
      setting.allowInterCityDelivery = 'false';
      await expect(routing.route({ city: 'Lubumbashi', sellerIds: [sellerG.id] })).rejects.toThrow('Delivery between cities is not available right now.');
      expect((await routing.route({ city: 'Kinshasa', commune: 'Gombe', sellerIds: [sellerL.id] })).interCity).toBe(false); // same city is never inter-city
    });

    it('refuses when no warehouse is open', async () => {
      await ds.getRepository(Hub).createQueryBuilder().update(Hub).set({ active: false }).execute();
      world.geo.invalidateCoverage();
      await expect(routing.route({ geo: GOMBE_PIN, commune: 'Gombe', sellerIds: [] })).rejects.toThrow(/no warehouse is open/);
    });
  });

  describe('same warehouse: pickup -> delivery, no transfer', () => {
    it('creates one pickup per seller at the seller origin warehouse', async () => {
      const { order } = await place([sellerG, sellerL]);
      const tasks = await tasksOf(order.id);
      expect(tasks.map((t) => [t.kind, t.sellerId, t.toHubId, t.hubId, t.status])).toEqual(
        expect.arrayContaining([
          ['pickup', sellerG.id, gombe.id, gombe.id, 'unassigned'],
          ['pickup', sellerL.id, limete.id, limete.id, 'unassigned'],
        ]),
      );
      expect(order.destinationHubId).toBe(gombe.id);
      expect(order.originHubIds).toEqual([gombe.id, limete.id]);
      // planning twice never doubles the pickups
      await logistics.planOrder(order);
      expect(await tasksOf(order.id)).toHaveLength(2);
    });

    it('a parcel nobody collected cannot be scanned in: not while unassigned, not while only assigned; the desk flag agrees', async () => {
      const { order } = await place([sellerG]);
      const [pickup] = await tasksOf(order.id);
      const mgr = staff(gombe, 'manager');
      expect(logistics.desk(pickup, mgr)).toMatchObject({ scanIn: false });
      expect(logistics.desk(pickup, admin).scanIn).toBe(false);
      await expect(logistics.onScanIn(pickup.id, gombe.id)).rejects.toThrow('A rider must collect this parcel before it can be scanned in.');
      await logistics.assign(pickup.id, riderG.id, admin);
      const assigned = (await ds.getRepository(DeliveryTask).findOne({ where: { id: pickup.id } }))!;
      expect(logistics.desk(assigned, mgr).scanIn).toBe(false);
      expect(logistics.desk(assigned, admin).scanIn).toBe(false);
      await expect(logistics.onScanIn(pickup.id, gombe.id, mgr)).rejects.toThrow('A rider must collect this parcel before it can be scanned in.');
      expect((await ds.getRepository(DeliveryTask).findOne({ where: { id: pickup.id } }))!.status).toBe('assigned');
      expect(await orderStatus(order.id)).not.toBe('shipped');
      // The rider collects it: now the warehouse may.
      await delivery.updateStatus(pickup.id, 'picked_up', riderG.id);
      const collected = (await ds.getRepository(DeliveryTask).findOne({ where: { id: pickup.id } }))!;
      expect(logistics.desk(collected, mgr).scanIn).toBe(true);
      expect(logistics.desk(collected, admin).scanIn).toBe(true);
      expect(logistics.desk(collected, staff(limete, 'manager')).scanIn).toBe(false); // another warehouse still cannot
      expect((await logistics.onScanIn(pickup.id, gombe.id, mgr)).task.status).toBe('delivered');
    });

    it('a leg that moves pushes the order to its customer again (the app redraws the journey)', async () => {
      const { order } = await place([sellerG]);
      const [pickup] = await tasksOf(order.id);
      emitter.toUser.mockClear();
      await logistics.assign(pickup.id, riderG.id, admin);
      const pushed = emitter.toUser.mock.calls.filter(([to, ev]) => to === 'cust1' && ev === 'order:updated');
      expect(pushed.length).toBeGreaterThan(0);
      expect((pushed[0][2] as { id: string }).id).toBe(order.id);
    });

    it('scanning the only pickup in creates the delivery leg, moves the order to shipped and keeps the code private', async () => {
      const { order } = await place([sellerG]);
      const [pickup] = await tasksOf(order.id);
      const { task, next } = await assignAndScan(pickup.id);
      expect(task.status).toBe('delivered');
      expect(task.receivedAt).toBeTruthy();
      expect(next.map((t) => t.kind)).toEqual(['delivery']);
      expect(next[0]).toMatchObject({ fromHubId: gombe.id, hubId: gombe.id, status: 'unassigned' });
      expect(await orderStatus(order.id)).toBe('shipped');
      const code = await logistics.proofCodeOf(next[0].id);
      expect(code).toMatch(/^\d{4}$/);
      const view = await logistics.view(next[0]);
      expect(JSON.stringify(view)).not.toContain(code as string);
      expect(next[0].proofCode ?? null).toBeNull();
    });

    it("marks the seller's lines received when their pickup is scanned in", async () => {
      const { order } = await place([sellerG]);
      const [pickup] = await tasksOf(order.id);
      await assignAndScan(pickup.id);
      const items = await ds.getRepository(OrderItem).find({ where: { orderId: order.id } });
      expect(items.every((i) => i.fulfilment === 'received' && i.receivedAt)).toBe(true);
    });
  });

  describe('two warehouses: pickup -> transfer -> delivery', () => {
    it('creates a transfer from the origin to the destination and only then the delivery', async () => {
      const { order } = await place([sellerL]); // customer in Gombe, seller in Limete
      const [pickup] = await tasksOf(order.id);
      expect(pickup.toHubId).toBe(limete.id);
      const scanned = await assignAndScan(pickup.id);
      expect(scanned.next.map((t) => t.kind)).toEqual(['transfer']);
      const transfer = scanned.next[0];
      expect(transfer).toMatchObject({ fromHubId: limete.id, toHubId: gombe.id, hubId: limete.id, parentTaskId: pickup.id, sellerId: sellerL.id });
      expect(await kinds(order.id)).toEqual(['pickup:delivered', 'transfer:unassigned']);

      // a rider of EITHER end may carry a transfer (Gombe rider here), staff of the origin assign it
      await logistics.assign(transfer.id, riderG.id, staff(limete, 'supervisor'));
      // the destination staff scan it in; the delivery leg appears at the destination
      const done = await scan(transfer.id, gombe.id);
      expect(done.next.map((t) => t.kind)).toEqual(['delivery']);
      expect(done.next[0]).toMatchObject({ fromHubId: gombe.id, hubId: gombe.id });
      expect(await orderStatus(order.id)).toBe('shipped');
    });

    it('waits for ALL parcels of a multi-seller order before the delivery leg', async () => {
      const { order } = await place([sellerG, sellerL]);
      const pickups = await tasksOf(order.id);
      const pG = pickups.find((t) => t.sellerId === sellerG.id)!;
      const pL = pickups.find((t) => t.sellerId === sellerL.id)!;
      const first = await assignAndScan(pG.id);
      expect(first.next).toEqual([]); // Limete parcel not even collected yet
      expect(await orderStatus(order.id)).not.toBe('shipped');
      const second = await assignAndScan(pL.id);
      expect(second.next.map((t) => t.kind)).toEqual(['transfer']);
      expect(await orderStatus(order.id)).toBe('shipped'); // every parcel is at a warehouse
      const transfer = second.next[0];
      await logistics.assign(transfer.id, riderL.id, admin);
      const last = await scan(transfer.id, gombe.id);
      expect(last.next.map((t) => t.kind)).toEqual(['delivery']);
      expect((await kinds(order.id)).filter((k) => k.startsWith('delivery'))).toHaveLength(1);
    });

    it('a seller who cancels everything frees the delivery once the other parcels are in', async () => {
      const { order } = await place([sellerG, sellerL]);
      const pG = (await tasksOf(order.id)).find((t) => t.sellerId === sellerG.id)!;
      await assignAndScan(pG.id);
      await logistics.onSellerCancelled(order.id, [sellerL.id]);
      expect(await kinds(order.id)).toEqual(['delivery:unassigned', 'pickup:delivered', 'pickup:failed']);
    });
  });

  describe('scoping and tiers', () => {
    it('a scan-in only works at the receiving warehouse', async () => {
      const { order } = await place([sellerG]);
      const [pickup] = await tasksOf(order.id);
      await expect(scan(pickup.id, limete.id)).rejects.toThrow('This parcel is not due at your warehouse.');
      await scan(pickup.id, gombe.id);
      await expect(scan(pickup.id, gombe.id)).rejects.toThrow('This parcel was already scanned in.');
    });

    it('staff of another warehouse cannot assign; operators cannot assign; supervisors can', async () => {
      const { order } = await place([sellerG]);
      const [pickup] = await tasksOf(order.id);
      await expect(logistics.assign(pickup.id, riderG.id, staff(limete, 'manager'))).rejects.toThrow('This task belongs to another warehouse.');
      await expect(logistics.assign(pickup.id, riderG.id, staff(gombe, 'operator'))).rejects.toThrow('Only supervisors and managers can assign riders.');
      const assigned = await logistics.assign(pickup.id, riderG.id, staff(gombe, 'supervisor'));
      expect(assigned).toMatchObject({ riderId: riderG.id, status: 'assigned' });
      expect(await orderStatus(order.id)).toBe('processing');
    });

    it("a rider of another warehouse cannot be given the task; an inactive rider cannot either", async () => {
      const { order } = await place([sellerG]);
      const [pickup] = await tasksOf(order.id);
      await expect(logistics.assign(pickup.id, riderL.id, staff(gombe, 'supervisor'))).rejects.toThrow('This rider works at another warehouse.');
      await ds.getRepository(User).update({ id: riderG.id }, { active: false });
      await expect(logistics.assign(pickup.id, riderG.id, admin)).rejects.toThrow('Choose an active rider.');
    });

    it("the desk queue shows a warehouse its own legs, inbound transfers included, never another warehouse's", async () => {
      const { order } = await place([sellerL]); // customer Gombe, seller Limete
      const [pickup] = await tasksOf(order.id);
      const { next } = await assignAndScan(pickup.id);
      const gombeQueue = await logistics.queue(gombe.id, { status: 'all', take: 50, skip: 0 });
      const limeteQueue = await logistics.queue(limete.id, { status: 'all', take: 50, skip: 0 });
      const lubumQueue = await logistics.queue(lubum.id, { status: 'all', take: 50, skip: 0 });
      expect(gombeQueue.tasks.map((t) => t.id)).toContain(next[0].id); // inbound transfer
      expect(limeteQueue.tasks.map((t) => t.id).sort()).toEqual([pickup.id, next[0].id].sort());
      expect(lubumQueue.tasks).toEqual([]);
      // what the desk lets each warehouse do with the transfer
      const t = (await ds.getRepository(DeliveryTask).findOne({ where: { id: next[0].id } }))!;
      expect(logistics.desk(t, staff(limete, 'supervisor'))).toMatchObject({ assign: true, scanIn: false, scanOut: false });
      expect(logistics.desk(t, staff(gombe, 'operator'))).toMatchObject({ assign: false, scanIn: false }); // nobody has collected it yet
      const onTheRoad = { ...t, status: 'in_transit' } as DeliveryTask;
      expect(logistics.desk(onTheRoad, staff(gombe, 'operator'))).toMatchObject({ assign: false, scanIn: true });
      expect(logistics.desk(t, staff(lubum, 'manager'))).toMatchObject({ assign: false, scanIn: false, scanOut: false });
    });

    it('custody: a parcel is inbound, then on hand, then outbound', async () => {
      const { order } = await place([sellerG]);
      const [pickup] = await tasksOf(order.id);
      await logistics.assign(pickup.id, riderG.id, admin);
      expect((await logistics.custody(gombe.id)).inbound.map((t) => t.id)).toEqual([pickup.id]);
      const { next } = await scan(pickup.id, gombe.id);
      let c = await logistics.custody(gombe.id);
      expect(c.inbound).toEqual([]);
      expect(c.onHand.map((t) => t.id)).toEqual([pickup.id]);
      await logistics.assign(next[0].id, riderG.id, admin);
      await logistics.scanOut(next[0].id, gombe.id);
      c = await logistics.custody(gombe.id);
      expect(c.onHand).toEqual([]);
      expect(c.outbound.map((t) => t.id)).toEqual([next[0].id]);
    });
  });

  describe('rider status updates per leg', () => {
    it('a rider cannot finish a leg that ends at a warehouse, and cannot touch someone else\'s task', async () => {
      const { order } = await place([sellerG]);
      const [pickup] = await tasksOf(order.id);
      await logistics.assign(pickup.id, riderG.id, admin);
      await delivery.updateStatus(pickup.id, 'picked_up', riderG.id);
      await delivery.updateStatus(pickup.id, 'in_transit', riderG.id);
      await expect(delivery.updateStatus(pickup.id, 'delivered', riderG.id)).rejects.toThrow('This leg ends at the warehouse: warehouse staff scan the parcel in.');
      await expect(delivery.updateStatus(pickup.id, 'picked_up', riderL.id)).rejects.toThrow('Delivery task not found.');
    });

    it('walks the customer delivery: needs the code, moves the order to out_for_delivery then delivered, collects COD', async () => {
      setting.requireDeliveryCode = 'true';
      const { order } = await place([sellerG], { cod: true });
      await ds.getRepository('Payment').save({ orderId: order.id, method: 'cod', amountUsd: 42, status: 'pending', purpose: 'order' } as never).catch(() => undefined);
      const [pickup] = await tasksOf(order.id);
      const { next } = await assignAndScan(pickup.id);
      const d = next[0];
      await logistics.assign(d.id, riderG.id, staff(gombe, 'supervisor'));
      expect((await ds.getRepository(Order).findOne({ where: { id: order.id } }))!.riderId).toBe(riderG.id);
      await delivery.updateStatus(d.id, 'picked_up', riderG.id);
      expect(await orderStatus(order.id)).toBe('shipped');
      await delivery.updateStatus(d.id, 'in_transit', riderG.id);
      expect(await orderStatus(order.id)).toBe('out_for_delivery');
      await expect(delivery.updateStatus(d.id, 'delivered', riderG.id, undefined, '0000')).rejects.toThrow(/Wrong delivery code/);
      const code = (await logistics.proofCodeOf(d.id)) as string;
      await delivery.updateStatus(d.id, 'delivered', riderG.id, undefined, code);
      expect(await orderStatus(order.id)).toBe('delivered');
      expect(payments.markCollected).toHaveBeenCalledWith(order.id);
    });

    it('needsCode on the delivery leg follows the requireDeliveryCode setting; other legs never need it', async () => {
      const { order } = await place([sellerG]);
      const [pickup] = await tasksOf(order.id);
      const { next } = await assignAndScan(pickup.id);
      const d = next[0];
      expect(d.kind).toBe('delivery');
      expect((await logistics.view(d)).needsCode).toBe(false); // setting absent
      setting.requireDeliveryCode = 'false';
      expect((await logistics.view(d)).needsCode).toBe(false);
      setting.requireDeliveryCode = 'true';
      expect((await logistics.view(d)).needsCode).toBe(true);
      expect((await logistics.viewMany([d, (await tasksOf(order.id)).find((t) => t.kind === 'pickup')!])).map((v) => [v.kind, v.needsCode])).toEqual(expect.arrayContaining([['delivery', true], ['pickup', false]]));
    });

    it('a rider whose task is given to someone else is told it is gone (and the new rider is not named)', async () => {
      const { order } = await place([sellerG]);
      const [pickup] = await tasksOf(order.id);
      const riderG2 = await mkUser('rider', gombe.id);
      await logistics.assign(pickup.id, riderG.id, admin);
      emitter.toUser.mockClear();
      await logistics.assign(pickup.id, riderG.id, admin); // same rider again: nothing is removed
      expect(emitter.toUser.mock.calls.filter(([, , p]) => (p as { removed?: boolean }).removed)).toHaveLength(0);
      emitter.toUser.mockClear();
      await logistics.assign(pickup.id, riderG2.id, admin);
      const gone = emitter.toUser.mock.calls.filter(([to, ev, p]) => to === riderG.id && ev === 'task:updated' && (p as { removed?: boolean }).removed);
      expect(gone).toHaveLength(1);
      expect(gone[0][2]).toEqual({ id: pickup.id, orderId: order.id, orderReference: order.reference, kind: 'pickup', status: 'unassigned', removed: true, reason: 'reassigned' });
      expect(emitter.toUser.mock.calls.some(([to, ev]) => to === riderG2.id && ev === 'task:updated')).toBe(true);
      expect(JSON.stringify(gone[0][2])).not.toContain(riderG2.id);
    });

    it('an impossible move names the leg: "A pickup that is picked up cannot become assigned."', async () => {
      const { order } = await place([sellerG]);
      const [pickup] = await tasksOf(order.id);
      await logistics.assign(pickup.id, riderG.id, admin);
      await delivery.updateStatus(pickup.id, 'picked_up', riderG.id);
      await expect(delivery.updateStatus(pickup.id, 'assigned', riderG.id)).rejects.toThrow('A pickup that is picked up cannot become assigned.');
      await expect(delivery.updateStatus(pickup.id, 'picked_up', riderG.id)).rejects.toThrow('A pickup that is picked up cannot become picked up.');
      // The customer delivery keeps its own word.
      const { next } = await scan(pickup.id, pickup.toHubId as string);
      await logistics.assign(next[0].id, riderG.id, staff(gombe, 'supervisor'));
      await delivery.updateStatus(next[0].id, 'picked_up', riderG.id);
      await expect(delivery.updateStatus(next[0].id, 'assigned', riderG.id)).rejects.toThrow('A delivery that is picked up cannot become assigned.');
    });

    it('riders cannot accept tasks themselves', () => {
      expect(() => delivery.accept('t1')).toThrow('Your warehouse assigns your tasks. You cannot accept a task yourself.');
    });

    it('a failed leg is re-opened as another attempt of the same leg until the limit', async () => {
      const { order } = await place([sellerG]);
      const [pickup] = await tasksOf(order.id);
      await logistics.assign(pickup.id, riderG.id, admin);
      await delivery.updateStatus(pickup.id, 'failed', riderG.id, 'Seller closed');
      const failed = (await ds.getRepository(DeliveryTask).findOne({ where: { id: pickup.id } }))!;
      expect(failed.status).toBe('failed');
      const again = await logistics.reopen(failed);
      expect(again).toMatchObject({ kind: 'pickup', attempts: 2, status: 'unassigned', toHubId: gombe.id, sellerId: sellerG.id });
      expect(logistics.canRetry(again)).toBe(true);
      expect(logistics.canRetry({ ...again, attempts: 3 } as DeliveryTask)).toBe(false);
    });
  });

  describe('returns', () => {
    const delivered = async (sellers: Seller[], pin = GOMBE_PIN) => {
      const { order } = await place(sellers, { pin });
      await ds.getRepository(Order).update({ id: order.id }, { status: 'delivered' });
      return (await ds.getRepository(Order).findOne({ where: { id: order.id } }))!;
    };

    it('collects from the customer to the destination warehouse, then straight back to a seller of the same warehouse', async () => {
      const order = await delivered([sellerG]);
      const pickup = await logistics.createReturnPickup({ disputeId: 'd1', orderId: order.id });
      expect(pickup).toMatchObject({ kind: 'return_pickup', toHubId: gombe.id, hubId: gombe.id, disputeId: 'd1', status: 'unassigned' });
      expect((await logistics.createReturnPickup({ disputeId: 'd1', orderId: order.id })).id).toBe(pickup.id); // idempotent
      await logistics.assign(pickup.id, riderG.id, admin);
      const { next } = await scan(pickup.id, gombe.id);
      expect(next.map((t) => [t.kind, t.fromHubId, t.sellerId])).toEqual([['return_to_seller', gombe.id, sellerG.id]]);
      expect(await orderStatus(order.id)).toBe('delivered'); // return legs never change the order status
    });

    it('runs back through the origin warehouse of a seller served from another one', async () => {
      const order = await delivered([sellerL]);
      const pickup = await logistics.createReturnPickup({ disputeId: 'd2', orderId: order.id });
      const first = await scan(pickup.id, gombe.id);
      expect(first.next.map((t) => [t.kind, t.fromHubId, t.toHubId])).toEqual([['return_transfer', gombe.id, limete.id]]);
      const second = await scan(first.next[0].id, limete.id);
      expect(second.next.map((t) => [t.kind, t.fromHubId, t.sellerId])).toEqual([['return_to_seller', limete.id, sellerL.id]]);
    });

    it('can return just some items', async () => {
      const order = await delivered([sellerG, sellerL]);
      const lineL = order.items.find((i) => i.sellerId === sellerL.id)!;
      const pickup = await logistics.createReturnPickup({ disputeId: 'd3', orderId: order.id, items: [{ orderItemId: lineL.id }] });
      const items = JSON.parse(pickup.itemsJson as string) as { orderItemId: string }[];
      expect(items.map((i) => i.orderItemId)).toEqual([lineL.id]);
      await expect(logistics.createReturnPickup({ disputeId: 'd4', orderId: order.id, items: [{ orderItemId: 'nope' }] })).rejects.toThrow('One of the returned items is not on this order.');
    });
  });

  describe('replacement delivery', () => {
    it('brings the new unit from the seller through the same legs, without touching the order status', async () => {
      const order = await (async () => {
        const { order: o } = await place([sellerL]);
        await ds.getRepository(Order).update({ id: o.id }, { status: 'delivered' });
        return o;
      })();
      await ds.getRepository('Replacement').save({ reference: 'REP-1', orderId: order.id, orderReference: order.reference, customerId: 'cust1', customerName: 'M', sellerId: sellerL.id, sku: 'S', productName: 'Thing', qty: 1, status: 'approved' } as never);
      const rep = (await ds.getRepository('Replacement').findOne({ where: { reference: 'REP-1' } })) as { id: string };
      const first = await logistics.createReplacementDelivery({ replacementId: rep.id, orderId: order.id });
      expect(first).toMatchObject({ kind: 'pickup', replacementId: rep.id, toHubId: limete.id });
      expect((await logistics.createReplacementDelivery({ replacementId: rep.id, orderId: order.id })).id).toBe(first.id);
      const s1 = await scan(first.id, limete.id);
      expect(s1.next.map((t) => t.kind)).toEqual(['transfer']);
      const s2 = await scan(s1.next[0].id, gombe.id);
      expect(s2.next.map((t) => [t.kind, t.replacementId, t.fromHubId])).toEqual([['replacement_delivery', rep.id, gombe.id]]);
      expect((await logistics.view(s2.next[0])).needsCode).toBe(false); // no customer code on a replacement
      const final = s2.next[0];
      expect(await logistics.proofCodeOf(final.id)).toBeNull(); // no handover code on a replacement
      expect(await orderStatus(order.id)).toBe('delivered');
      // the original order's own legs were not disturbed (its pickup was never scanned, so nothing followed it)
      expect((await tasksOf(order.id)).filter((t) => !t.replacementId).map((t) => `${t.kind}:${t.status}`)).toEqual(['pickup:unassigned']);
    });
  });

  describe('listeners and voiding', () => {
    it('tells listeners about scans and deliveries, and survives one that throws', async () => {
      const seen: string[] = [];
      logistics.registerListener(() => {
        throw new Error('boom');
      });
      logistics.registerListener((e) => void seen.push(`${e.type}:${e.task.kind}`));
      const { order } = await place([sellerG]);
      const [pickup] = await tasksOf(order.id);
      await assignAndScan(pickup.id);
      expect(seen).toEqual(expect.arrayContaining(['created:pickup', 'assigned:pickup', 'scanned_in:pickup', 'created:delivery']));
    });

    it('cancelling an order voids every open leg', async () => {
      const { order } = await place([sellerG, sellerL]);
      const voided = await logistics.voidOrderTasks(order.id);
      expect(voided).toHaveLength(2);
      expect((await tasksOf(order.id)).every((t) => t.status === 'failed' && t.failureReason === 'Order cancelled')).toBe(true);
    });
  });

  // ── multi-warehouse routes (UC-10) ────────────────────────────────────────────
  describe('multi-warehouse hops over lanes', () => {
    let kikwit: Hub;
    let riderW: User;
    const KIKWIT_PIN = { lat: -5.0412, lng: 18.8162 };
    const lane = (a: Hub, b: Hub, transitHours: number, costUsd: number | null = null) => lanesSvc.upsert({ fromHubId: a.id, toHubId: b.id, transitHours, costUsd, bidirectional: true });
    const toKikwit = (sellers: Seller[]) => place(sellers, { city: 'Kikwit', commune: '', pin: KIKWIT_PIN });
    const hopsOf = async (orderId: string) => (await tasksOf(orderId)).filter((t) => t.kind === 'transfer').sort((a, b) => (a.hop ?? 0) - (b.hop ?? 0));

    beforeEach(async () => {
      kikwit = await mkHub('Entrepôt Kikwit', 'Kikwit', -5.0412, 18.8162, 'CD-KL-KIK', ['CD-KL-KIK']);
      riderW = await mkUser('rider', kikwit.id);
      await lane(limete, gombe, 4);
      await lane(gombe, kikwit, 24);
    });

    it('plans Limete -> Kinshasa -> Kikwit, charges a transfer fee per hop and adds the transit to the estimate', async () => {
      const r = await routing.route({ city: 'Kikwit', geo: KIKWIT_PIN, sellerIds: [sellerL.id] });
      expect(r.destinationHubId).toBe(kikwit.id);
      expect(r.routeBySeller[sellerL.id]).toEqual([limete.id, gombe.id, kikwit.id]);
      expect(r.origins[0].hops.map((h) => `${h.fromHubName}>${h.toHubName}`)).toEqual(['Entrepôt Limete>Entrepôt Kinshasa', 'Entrepôt Kinshasa>Entrepôt Kikwit']);
      expect(r).toMatchObject({ transferUsd: 3, transitHours: 28, interCity: true, extraDays: 2, transfer: true });
      // a lane may carry its own price, which replaces the transfer fee of that hop
      await lane(gombe, kikwit, 24, 7);
      expect((await routing.route({ city: 'Kikwit', geo: KIKWIT_PIN, sellerIds: [sellerL.id] })).transferUsd).toBe(8.5);
      // parcels that share a hop pay it once
      const both = await routing.route({ city: 'Kikwit', geo: KIKWIT_PIN, sellerIds: [sellerL.id, sellerG.id] });
      expect(both.transferUsd).toBe(8.5 + 0); // sellerG: one hop K>W (already counted)
      expect(both.routeBySeller[sellerG.id]).toEqual([gombe.id, kikwit.id]);
    });

    it('with no lane at all the transfer is direct (hop 1 of 1)', async () => {
      await ds.getRepository('HubLane').createQueryBuilder().delete().execute();
      lanesSvc.invalidate();
      const r = await routing.route({ city: 'Kikwit', geo: KIKWIT_PIN, sellerIds: [sellerL.id] });
      expect(r.routeBySeller[sellerL.id]).toEqual([limete.id, kikwit.id]);
      expect(r).toMatchObject({ transferUsd: 1.5, transitHours: 0, unconnected: [] });
    });

    it('walks every hop: each hop is created at the scan-in before it, unassigned, with its own driver', async () => {
      const { order } = await toKikwit([sellerL]);
      expect(order.routeBySeller).toEqual({ [sellerL.id]: [limete.id, gombe.id, kikwit.id] });
      const [pickup] = await tasksOf(order.id);
      expect(pickup.toHubId).toBe(limete.id);

      // pickup scanned in at Limete -> hop 1 (Limete -> Kinshasa), heading for Kikwit
      const s1 = await assignAndScan(pickup.id);
      expect(s1.next.map((t) => t.kind)).toEqual(['transfer']);
      const hop1 = s1.next[0];
      expect(hop1).toMatchObject({ fromHubId: limete.id, toHubId: gombe.id, finalHubId: kikwit.id, hubId: limete.id, hop: 1, hops: 2, status: 'unassigned', riderId: null });
      expect(await orderStatus(order.id)).toBe('shipped');

      // Limete's rider carries hop 1; Kinshasa scans it in -> hop 2, NOT inheriting the driver
      await logistics.assign(hop1.id, riderL.id, staff(limete, 'supervisor'));
      const s2 = await scan(hop1.id, gombe.id);
      expect(s2.next.map((t) => t.kind)).toEqual(['transfer']);
      const hop2 = s2.next[0];
      expect(hop2).toMatchObject({ fromHubId: gombe.id, toHubId: kikwit.id, finalHubId: kikwit.id, hubId: gombe.id, hop: 2, hops: 2, status: 'unassigned', riderId: null, parentTaskId: hop1.id });
      expect((await ds.getRepository(DeliveryTask).findOne({ where: { id: hop1.id } }))!.riderId).toBe(riderL.id);
      // Kinshasa's staff assign THEIR driver (Kikwit's rider would do as well)
      await expect(logistics.assign(hop2.id, riderL.id, staff(gombe, 'supervisor'))).rejects.toThrow('This rider works at another warehouse.');
      await logistics.assign(hop2.id, riderG.id, staff(gombe, 'supervisor'));
      expect((await ds.getRepository(DeliveryTask).findOne({ where: { id: hop2.id } }))!.riderId).toBe(riderG.id);
      expect(await kinds(order.id)).toEqual(['pickup:delivered', 'transfer:assigned', 'transfer:delivered']);

      // no delivery before the last hop lands
      const s3 = await scan(hop2.id, kikwit.id);
      expect(s3.next.map((t) => [t.kind, t.fromHubId])).toEqual([['delivery', kikwit.id]]);
      expect((await tasksOf(order.id)).filter((t) => t.kind === 'delivery')).toHaveLength(1);
      expect(await orderStatus(order.id)).toBe('shipped');
      await logistics.assign(s3.next[0].id, riderW.id, admin);
      expect((await ds.getRepository(Order).findOne({ where: { id: order.id } }))!.riderId).toBe(riderW.id);
    });

    it('shows the customer one tracking entry per hop, and every task view carries hop, hops and its run', async () => {
      const { order } = await toKikwit([sellerL]);
      const s1 = await assignAndScan((await tasksOf(order.id))[0].id);
      await logistics.assign(s1.next[0].id, riderL.id, admin);
      const s2 = await scan(s1.next[0].id, gombe.id);
      const names = new Map([limete, gombe, kikwit].map((h) => [h.id, { id: h.id, name: h.name, city: h.city }]));
      const tracking = (await sellerTracking(ds.manager, [order.id], undefined, { hubs: names })).get(order.id)!;
      const transfers = tracking.legs.filter((l) => l.kind === 'transfer');
      expect(transfers.map((l) => [l.hop, l.hops, l.fromHubName, l.toHubName, l.status])).toEqual([
        [1, 2, 'Entrepôt Limete', 'Entrepôt Kinshasa', 'delivered'],
        [2, 2, 'Entrepôt Kinshasa', 'Entrepôt Kikwit', 'unassigned'],
      ]);
      const view = await logistics.view(s2.next[0]);
      expect(view).toMatchObject({ kind: 'transfer', hop: 2, hops: 2, finalHubId: kikwit.id, runId: null, runReference: null });
      expect(await logistics.view((await tasksOf(order.id)).find((t) => t.kind === 'pickup')!)).toMatchObject({ kind: 'pickup', hop: 1, hops: 1 });
    });

    it('a lane switched off mid-route only changes the hops not yet created: the next scan-in re-plans', async () => {
      const { order } = await toKikwit([sellerL]);
      const s1 = await assignAndScan((await tasksOf(order.id))[0].id);
      const hop1 = s1.next[0];
      // Kinshasa -> Kikwit goes down while the parcel is on the first hop
      const laneKW = (await lanesSvc.list()).find((l) => l.fromHubId === gombe.id && l.toHubId === kikwit.id)!;
      await lanesSvc.upsert({ id: laneKW.id, active: false, bidirectional: true });
      await logistics.assign(hop1.id, riderL.id, admin);
      const s2 = await scan(hop1.id, gombe.id);
      // hop 1 kept its route (it already left); hop 2 is planned over today's lanes: none connects Kinshasa to Kikwit, so it goes direct and admins hear
      expect((await ds.getRepository(DeliveryTask).findOne({ where: { id: hop1.id } }))!).toMatchObject({ toHubId: gombe.id, finalHubId: kikwit.id });
      expect(s2.next[0]).toMatchObject({ kind: 'transfer', fromHubId: gombe.id, toHubId: kikwit.id, hop: 2 });
      expect(notif.toAdmins).toHaveBeenCalledWith(expect.objectContaining({ title: 'Warehouses not connected', body: expect.stringContaining('no lane connects Entrepôt Kinshasa to Entrepôt Kikwit') }));
    });

    it('a returned parcel runs the same route in reverse, hop by hop, to the seller', async () => {
      const { order } = await toKikwit([sellerL]);
      const s1 = await assignAndScan((await tasksOf(order.id))[0].id);
      await logistics.assign(s1.next[0].id, riderL.id, admin);
      const s2 = await scan(s1.next[0].id, gombe.id);
      await logistics.assign(s2.next[0].id, riderG.id, admin);
      await scan(s2.next[0].id, kikwit.id);
      await ds.getRepository(Order).update({ id: order.id }, { status: 'delivered' });

      const ret = await logistics.createReturnPickup({ disputeId: 'dr1', orderId: order.id });
      expect(ret.toHubId).toBe(kikwit.id);
      const r1 = await scan(ret.id, kikwit.id);
      expect(r1.next.map((t) => [t.kind, t.fromHubId, t.toHubId, t.finalHubId, t.hop, t.hops])).toEqual([['return_transfer', kikwit.id, gombe.id, limete.id, 1, 2]]);
      const r2 = await scan(r1.next[0].id, gombe.id);
      expect(r2.next.map((t) => [t.kind, t.fromHubId, t.toHubId, t.finalHubId, t.hop, t.hops, t.riderId])).toEqual([['return_transfer', gombe.id, limete.id, limete.id, 2, 2, null]]);
      const r3 = await scan(r2.next[0].id, limete.id);
      expect(r3.next.map((t) => [t.kind, t.fromHubId, t.sellerId])).toEqual([['return_to_seller', limete.id, sellerL.id]]);
      expect(await orderStatus(order.id)).toBe('delivered');
    });

    it('a replacement unit travels the hops too, ending in a replacement delivery', async () => {
      const { order } = await toKikwit([sellerL]);
      await ds.getRepository(Order).update({ id: order.id }, { status: 'delivered' });
      await ds.getRepository('Replacement').save({ reference: 'REP-9', orderId: order.id, orderReference: order.reference, customerId: 'cust1', customerName: 'M', sellerId: sellerL.id, sku: 'S', productName: 'Thing', qty: 1, status: 'approved' } as never);
      const rep = (await ds.getRepository('Replacement').findOne({ where: { reference: 'REP-9' } })) as { id: string };
      const first = await logistics.createReplacementDelivery({ replacementId: rep.id, orderId: order.id });
      const s1 = await scan(first.id, limete.id);
      expect(s1.next.map((t) => [t.kind, t.toHubId, t.finalHubId])).toEqual([['transfer', gombe.id, kikwit.id]]);
      const s2 = await scan(s1.next[0].id, gombe.id);
      expect(s2.next.map((t) => [t.kind, t.toHubId, t.hop, t.hops])).toEqual([['transfer', kikwit.id, 2, 2]]);
      const s3 = await scan(s2.next[0].id, kikwit.id);
      expect(s3.next.map((t) => [t.kind, t.fromHubId, t.replacementId])).toEqual([['replacement_delivery', kikwit.id, rep.id]]);
    });

    it('lanes: two-way upsert, edit, remove, preview, and the errors', async () => {
      const all = await lanesSvc.list();
      expect(all.map((l) => `${l.fromHubName}>${l.toHubName}`).sort()).toEqual(['Entrepôt Kikwit>Entrepôt Kinshasa', 'Entrepôt Kinshasa>Entrepôt Kikwit', 'Entrepôt Kinshasa>Entrepôt Limete', 'Entrepôt Limete>Entrepôt Kinshasa']);
      expect(all.every((l) => l.bidirectional)).toBe(true);
      expect(await lanesSvc.list(kikwit.id)).toHaveLength(2);
      const preview = await lanesSvc.preview(limete.id, kikwit.id);
      expect(preview).toMatchObject({ totalHours: 28, direct: false });
      expect(preview.hops).toHaveLength(2);
      // upsert on the same pair edits it; bidirectional:false drops the way back
      const one = await lanesSvc.upsert({ fromHubId: limete.id, toHubId: gombe.id, transitHours: 5, costUsd: 2, bidirectional: false });
      expect(one).toMatchObject({ transitHours: 5, costUsd: 2, bidirectional: false });
      expect((await lanesSvc.list()).filter((l) => l.fromHubId === gombe.id && l.toHubId === limete.id)).toHaveLength(0);
      await expect(lanesSvc.upsert({ fromHubId: limete.id, toHubId: limete.id, transitHours: 1 })).rejects.toThrow('A lane connects two different warehouses.');
      await expect(lanesSvc.upsert({ fromHubId: limete.id, toHubId: 'nope', transitHours: 1 })).rejects.toThrow('Hub not found.');
      await expect(lanesSvc.upsert({ fromHubId: limete.id, toHubId: gombe.id, transitHours: -2 })).rejects.toThrow('Transit time (hours) must be');
      // lubumbashi has no lane while others do: asking for a route to it is an error, not a guess
      await expect(lanesSvc.preview(limete.id, lubum.id)).rejects.toThrow('These warehouses are not connected by any lane.');
      expect(await lanesSvc.remove(one.id, { both: true })).toEqual({ removed: true });
      await expect(lanesSvc.remove(one.id)).rejects.toThrow('Lane not found.');
      // a lane through a paused warehouse is not used
      await ds.getRepository(Hub).update({ id: gombe.id }, { active: false });
      lanesSvc.invalidate();
      // with the only hub that joins them paused, no lane is usable any more: transfers are direct again
      expect(await lanesSvc.route(kikwit.id, limete.id)).toMatchObject({ lanesConfigured: false, direct: true, connected: true });
    });
  });

  // ── transfer runs (UC-11) ─────────────────────────────────────────────────────
  describe('transfer runs', () => {
    const MASINA_PIN = { lat: -4.37, lng: 15.395 };
    /** Four orders from the Gombe seller to Masina: each ends with a transfer leg Kinshasa -> Limete waiting for a rider. */
    const waiting = async (n = 4) => {
      const out: DeliveryTask[] = [];
      for (let i = 0; i < n; i++) {
        const { order } = await place([sellerG], { commune: 'Masina', pin: MASINA_PIN });
        const [pickup] = await tasksOf(order.id);
        out.push(...(await assignAndScan(pickup.id)).next);
      }
      return out;
    };
    const fresh = (id: string) => ds.getRepository(DeliveryTask).findOne({ where: { id } }) as Promise<DeliveryTask>;

    it('proposes the transfer legs waiting at a warehouse, grouped by the next warehouse', async () => {
      const legs = await waiting(3);
      const props = await runs.proposals(staff(gombe, 'supervisor'));
      expect(props).toEqual([{ toHubId: limete.id, toHubName: 'Entrepôt Limete', taskIds: legs.map((t) => t.id), count: 3 }]);
      expect(await runs.proposals(staff(limete, 'supervisor'))).toEqual([]);
      expect(await runs.proposals(admin, gombe.id)).toHaveLength(1);
      await expect(runs.proposals(admin)).rejects.toThrow('Choose a warehouse.');
    });

    it('creates a run, one driver, dispatches it, the driver goes on the road, the receiving warehouse scans everything in', async () => {
      const legs = await waiting(4);
      const ids = legs.map((t) => t.id);
      await expect(runs.create(staff(gombe, 'operator'), { toHubId: limete.id, taskIds: ids })).rejects.toThrow('Only supervisors and managers can assign riders.');
      await expect(runs.create(staff(limete, 'supervisor'), { toHubId: limete.id, taskIds: ids })).rejects.toThrow('Only parcels waiting at this warehouse can join this run.');
      await expect(runs.create(staff(gombe, 'supervisor'), { toHubId: limete.id, taskIds: ['nope'] })).rejects.toThrow('Only parcels waiting at this warehouse can join this run.');
      const run = await runs.create(staff(gombe, 'supervisor'), { toHubId: limete.id, taskIds: ids });
      expect(run).toMatchObject({ reference: 'TR-0001', status: 'planned', fromHubName: 'Entrepôt Kinshasa', toHubName: 'Entrepôt Limete', count: 4, receivedCount: 0, missingCount: 0, riderId: null });
      expect((await runs.proposals(staff(gombe, 'supervisor')))).toEqual([]); // they are in a run now
      // a parcel of a run is managed from the run
      await expect(logistics.assign(ids[0], riderG.id, admin)).rejects.toThrow('This parcel is part of a transfer run. Manage it from the run.');
      expect(await logistics.view(await fresh(ids[0]))).toMatchObject({ runId: run.id, runReference: 'TR-0001' });

      await expect(runs.dispatch(staff(gombe, 'supervisor'), { runId: run.id })).rejects.toThrow('Choose a driver for this run first.');
      await expect(runs.assign(staff(gombe, 'supervisor'), { runId: run.id, riderId: riderLb.id })).rejects.toThrow('This rider works at another warehouse.');
      const assigned = await runs.assign(staff(gombe, 'supervisor'), { runId: run.id, riderId: riderG.id });
      expect(assigned).toMatchObject({ riderId: riderG.id, status: 'planned' });
      // the driver cannot take a parcel of a run that has not left on their own
      await expect(delivery.updateStatus(ids[0], 'picked_up', riderG.id)).rejects.toThrow('This parcel is part of a transfer run. Manage it from the run.');
      expect((await fresh(ids[0]))).toMatchObject({ riderId: riderG.id, status: 'assigned' });
      emitter.toHub.mockClear();
      const sent = await runs.dispatch(staff(gombe, 'supervisor'), { runId: run.id });
      expect(sent.status).toBe('dispatched');
      expect(sent.dispatchedAt).toBeTruthy();
      expect((await Promise.all(ids.map(fresh))).map((t) => [t.status, t.riderId])).toEqual(ids.map(() => ['picked_up', riderG.id]));
      expect(emitter.toHub.mock.calls.filter(([, ev]) => ev === 'run:updated').map(([h]) => h).sort()).toEqual([gombe.id, limete.id].sort());
      expect(sent).toMatchObject({ inTransit: false, inTransitAt: null });
      // the customer's journey names the run and the rider of each hop
      const names = new Map([gombe, limete].map((h) => [h.id, { id: h.id, name: h.name, city: h.city }]));
      const leg = (await sellerTracking(ds.manager, [(await fresh(ids[0])).orderId], undefined, { hubs: names })).get((await fresh(ids[0])).orderId)!.legs.find((l) => l.kind === 'transfer')!;
      expect(leg).toMatchObject({ runId: run.id, runReference: 'TR-0001', hop: 1, hops: 1, fromHubName: 'Entrepôt Kinshasa', toHubName: 'Entrepôt Limete', status: 'picked_up' });
      expect(leg.riderFirstName).toBeTruthy();
      expect(leg.fromHub).toMatchObject({ id: gombe.id }); // the objects stay
      await expect(runs.update(staff(gombe, 'supervisor'), { runId: run.id, removeTaskIds: [ids[0]] })).rejects.toThrow('This run has already left.');
      expect(await runs.isPlanned(run.id)).toBe(false);
      expect(await runs.forRider(riderG.id)).toHaveLength(1);

      // the driver taps one parcel on the road: the whole run is on the road
      await delivery.updateStatus(ids[0], 'in_transit', riderG.id);
      expect((await Promise.all(ids.map(fresh))).map((t) => t.status)).toEqual(ids.map(() => 'in_transit'));
      expect((await runs.list(staff(limete, 'operator'), { direction: 'in' }))[0]).toMatchObject({ inTransit: true, status: 'dispatched' });

      // the receiving warehouse scans part of it, then the rest
      await expect(runs.receive(staff(gombe, 'operator'), { runId: run.id })).rejects.toThrow('This parcel is not due at your warehouse.');
      const part = await runs.receive(staff(limete, 'operator'), { runId: run.id, taskIds: [ids[0], ids[1]] });
      expect(part).toMatchObject({ status: 'arrived', receivedCount: 2, count: 4 });
      expect((await tasksOf((await fresh(ids[0])).orderId)).map((t) => t.kind).sort()).toEqual(['delivery', 'pickup', 'transfer']); // the normal next-leg logic ran
      const all = await runs.receive(staff(limete, 'operator'), { runId: run.id });
      expect(all.receivedCount).toBe(4);
      const closed = await runs.close(staff(limete, 'supervisor'), { runId: run.id });
      expect(closed).toMatchObject({ status: 'closed', missingCount: 0 });
      expect(await ds.getRepository(WarehouseException).count()).toBe(0);
      await expect(runs.receive(staff(limete, 'operator'), { runId: run.id })).rejects.toThrow('This run is already closed.');
    });

    it('lets a parcel leave a planned run before it goes', async () => {
      const legs = await waiting(3);
      const run = await runs.create(staff(gombe, 'supervisor'), { toHubId: limete.id, taskIds: legs.map((t) => t.id) });
      await runs.assign(staff(gombe, 'supervisor'), { runId: run.id, riderId: riderG.id });
      const slim = await runs.update(staff(gombe, 'supervisor'), { runId: run.id, removeTaskIds: [legs[2].id] });
      expect(slim.count).toBe(2);
      expect(await fresh(legs[2].id)).toMatchObject({ runId: null, riderId: null, status: 'unassigned' });
      const back = await runs.update(staff(gombe, 'supervisor'), { runId: run.id, addTaskIds: [legs[2].id] });
      expect(back.count).toBe(3);
      expect(await fresh(legs[2].id)).toMatchObject({ riderId: riderG.id, status: 'assigned' }); // joining a run with a driver gives it to the driver
    });

    it('several drivers on one lane are several runs: split 4 into 2 + 2, two drivers, both dispatched and received', async () => {
      const legs = await waiting(4);
      const ids = legs.map((t) => t.id);
      const run = await runs.create(staff(gombe, 'supervisor'), { toHubId: limete.id, taskIds: ids });
      await runs.assign(staff(gombe, 'supervisor'), { runId: run.id, riderId: riderG.id });
      await expect(runs.split(staff(gombe, 'supervisor'), { runId: run.id, taskIds: ids })).rejects.toThrow('Choose some of the parcels of this run, not all of them.');
      await expect(runs.split(staff(gombe, 'supervisor'), { runId: run.id, taskIds: ['nope'] })).rejects.toThrow('Choose parcels of this run.');
      await expect(runs.split(staff(limete, 'supervisor'), { runId: run.id, taskIds: [ids[2]] })).rejects.toThrow('This task belongs to another warehouse.');
      const { original, created } = await runs.split(staff(gombe, 'supervisor'), { runId: run.id, taskIds: [ids[2], ids[3]] });
      expect([original.reference, original.count, original.riderId]).toEqual(['TR-0001', 2, riderG.id]);
      expect([created.reference, created.count, created.riderId, created.fromHubId, created.toHubId]).toEqual(['TR-0002', 2, null, gombe.id, limete.id]);
      expect(await fresh(ids[2])).toMatchObject({ runId: created.id, riderId: null, status: 'unassigned' });
      // each run has exactly one driver: the second one is the receiving warehouse's rider
      await expect(runs.dispatch(staff(gombe, 'supervisor'), { runId: created.id })).rejects.toThrow('Choose a driver for this run first.');
      await runs.assign(staff(gombe, 'supervisor'), { runId: created.id, riderId: riderL.id });
      await runs.dispatch(staff(gombe, 'supervisor'), { runId: run.id });
      await runs.dispatch(staff(gombe, 'supervisor'), { runId: created.id });
      expect((await Promise.all(ids.map(fresh))).map((t) => t.riderId)).toEqual([riderG.id, riderG.id, riderL.id, riderL.id]);
      await expect(runs.split(staff(gombe, 'supervisor'), { runId: run.id, taskIds: [ids[0]] })).rejects.toThrow('This run has already left.');
      // each driver reports their own run; the other is untouched
      await runs.markInTransit(created.id, riderL.id);
      expect((await Promise.all(ids.map(fresh))).map((t) => t.status)).toEqual(['picked_up', 'picked_up', 'in_transit', 'in_transit']);
      await expect(runs.markInTransit(created.id, riderG.id)).rejects.toThrow('Run not found.');
      // the receiving warehouse sees and receives each run separately
      const incoming = await runs.list(staff(limete, 'operator'), { direction: 'in', status: 'open' });
      expect(incoming.map((r) => r.reference).sort()).toEqual(['TR-0001', 'TR-0002']);
      expect((await runs.receive(staff(limete, 'operator'), { runId: run.id })).receivedCount).toBe(2);
      expect((await runs.receive(staff(limete, 'operator'), { runId: created.id })).receivedCount).toBe(2);
      expect((await Promise.all(ids.map(fresh))).every((t) => t.status === 'delivered')).toBe(true);
    });

    it('closing with parcels that never arrived turns them into exceptions and tells both warehouses and the admins', async () => {
      const legs = await waiting(3);
      const ids = legs.map((t) => t.id);
      const run = await runs.create(staff(gombe, 'supervisor'), { toHubId: limete.id, taskIds: ids });
      await runs.assign(staff(gombe, 'supervisor'), { runId: run.id, riderId: riderG.id });
      await expect(runs.close(staff(gombe, 'supervisor'), { runId: run.id })).rejects.toThrow('This run has not left yet.');
      await runs.dispatch(staff(gombe, 'supervisor'), { runId: run.id });
      await runs.receive(staff(limete, 'operator'), { runId: run.id, taskIds: [ids[0]] });
      await expect(runs.close(staff(limete, 'operator'), { runId: run.id })).rejects.toThrow('Only supervisors and managers can assign riders.');
      await expect(runs.close(staff(lubum, 'manager'), { runId: run.id })).rejects.toThrow('This task belongs to another warehouse.');
      notif.toAdmins.mockClear();
      notif.toUsers.mockClear();
      const closed = await runs.close(staff(limete, 'supervisor'), { runId: run.id });
      expect(closed).toMatchObject({ status: 'closed', count: 3, receivedCount: 1, missingCount: 2 });
      const missing = await Promise.all([ids[1], ids[2]].map(fresh));
      expect(missing.map((t) => [t.status, t.failureReason])).toEqual([['failed', 'Parcel missing from run TR-0001.'], ['failed', 'Parcel missing from run TR-0001.']]);
      const excs = await ds.getRepository(WarehouseException).find();
      expect(excs.map((e) => [e.type, e.severity, e.hubId, e.notes]).sort()).toEqual([
        ['missing_item', 'high', limete.id, 'Parcel missing from run TR-0001.'],
        ['missing_item', 'high', limete.id, 'Parcel missing from run TR-0001.'],
      ]);
      expect(notif.toAdmins).toHaveBeenCalledWith(expect.objectContaining({ title: 'Parcel missing from run', body: expect.stringContaining('2 parcels did not arrive') }));
      expect(notif.toUsers).toHaveBeenCalled();
      // closing twice is harmless
      expect((await runs.close(admin, { runId: run.id })).status).toBe('closed');
      expect(await ds.getRepository(WarehouseException).count()).toBe(2);
    });

    it('works for return transfers and for a hop of a multi-warehouse route', async () => {
      const order = await (async () => {
        const { order: o } = await place([sellerL]); // Limete seller -> Gombe customer
        await ds.getRepository(Order).update({ id: o.id }, { status: 'delivered' });
        return o;
      })();
      const ret = await logistics.createReturnPickup({ disputeId: 'dx', orderId: order.id });
      const r1 = await scan(ret.id, gombe.id);
      const back = r1.next[0];
      expect(back.kind).toBe('return_transfer');
      const run = await runs.create(staff(gombe, 'supervisor'), { toHubId: limete.id, taskIds: [back.id] });
      await runs.assign(staff(gombe, 'supervisor'), { runId: run.id, riderId: riderG.id });
      await runs.dispatch(staff(gombe, 'supervisor'), { runId: run.id });
      const done = await runs.receive(staff(limete, 'operator'), { runId: run.id });
      expect(done.receivedCount).toBe(1);
      expect((await tasksOf(order.id)).some((t) => t.kind === 'return_to_seller' && t.fromHubId === limete.id)).toBe(true);
    });
  });

  // The desk, the rider portal and the apps read the cargo of a leg in the viewer's language: the leg carries both names.
  describe('French names on the legs (the cargo of a task)', () => {
    let tr: TranslationService;
    beforeEach(() => {
      tr = testTranslations(ds);
      new OrderItemTranslationSubscriber(ds, tr); // registers itself on the data source, like TranslationModule does
    });
    const cargo = (t: DeliveryTask) => JSON.parse(t.itemsJson as string) as { orderItemId?: string; name: string; nameFr?: string; qty: number }[];
    const snapshotFr = (line: OrderItem, value: string) => tr.snapshot(ds.manager, [{ entityId: line.id, field: 'productName', locale: 'fr', value }]);

    it('a new pickup stores the French name next to the base name', async () => {
      const order = await mkOrder([sellerG]);
      await snapshotFr(order.items[0], 'Chose');
      const [pickup] = await logistics.planOrder(order);
      expect(cargo(pickup)).toEqual([expect.objectContaining({ orderItemId: order.items[0].id, name: 'Thing', nameFr: 'Chose', qty: 1 })]);
      expect((await logistics.view(pickup)).items[0]).toMatchObject({ name: 'Thing', nameFr: 'Chose' });
    });

    it('lines placed unsaved (as checkout passes them) are read back for their French name', async () => {
      const order = await mkOrder([sellerG]);
      await snapshotFr(order.items[0], 'Chose');
      const unsaved = { ...order, items: order.items.map((i) => ({ ...i, productNameFr: undefined })) } as Order;
      const [pickup] = await logistics.planOrder(unsaved);
      expect(cargo(pickup)[0].nameFr).toBe('Chose');
    });

    it('a leg made before the fix (no nameFr in its cargo) is served with the order line\'s French name', async () => {
      const { order } = await place([sellerG]);
      const [pickup] = await tasksOf(order.id);
      await snapshotFr(order.items[0], 'Chose');
      await ds.getRepository(DeliveryTask).update({ id: pickup.id }, { itemsJson: JSON.stringify([{ orderItemId: order.items[0].id, productId: order.items[0].productId, name: 'Thing', qty: 1 }]) });
      const old = (await ds.getRepository(DeliveryTask).findOne({ where: { id: pickup.id } }))!;
      expect(cargo(old)[0].nameFr).toBeUndefined(); // as stored
      expect((await logistics.view(old)).items[0]).toMatchObject({ name: 'Thing', nameFr: 'Chose' });
      expect((await logistics.viewMany([old], 'seller'))[0].items[0].nameFr).toBe('Chose');
    });

    it('a name carried without ids is matched by its name; one nothing can name keeps the base name', async () => {
      const { order } = await place([sellerG]);
      const [pickup] = await tasksOf(order.id);
      await snapshotFr(order.items[0], 'Chose');
      await ds.getRepository(DeliveryTask).update({ id: pickup.id }, { itemsJson: JSON.stringify([{ name: 'Thing', qty: 2 }, { name: 'Unknown gadget', qty: 1 }]) });
      const items = (await logistics.view((await ds.getRepository(DeliveryTask).findOne({ where: { id: pickup.id } }))!)).items;
      expect(items[0]).toMatchObject({ name: 'Thing', nameFr: 'Chose', qty: 2 });
      expect(items[1].name).toBe('Unknown gadget');
      expect(items[1].nameFr).toBeUndefined();
    });

    it('a broken or empty cargo is no cargo, not an error', async () => {
      const { order } = await place([sellerG]);
      const [pickup] = await tasksOf(order.id);
      for (const itemsJson of [null, '', 'not json', '{"a":1}']) {
        await ds.getRepository(DeliveryTask).update({ id: pickup.id }, { itemsJson });
        expect((await logistics.view((await ds.getRepository(DeliveryTask).findOne({ where: { id: pickup.id } }))!)).items).toEqual([]);
      }
    });

    it('the legs of a return and of a replacement carry it too', async () => {
      const { order } = await place([sellerG]);
      await ds.getRepository(Order).update({ id: order.id }, { status: 'delivered' });
      await snapshotFr(order.items[0], 'Chose');
      const ret = await logistics.createReturnPickup({ disputeId: 'dfr', orderId: order.id });
      expect(cargo(ret)[0]).toMatchObject({ name: 'Thing', nameFr: 'Chose' });
      await ds.getRepository('Replacement').save({ reference: 'REP-FR', orderId: order.id, orderReference: order.reference, customerId: 'cust1', customerName: 'M', sellerId: sellerG.id, sku: 'S', productName: 'Thing', qty: 1, status: 'approved' } as never);
      const rep = (await ds.getRepository('Replacement').findOne({ where: { reference: 'REP-FR' } })) as { id: string };
      const leg = await logistics.createReplacementDelivery({ replacementId: rep.id, orderId: order.id });
      expect(cargo(leg)[0]).toMatchObject({ name: 'Thing', nameFr: 'Chose' });
    });
  });

  describe('a rider switched off by an admin (staff:setActive)', () => {
    const MASINA_PIN = { lat: -4.37, lng: 15.395 };
    const roles = () => new RolesService(ds.getRepository(User), {} as never, emitter as never, ds.getRepository(Hub), ds.getRepository(DeliveryTask));
    const user = (id: string) => ds.getRepository(User).findOneOrFail({ where: { id } });
    /** A transfer leg Entrepôt Kinshasa -> Entrepôt Limete waiting for a driver. */
    const transferLeg = async () => {
      const { order } = await place([sellerG], { commune: 'Masina', pin: MASINA_PIN });
      const [pickup] = await tasksOf(order.id);
      return (await assignAndScan(pickup.id)).next[0];
    };

    it('switches a rider off and on: the flag, revoked sessions on the way off, and the admins and desks told', async () => {
      const before = (await user(riderL.id)).tokenVersion;
      emitter.toRoles.mockClear();
      const off = await roles().setStaffActive(riderL.id, false);
      expect(off).toMatchObject({ id: riderL.id, role: 'rider', active: false, hubId: limete.id, openTasks: 0 });
      const row = await user(riderL.id);
      expect(row.active).toBe(false);
      expect(row.tokenVersion).toBe(before + 1); // every token they hold stops working
      const sent = emitter.toRoles.mock.calls.map(([, ev, payload]) => [ev, payload]);
      expect(sent).toContainEqual(['roles:updated', { id: riderL.id, role: 'rider', active: false, hubId: limete.id, warehouseTier: null }]);
      expect(sent.some(([ev]) => ev === 'hub:updated')).toBe(true); // the directory's rider count follows
      // the broadcast carries no name or e-mail
      expect(JSON.stringify(sent)).not.toContain(row.email);

      const on = await roles().setStaffActive(riderL.id, true);
      expect(on.active).toBe(true);
      const back = await user(riderL.id);
      expect(back.active).toBe(true);
      expect(back.tokenVersion).toBe(before + 1); // switching on needs no new revocation
    });

    it('counts the rider\'s open tasks, which stay assigned for the desk to hand over', async () => {
      const leg = await transferLeg();
      await logistics.assign(leg.id, riderG.id, admin);
      const done = await roles().setStaffActive(riderG.id, false);
      expect(done.openTasks).toBe(1);
      expect(await ds.getRepository(DeliveryTask).findOneOrFail({ where: { id: leg.id } })).toMatchObject({ riderId: riderG.id, status: 'assigned' });
      // the desk gives it to a rider who is on
      const other = await mkUser('rider', gombe.id);
      expect(await logistics.assign(leg.id, other.id, admin)).toMatchObject({ riderId: other.id });
    });

    it('only riders and warehouse staff can be switched here (not customers, not other admins), and the account must exist', async () => {
      const customer = await mkUser('customer', null);
      const adminUser = await mkUser('admin_support', null);
      await expect(roles().setStaffActive(customer.id, false)).rejects.toThrow('Only riders and warehouse staff can be switched on or off here.');
      await expect(roles().setStaffActive(adminUser.id, false)).rejects.toThrow('Only riders and warehouse staff can be switched on or off here.');
      await expect(roles().setStaffActive('nope', false)).rejects.toThrow('Account not found.');
      expect((await user(customer.id)).active).toBe(true);
      const staffUser = await mkUser('warehouse_staff', limete.id, { warehouseTier: 'operator' });
      expect(await roles().setStaffActive(staffUser.id, false)).toMatchObject({ role: 'warehouse_staff', active: false, warehouseTier: 'operator' });
      expect(await logistics.staffIds(limete.id)).not.toContain(staffUser.id); // no notices for a switched-off employee
    });

    it('UC-8: the warehouse whose only rider is switched off has no rider, so the nearest staffed warehouse stands in', async () => {
      expect((await routing.hubsWithRiders()).find((h) => h.id === limete.id)?.activeRiders).toBe(1);
      expect(await routing.route({ geo: LIMETE_PIN, commune: 'Limete', sellerIds: [] })).toMatchObject({ destinationHubId: limete.id, fallback: null });
      await roles().setStaffActive(riderL.id, false);
      expect((await routing.hubsWithRiders()).find((h) => h.id === limete.id)?.activeRiders).toBe(0);
      expect(await routing.route({ geo: LIMETE_PIN, commune: 'Limete', sellerIds: [] })).toMatchObject({ destinationHubId: gombe.id, fallback: 'city', coveringHubId: limete.id, coveringHubName: 'Entrepôt Limete' });
      // a placed order is planned at the stand-in, and the pickup of a Limete seller is collected by it too
      const { order } = await place([sellerL], { commune: 'Limete', pin: LIMETE_PIN });
      expect(order.destinationHubId).toBe(gombe.id);
      expect((await tasksOf(order.id))[0]).toMatchObject({ kind: 'pickup', hubId: gombe.id });
      await roles().setStaffActive(riderL.id, true);
      expect(await routing.route({ geo: LIMETE_PIN, commune: 'Limete', sellerIds: [] })).toMatchObject({ destinationHubId: limete.id, fallback: null });
    });

    it('a switched-off rider is offered by no driver list and cannot be given a task or a run', async () => {
      const leg = await transferLeg(); // Kinshasa -> Limete: either end's riders may drive it
      const riders = new RiderService(ds.getRepository(DeliveryTask), ds.getRepository(Order), ds.getRepository(User), ds.getRepository(Hub), logistics);
      expect((await logistics.ridersFor(leg)).map((r) => r.id).sort()).toEqual([riderG.id, riderL.id].sort());
      expect((await riders.activeRiders(limete.id)).map((r) => r.id)).toEqual([riderL.id]);
      await roles().setStaffActive(riderL.id, false);
      expect((await logistics.ridersFor(leg)).map((r) => r.id)).toEqual([riderG.id]); // logistics:riders
      expect(await riders.activeRiders(limete.id)).toEqual([]); // warehouse:riders
      expect((await riders.activeRiders()).map((r) => r.id)).not.toContain(riderL.id);
      await expect(logistics.assign(leg.id, riderL.id, admin)).rejects.toThrow('Choose an active rider.');
      const run = await runs.create(staff(gombe, 'supervisor'), { toHubId: limete.id, taskIds: [leg.id] });
      await expect(runs.assign(staff(gombe, 'supervisor'), { runId: run.id, riderId: riderL.id })).rejects.toThrow('Choose an active rider.');
      expect(await runs.assign(staff(gombe, 'supervisor'), { runId: run.id, riderId: riderG.id })).toMatchObject({ riderId: riderG.id });
      await roles().setStaffActive(riderL.id, true);
      expect((await logistics.ridersFor(leg)).map((r) => r.id).sort()).toEqual([riderG.id, riderL.id].sort());
    });

    it('a switched-off rider, warehouse employee, customer or seller gets no new session; the other admin roles are not affected', () => {
      const guard = Object.create(AuthService.prototype) as AuthService;
      for (const role of ['rider', 'warehouse_staff', 'customer', 'seller'] as const) {
        expect(() => guard.assertNotSuspended({ role, active: false } as User)).toThrow('This account has been suspended. Contact support.');
        expect(() => guard.assertNotSuspended({ role, active: true } as User)).not.toThrow();
      }
      expect(() => guard.assertNotSuspended({ role: 'admin_support', active: false } as User)).not.toThrow();
    });
  });
});
