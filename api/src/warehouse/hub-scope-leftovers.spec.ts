import { DataSource, DeepPartial } from 'typeorm';
import { DeliveryTask, ENTITIES, Hub, Order, OrderItem, Product, WarehouseException } from '../database/entities';
import { hubsOfOrder, orderHubParams, pushOrderToOps } from '../logistics/hub-scope';
import { OrdersService } from '../orders/orders.service';
import { recordingEmitter } from '../testing/test-db';
import { WarehouseService } from './warehouse.service';

/**
 * A warehouse's staff see their own warehouse's orders, incidents and parcels' products and nobody else's; admins see
 * everything. (The gateway passes the staff member's warehouse; these tests drive the services the way it does.)
 */
describe('hub scoping of orders, incidents and inventory', () => {
  let ds: DataSource;
  let emitter: ReturnType<typeof recordingEmitter>;
  let warehouse: WarehouseService;
  let orders: OrdersService;
  let gombe: Hub;
  let limete: Hub;
  let paris: Hub;
  let seq = 0;

  const mkHub = (name: string) => ds.getRepository(Hub).save(ds.getRepository(Hub).create({ name, city: 'X', lat: -4.3, lng: 15.3 }));
  const mkOrder = (o: Partial<Order>) =>
    ds.getRepository(Order).save(ds.getRepository(Order).create({ reference: `SOM-${++seq}`, customerId: 'c', customerName: 'C', status: 'confirmed', ...o }));
  const mkProduct = (name: string, stock: number) => ds.getRepository(Product).save(ds.getRepository(Product).create({ name, price: 5, stock, status: 'live' } as DeepPartial<Product>));
  const line = (orderId: string, p: Product, qty: number) =>
    ds.getRepository(OrderItem).save(ds.getRepository(OrderItem).create({ orderId, productId: p.id, productName: p.name, qty, priceUsd: 5 } as DeepPartial<OrderItem>));

  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true });
    await ds.initialize();
    emitter = recordingEmitter();
    [gombe, limete, paris] = [await mkHub('Gombe'), await mkHub('Limete'), await mkHub('Paris')];
    const noop = { registerFanout: () => undefined, registerUserView: () => undefined, registerOrderSettledHandler: () => undefined, registerFailedHandler: () => undefined };
    orders = new OrdersService(ds.getRepository(Order) as never, {} as never, {} as never, noop as never, {} as never, {} as never, noop as never, noop as never, {} as never, {} as never, {} as never, ds.getRepository(Hub));
    // The warehouse service's custody view comes from the logistics service: serve it from the delivery tasks here.
    const logistics = {
      custody: async (hubId: string) => {
        const t = await ds.getRepository(DeliveryTask).find({ where: [{ toHubId: hubId }, { fromHubId: hubId }] });
        return { inbound: t.filter((x) => x.toHubId === hubId), onHand: [] as DeliveryTask[], outbound: t.filter((x) => x.fromHubId === hubId) };
      },
    };
    const productsSvc = { describe: async (rows: Product[]) => new Map(rows.map((p) => [p.id, { name: p.name, nameFr: `${p.name} FR`, category: 'Cat', categoryFr: 'Cat FR' }])) };
    warehouse = new WarehouseService(
      ds.getRepository(Hub),
      {} as never,
      {} as never,
      ds.getRepository(DeliveryTask),
      ds.getRepository(Product),
      ds.getRepository(Order),
      ds.getRepository(WarehouseException),
      emitter as never,
      {} as never,
      productsSvc as never,
      {} as never,
      logistics as never,
    );
  });
  afterEach(async () => ds.destroy());

  describe('orders', () => {
    it('finds the warehouses an order concerns: where it is delivered and where each seller\'s parcel is collected', () => {
      expect(hubsOfOrder({ destinationHubId: 'd', originHubIds: ['o1', 'o2', 'd'] }).sort()).toEqual(['d', 'o1', 'o2']);
      expect(hubsOfOrder({ destinationHubId: null, originHubIds: null })).toEqual([]);
      expect(hubsOfOrder({})).toEqual([]);
    });

    it('orders:list for a warehouse = its destination orders + the orders it collects for, newest first; admins see all', async () => {
      const a = await mkOrder({ destinationHubId: gombe.id, originHubIds: [limete.id] });
      const b = await mkOrder({ destinationHubId: limete.id, originHubIds: [limete.id] });
      const c = await mkOrder({ destinationHubId: paris.id, originHubIds: [paris.id, gombe.id] });
      const d = await mkOrder({ destinationHubId: paris.id, originHubIds: [paris.id] });
      const legacy = await mkOrder({ destinationHubId: null, originHubIds: null });
      const staff = { id: 's', role: 'warehouse_staff' };
      const ids = async (hub: string | null, paging?: unknown) => ((await orders.list(staff, undefined, paging, hub)) as Order[]).map((o) => o.id).sort();
      expect(await ids(gombe.id)).toEqual([a.id, c.id].sort());
      expect(await ids(limete.id)).toEqual([a.id, b.id].sort());
      expect(await ids(paris.id)).toEqual([c.id, d.id].sort());
      expect(await ids(null)).toEqual([a.id, b.id, c.id, d.id, legacy.id].sort());
      expect((await orders.list({ id: 'adm', role: 'admin_operations' }, undefined, undefined, null)) as Order[]).toHaveLength(5);
      expect(await ids(gombe.id, { limit: 1 })).toHaveLength(1);
      // A hub id with LIKE wildcards in it matches nothing but itself.
      expect(await ids('%')).toEqual([]);
      expect(orderHubParams('ab%c').scopeHubLike).toBe('%"abc"%');
    });

    it('returns the lines of each order, as before', async () => {
      const p = await mkProduct('Lamp', 5);
      const o = await mkOrder({ destinationHubId: gombe.id });
      await line(o.id, p, 2);
      const [row] = (await orders.list({ id: 's', role: 'warehouse_staff' }, undefined, undefined, gombe.id)) as Order[];
      expect(row.items.map((i) => i.productName)).toEqual(['Lamp']);
    });

    it('the customer\'s order carries the journey (legs with rider first name and warehouse names) and the hub names', async () => {
      const o = await mkOrder({ customerId: 'c1', destinationHubId: gombe.id, originHubIds: [limete.id] });
      const rider = await ds.getRepository('User').save(ds.getRepository('User').create({ emailHash: 'r', email: 'r@x.y', passwordHash: 'x', name: 'Rita Rider', role: 'rider', phone: '+243900000009' } as never)) as unknown as { id: string };
      const tasks = ds.getRepository(DeliveryTask);
      await tasks.save(tasks.create({ orderId: o.id, orderReference: o.reference, kind: 'pickup', status: 'delivered', toHubId: limete.id, riderId: rider.id }));
      await tasks.save(tasks.create({ orderId: o.id, orderReference: o.reference, kind: 'transfer', status: 'in_transit', fromHubId: limete.id, toHubId: gombe.id }));
      const [v] = await orders.customerViews([await ds.getRepository(Order).findOneByOrFail({ id: o.id })]);
      expect(v.hubs).toEqual({ destination: { id: gombe.id, name: 'Gombe', city: 'X' }, origins: [{ id: limete.id, name: 'Limete', city: 'X' }], bySeller: {} });
      expect(v.tracking?.legs.map((l) => [l.kind, l.status, l.riderFirstName, l.fromHub?.name ?? null, l.toHub?.name ?? null])).toEqual([
        ['pickup', 'delivered', 'Rita', null, 'Limete'],
        ['transfer', 'in_transit', null, 'Limete', 'Gombe'],
      ]);
      expect(v.tracking).toMatchObject({ currentLeg: 'transfer', carrier: 'Somba&Teka' });
      expect(JSON.stringify(v.tracking)).not.toContain('+2439'); // no contact in the journey
      // No tasks yet: tracking is null, names still there. Several orders at once each get their own.
      const bare = await mkOrder({ customerId: 'c1', destinationHubId: paris.id, originHubIds: [] });
      const both = await orders.customerViews([bare, await ds.getRepository(Order).findOneByOrFail({ id: o.id })]);
      expect(both[0].tracking).toBeNull();
      expect(both[0].hubs.destination?.name).toBe('Paris');
      expect(both[1].tracking?.legs).toHaveLength(2);
      expect(await orders.customerViews([])).toEqual([]);
    });

    it('says which seller goes to which warehouse (origins has no line order): stored map, or the pickup legs for older orders', async () => {
      const stored = await mkOrder({ destinationHubId: paris.id, originHubIds: [limete.id, gombe.id], originBySeller: { sellerA: gombe.id, sellerB: limete.id } });
      const legacy = await mkOrder({ destinationHubId: paris.id, originHubIds: [limete.id, gombe.id], originBySeller: null });
      const tasks = ds.getRepository(DeliveryTask);
      await tasks.save(tasks.create({ orderId: legacy.id, orderReference: legacy.reference, kind: 'pickup', status: 'assigned', sellerId: 'sellerB', toHubId: limete.id }));
      await tasks.save(tasks.create({ orderId: legacy.id, orderReference: legacy.reference, kind: 'pickup', status: 'assigned', sellerId: 'sellerA', toHubId: gombe.id }));
      const [a, b] = await orders.customerViews([await ds.getRepository(Order).findOneByOrFail({ id: stored.id }), await ds.getRepository(Order).findOneByOrFail({ id: legacy.id })]);
      const names = (v: typeof a) => Object.fromEntries(Object.entries(v.hubs.bySeller).map(([k, h]) => [k, h.name]));
      expect(names(a)).toEqual({ sellerA: 'Gombe', sellerB: 'Limete' });
      expect(names(b)).toEqual({ sellerA: 'Gombe', sellerB: 'Limete' });
      expect(a.originBySeller).toEqual({ sellerA: gombe.id, sellerB: limete.id }); // the raw order (ops, staff) carries it too
    });

    it('order pushes go to the admins and the warehouses of that order, never to every warehouse', () => {
      pushOrderToOps(emitter as never, ['admin', 'admin_operations'], 'order:updated', { destinationHubId: 'd', originHubIds: ['o', 'd'] });
      expect(emitter.sent.map((e) => [e.to, e.event])).toEqual([
        ['admin,admin_operations', 'order:updated'],
        ['hub:d', 'order:updated'],
        ['hub:o', 'order:updated'],
      ]);
      emitter.sent.length = 0;
      pushOrderToOps(emitter as never, ['admin'], 'order:created', { destinationHubId: null, originHubIds: null });
      expect(emitter.sent.map((e) => e.to)).toEqual(['admin']);
    });
  });

  describe('exceptions', () => {
    const raise = (hubId: string | null, over: Record<string, unknown> = {}) =>
      warehouse.createException('Staff', { notes: 'Box crushed on arrival', ...over }, hubId);

    it('an incident raised by staff belongs to their warehouse, whatever hub name they typed', async () => {
      const e = await raise(gombe.id, { hub: 'Limete' });
      expect(e).toMatchObject({ hubId: gombe.id, hub: 'Gombe' });
    });

    it('an admin names the hub, or the parcel decides', async () => {
      expect(await raise(null, { hub: 'limete' })).toMatchObject({ hubId: limete.id, hub: 'Limete' });
      const t = await ds.getRepository(DeliveryTask).save(ds.getRepository(DeliveryTask).create({ orderId: 'o', orderReference: 'SOM-1', status: 'assigned', kind: 'delivery', hubId: paris.id }));
      expect(await raise(null, { taskId: t.id })).toMatchObject({ hubId: paris.id });
      expect(await raise(null, { hub: 'Nowhere' })).toMatchObject({ hubId: null, hub: 'Nowhere' });
    });

    it('staff cannot raise an incident on another warehouse\'s parcel', async () => {
      const t = await ds.getRepository(DeliveryTask).save(ds.getRepository(DeliveryTask).create({ orderId: 'o', orderReference: 'SOM-1', status: 'assigned', kind: 'delivery', hubId: paris.id, fromHubId: paris.id, toHubId: limete.id }));
      await expect(raise(gombe.id, { taskId: t.id })).rejects.toThrow('That parcel belongs to another warehouse.');
      expect(await raise(limete.id, { taskId: t.id })).toMatchObject({ hubId: limete.id }); // the receiving end may
    });

    it('exceptions:list shows staff their warehouse\'s incidents only; admins all; status filters still work', async () => {
      const a = await raise(gombe.id);
      const b = await raise(limete.id);
      const c = await raise(null);
      await warehouse.setExceptionStatus(a.id, 'resolved', 'ok', gombe.id);
      const ids = async (status?: string, hub?: string | null) => (await warehouse.listExceptions(status, hub)).map((e) => e.id).sort();
      expect(await ids(undefined, gombe.id)).toEqual([a.id]);
      expect(await ids(undefined, limete.id)).toEqual([b.id]);
      expect(await ids(undefined, null)).toEqual([a.id, b.id, c.id].sort());
      expect(await ids('open', gombe.id)).toEqual([]);
      expect(await ids('resolved', gombe.id)).toEqual([a.id]);
      expect(await ids('all', limete.id)).toEqual([b.id]);
    });

    it('staff cannot change another warehouse\'s incident (it looks like it does not exist), admins can', async () => {
      const b = await raise(limete.id);
      await expect(warehouse.setExceptionStatus(b.id, 'resolved', 'x', gombe.id)).rejects.toThrow('Exception not found.');
      expect((await ds.getRepository(WarehouseException).findOneByOrFail({ id: b.id })).status).toBe('open');
      expect((await warehouse.setExceptionStatus(b.id, 'investigating', undefined, limete.id)).status).toBe('investigating');
      expect((await warehouse.setExceptionStatus(b.id, 'resolved', 'fixed', null)).status).toBe('resolved');
    });

    it('incident pushes reach the admins and that warehouse\'s staff only', async () => {
      emitter.sent.length = 0;
      const a = await raise(gombe.id);
      await warehouse.setExceptionStatus(a.id, 'escalated', undefined, gombe.id);
      expect(emitter.sent.filter((e) => e.event === 'exception:updated').map((e) => e.to.startsWith('hub:') ? e.to : 'admins')).toEqual(['admins', `hub:${gombe.id}`, 'admins', `hub:${gombe.id}`]);
      emitter.sent.length = 0;
      await raise(null, { notes: 'No warehouse for this one' });
      expect(emitter.sent.map((e) => e.to.startsWith('hub:'))).toEqual([false]);
    });
  });

  describe('inventory', () => {
    it('staff see the products of the parcels in their warehouse\'s custody, with the units; admins see every product', async () => {
      const lamp = await mkProduct('Lamp', 4);
      const chair = await mkProduct('Chair', 0);
      const desk = await mkProduct('Desk', 50);
      const o1 = await mkOrder({ destinationHubId: gombe.id });
      const o2 = await mkOrder({ destinationHubId: limete.id });
      await line(o1.id, lamp, 3);
      await line(o1.id, chair, 1);
      await line(o2.id, desk, 2);
      await ds.getRepository(DeliveryTask).save(ds.getRepository(DeliveryTask).create({ orderId: o1.id, orderReference: o1.reference, status: 'assigned', kind: 'transfer', toHubId: gombe.id, fromHubId: paris.id }));
      await ds.getRepository(DeliveryTask).save(ds.getRepository(DeliveryTask).create({ orderId: o2.id, orderReference: o2.reference, status: 'assigned', kind: 'delivery', fromHubId: limete.id }));
      const gombeRows = (await warehouse.inventory(undefined, gombe.id)) as { name: string; custodyQty: number; stock: number; status: string }[];
      expect(gombeRows.map((r) => [r.name, r.custodyQty]).sort()).toEqual([['Chair', 1], ['Lamp', 3]]);
      expect(gombeRows.find((r) => r.name === 'Chair')).toMatchObject({ stock: 0, status: 'out' });
      expect(((await warehouse.inventory(undefined, limete.id)) as { name: string }[]).map((r) => r.name)).toEqual(['Desk']);
      expect(await warehouse.inventory(undefined, paris.id)).toHaveLength(2); // the sending end of the transfer
      const all = (await warehouse.inventory(undefined, null)) as { name: string; custodyQty?: number }[];
      expect(all.map((r) => r.name).sort()).toEqual(['Chair', 'Desk', 'Lamp']);
      expect(all.every((r) => r.custodyQty === undefined)).toBe(true);
    });

    it('a warehouse with nothing in custody has an empty inventory', async () => {
      await mkProduct('Lamp', 4);
      expect(await warehouse.inventory(undefined, gombe.id)).toEqual([]);
    });
  });
});
