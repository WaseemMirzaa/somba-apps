import { DataSource } from 'typeorm';
import { ParcelGroup, ParcelGroupOrder } from '../database/entities';
import { AuditLog, DeliveryKind, DeliveryStatus, DeliveryTask, ENTITIES, Hub, Order, OrderItem, Parcel, ParcelScan, Product, Seller, TransferRun, User, WarehouseException } from '../database/entities';
import { DeliveryService } from '../delivery/delivery.service';
import { recordingEmitter } from '../testing/test-db';
import { withOrderLocks } from '../common/order-lock';
import { Actor, LogisticsService } from './logistics.service';
import { ParcelsService } from './parcels.service';
import { RunsService } from './runs.service';
import { BOXES_LOCKED } from './parcel-rules';

/** Parcel labels and scans on a real in-memory schema: boxes, scanning, the enforcement of the leg moves (setting on and off), staff and returns. */
describe('parcels', () => {
  let ds: DataSource;
  let parcels: ParcelsService;
  let logistics: LogisticsService;
  let delivery: DeliveryService;
  let runs: RunsService;
  let hubA: Hub;
  let hubB: Hub;
  let rider: User;
  let rider2: User;
  let op: User;
  let sup: User;
  let seq = 0;
  let setting: string | null = null; // requireParcelScan
  const emitter = recordingEmitter();
  const notif = { toUser: jest.fn(async () => undefined), toUsers: jest.fn(async () => undefined), toAdmins: jest.fn(async () => undefined) };
  const settings = { get: async (k: string) => (k === 'requireParcelScan' ? setting : null) };

  const mkUser = (role: User['role'], hubId: string | null, extra: Partial<User> = {}) => {
    const n = ++seq;
    return ds.getRepository(User).save(ds.getRepository(User).create({ emailHash: `h${n}`, email: `u${n}@t.test`, passwordHash: 'x', name: `${role}${n}`, role, hubId, ...extra }));
  };
  const mkTask = (over: Partial<DeliveryTask> = {}) =>
    ds.getRepository(DeliveryTask).save(ds.getRepository(DeliveryTask).create({ orderId: 'o1', orderReference: 'SOM-1', kind: 'pickup' as DeliveryKind, status: 'assigned' as DeliveryStatus, riderId: rider.id, sellerId: 's1', hubId: hubA.id, toHubId: hubA.id, ...over }));
  const staff = (u: User): Actor => ({ id: u.id, role: u.role, name: u.name, hubId: u.hubId, tier: u.warehouseTier });
  const codes = async (orderId = 'o1') => (await parcels.activeFor(orderId, ['s1'])).map((p) => p.code);
  const status = async (id: string) => (await ds.getRepository(DeliveryTask).findOneByOrFail({ id })).status;
  const scan = (taskId: string, code: string, stage: 'pickup' | 'dropoff' = 'pickup', by = rider.id, extra: Record<string, unknown> = {}) => parcels.riderScan(by, { taskId, code, stage, ...extra });

  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true });
    await ds.initialize();
    setting = null;
    hubA = await ds.getRepository(Hub).save(ds.getRepository(Hub).create({ name: 'A', city: 'Kinshasa', country: 'CD', lat: -4.3, lng: 15.3 }));
    hubB = await ds.getRepository(Hub).save(ds.getRepository(Hub).create({ name: 'B', city: 'Kinshasa', country: 'CD', lat: -4.4, lng: 15.4 }));
    rider = await mkUser('rider', hubA.id);
    rider2 = await mkUser('rider', hubA.id);
    op = await mkUser('warehouse_staff', hubA.id, { warehouseTier: 'operator' });
    sup = await mkUser('warehouse_staff', hubA.id, { warehouseTier: 'supervisor' });
    parcels = new ParcelsService(ds.getRepository(Parcel), ds.getRepository(ParcelScan), ds.getRepository(DeliveryTask), ds.getRepository(Order), ds.getRepository(OrderItem), ds.getRepository(Seller), ds.getRepository(AuditLog), settings as never, emitter as never);
    logistics = new LogisticsService(ds.getRepository(DeliveryTask), ds.getRepository(Order), ds.getRepository(OrderItem), ds.getRepository(Hub), ds.getRepository(User), ds.getRepository(Seller), ds.getRepository(Product), ds.getRepository(AuditLog), {} as never, {} as never, notif as never, emitter as never, settings as never, undefined, undefined, parcels);
    runs = new RunsService(ds.getRepository(TransferRun), ds.getRepository(DeliveryTask), ds.getRepository(User), ds.getRepository(Hub), ds.getRepository(WarehouseException), ds.getRepository(AuditLog), logistics, notif as never, emitter as never, parcels);
    delivery = new DeliveryService(ds.getRepository(DeliveryTask), ds.getRepository(Order), emitter as never, settings as never, logistics, runs, parcels);
  });
  afterEach(async () => ds.destroy());

  describe('boxes', () => {
    it('make one label per box, numbered "n of count", with a unique code each', async () => {
      const made = await parcels.ensureBoxes('o1', 's1', 3);
      expect(made.map((p) => `${p.boxNo}/${p.boxCount}`)).toEqual(['1/3', '2/3', '3/3']);
      expect(new Set(made.map((p) => p.code)).size).toBe(3);
      expect((await parcels.ensureBoxes('o1', 's1', 3)).map((p) => p.code)).toEqual(made.map((p) => p.code)); // idempotent
      expect((await parcels.ensureBoxes('o1', 's1')).length).toBe(3); // no count keeps what exists
    });
    it('default to one box', async () => {
      expect((await parcels.ensureBoxes('o1', 's1')).length).toBe(1);
    });
    it('refuse 0, 21 and fractions', async () => {
      for (const bad of [0, 21, 2.5]) await expect(parcels.ensureBoxes('o1', 's1', bad)).rejects.toThrow(/1 to 20/);
    });
    it('can change before the first pickup scan: the old labels are void and say so', async () => {
      const first = await parcels.ensureBoxes('o1', 's1', 2);
      const second = await parcels.ensureBoxes('o1', 's1', 3);
      expect(second.length).toBe(3);
      expect(second.map((p) => p.code)).not.toEqual(expect.arrayContaining([first[0].code]));
      expect((await ds.getRepository(Parcel).findOneByOrFail({ id: first[0].id })).voidedAt).not.toBeNull();
      const t = await mkTask();
      await expect(scan(t.id, first[0].code)).rejects.toThrow(`${first[0].code} was cancelled; use the new label.`);
    });
    it('are locked after a pickup scan: the count cannot change any more', async () => {
      const made = await parcels.ensureBoxes('o1', 's1', 2);
      const t = await mkTask();
      await scan(t.id, made[0].code);
      await expect(parcels.ensureBoxes('o1', 's1', 3)).rejects.toThrow(BOXES_LOCKED);
      expect((await parcels.ensureBoxes('o1', 's1', 2)).length).toBe(2); // the same count is no change
      expect((await codes()).length).toBe(2);
    });
  });

  describe('the rider scanning', () => {
    it('ticks the checklist box by box and says how many are scanned', async () => {
      const [a, b] = await parcels.ensureBoxes('o1', 's1', 2);
      const t = await mkTask();
      const one = await scan(t.id, a.code);
      expect(one).toMatchObject({ scanned: 1, total: 2, pickupComplete: false, dropoffComplete: false, already: false, stage: 'pickup' });
      expect(one.parcels.map((p) => [p.code, p.boxNo, p.boxCount, !!p.pickupScannedAt])).toEqual([[a.code, 1, 2, true], [b.code, 2, 2, false]]);
      expect(await scan(t.id, b.code)).toMatchObject({ scanned: 2, total: 2, pickupComplete: true });
    });
    it('accepts a code in any case and without the dash', async () => {
      const [a] = await parcels.ensureBoxes('o1', 's1', 1);
      const t = await mkTask();
      expect(await scan(t.id, a.code.toLowerCase().replace('-', ' '))).toMatchObject({ scanned: 1 });
    });
    it('is idempotent for a repeat of the same scan by the same rider', async () => {
      const [a] = await parcels.ensureBoxes('o1', 's1', 1);
      const t = await mkTask();
      await scan(t.id, a.code);
      expect(await scan(t.id, a.code)).toMatchObject({ already: true, scanned: 1 });
      expect(await ds.getRepository(ParcelScan).count()).toBe(1);
    });
    it('refuses a box someone else already scanned on this leg and stage', async () => {
      const [a] = await parcels.ensureBoxes('o1', 's1', 1);
      const t = await mkTask();
      await parcels.markByHand(staff(sup), { taskId: t.id, code: a.code, stage: 'pickup', reason: 'label torn' }, () => true);
      await expect(scan(t.id, a.code)).rejects.toThrow(`${a.code} was already scanned.`);
    });
    it('refuses a code that is not part of the leg, a code nobody made and text that is not a code', async () => {
      const [a] = await parcels.ensureBoxes('o1', 's1', 1);
      const [other] = await parcels.ensureBoxes('o2', 's9', 1);
      const t = await mkTask();
      await expect(scan(t.id, other.code)).rejects.toThrow(`${other.code} is not part of this pickup.`);
      await expect(scan(t.id, 'PKG-ZZZZZZZZ')).rejects.toThrow('PKG-ZZZZZZZZ is not part of this pickup.');
      await expect(scan(t.id, 'hello')).rejects.toThrow(/not a KOMORIKO parcel code/);
      await expect(parcels.riderScan(rider.id, { taskId: t.id, code: a.code, stage: 'later' })).rejects.toThrow(/pickup or dropoff/);
    });
    it('refuses a leg that is not theirs or is closed, with the same answer for a missing leg', async () => {
      const [a] = await parcels.ensureBoxes('o1', 's1', 1);
      const t = await mkTask();
      await expect(scan(t.id, a.code, 'pickup', rider2.id)).rejects.toThrow('Delivery task not found.');
      await expect(scan('nope', a.code)).rejects.toThrow('Delivery task not found.');
      await ds.getRepository(DeliveryTask).update({ id: t.id }, { status: 'delivered' });
      await expect(scan(t.id, a.code)).rejects.toThrow(/already closed/);
    });
    it('can only drop a box off after the leg was picked up', async () => {
      const [a] = await parcels.ensureBoxes('o1', 's1', 1);
      const t = await mkTask();
      await expect(scan(t.id, a.code, 'dropoff')).rejects.toThrow(/not picked up yet/);
      await ds.getRepository(DeliveryTask).update({ id: t.id }, { status: 'picked_up' });
      expect(await scan(t.id, a.code, 'dropoff')).toMatchObject({ dropoffComplete: true });
    });
    it('records a typed code as manual', async () => {
      const [a] = await parcels.ensureBoxes('o1', 's1', 1);
      const t = await mkTask();
      await scan(t.id, a.code, 'pickup', rider.id, { manual: true });
      expect((await ds.getRepository(ParcelScan).findOneByOrFail({ taskId: t.id })).manual).toBe(true);
    });
    it('counts a delivery by its sellers: another seller\'s box is refused on it', async () => {
      const [mine] = await parcels.ensureBoxes('o1', 's1', 1);
      const [theirs] = await parcels.ensureBoxes('o1', 's2', 1);
      const t = await mkTask({ kind: 'delivery', status: 'in_transit', sellerId: null, sellerIds: ['s1'] });
      expect(await scan(t.id, mine.code, 'dropoff')).toMatchObject({ total: 1 });
      await expect(scan(t.id, theirs.code, 'dropoff')).rejects.toThrow(`${theirs.code} is not part of this delivery.`);
    });
  });

  describe('the rider moving a leg (requireParcelScan on, the default)', () => {
    it('cannot pick up before every box is scanned: "Scan every parcel first: 1 of 2 scanned."', async () => {
      const [a, b] = await parcels.ensureBoxes('o1', 's1', 2);
      const t = await mkTask();
      await expect(delivery.updateStatus(t.id, 'picked_up', rider.id)).rejects.toThrow('Scan every parcel first: 0 of 2 scanned.');
      await scan(t.id, a.code);
      await expect(delivery.updateStatus(t.id, 'picked_up', rider.id)).rejects.toThrow('Scan every parcel first: 1 of 2 scanned.');
      expect(await status(t.id)).toBe('assigned');
      await scan(t.id, b.code);
      expect((await delivery.updateStatus(t.id, 'picked_up', rider.id)).status).toBe('picked_up');
    });
    it('cannot hand a customer leg over before every box is scanned, and the refusal comes before the delivery code', async () => {
      const [a, b] = await parcels.ensureBoxes('o1', 's1', 2);
      const t = await mkTask({ kind: 'express', status: 'in_transit', sellerId: 's1' });
      await expect(delivery.updateStatus(t.id, 'delivered', rider.id, undefined, '1234')).rejects.toThrow('Scan every parcel first: 0 of 2 scanned.');
      await scan(t.id, a.code, 'dropoff');
      await expect(delivery.updateStatus(t.id, 'delivered', rider.id)).rejects.toThrow('Scan every parcel first: 1 of 2 scanned.');
      await scan(t.id, b.code, 'dropoff');
      expect((await delivery.updateStatus(t.id, 'delivered', rider.id)).status).toBe('delivered');
    });
    it('pickup scans do not count for the drop-off: each stage and each leg has its own scans', async () => {
      const [a] = await parcels.ensureBoxes('o1', 's1', 1);
      const t = await mkTask({ kind: 'express', status: 'assigned', sellerId: 's1' });
      await scan(t.id, a.code);
      await delivery.updateStatus(t.id, 'picked_up', rider.id);
      await delivery.updateStatus(t.id, 'in_transit', rider.id);
      await expect(delivery.updateStatus(t.id, 'delivered', rider.id)).rejects.toThrow('Scan every parcel first: 0 of 1 scanned.');
    });
    it('is not blocked on a leg with no labelled parcel (an order from before labels)', async () => {
      const t = await mkTask({ orderId: 'old', sellerId: 's7' });
      expect((await delivery.updateStatus(t.id, 'picked_up', rider.id)).status).toBe('picked_up');
    });
    it('is not blocked at all when the setting is off, and scanning still records', async () => {
      setting = 'false';
      const [a] = await parcels.ensureBoxes('o1', 's1', 2);
      const t = await mkTask();
      expect((await delivery.updateStatus(t.id, 'picked_up', rider.id)).status).toBe('picked_up');
      await scan(t.id, a.code, 'dropoff');
      expect(await ds.getRepository(ParcelScan).count()).toBe(1);
    });
  });

  describe('the warehouse desk', () => {
    const arrival = () => mkTask({ status: 'picked_up', kind: 'pickup', toHubId: hubA.id, hubId: hubA.id });

    it('cannot scan a leg in before every box was scanned, and can after (the box count in the refusal)', async () => {
      const [a, b] = await parcels.ensureBoxes('o1', 's1', 2);
      const t = await arrival();
      await expect(logistics.onScanIn(t.id, hubA.id, staff(op))).rejects.toThrow('Scan every parcel first: 0 of 2 scanned.');
      await scan(t.id, a.code, 'dropoff');
      await expect(logistics.onScanIn(t.id, hubA.id, staff(op))).rejects.toThrow('Scan every parcel first: 1 of 2 scanned.');
      await scan(t.id, b.code, 'dropoff');
      expect((await logistics.onScanIn(t.id, hubA.id, staff(op))).task.status).toBe('delivered');
    });
    it('scans boxes by code: each records its arrival, the leg is scanned in when the last one arrives', async () => {
      const [a, b] = await parcels.ensureBoxes('o1', 's1', 2);
      const t = await arrival();
      const first = await logistics.scanInByCode(a.code, hubA.id, staff(op));
      expect(first).toMatchObject({ completed: false });
      expect(first.parcels.parcels.filter((p) => p.dropoffScannedAt).length).toBe(1);
      expect(await status(t.id)).toBe('picked_up');
      const last = await logistics.scanInByCode(b.code, hubA.id, staff(op));
      expect(last).toMatchObject({ completed: true });
      expect(await status(t.id)).toBe('delivered');
      const scans = await ds.getRepository(ParcelScan).find({ where: { taskId: t.id } });
      expect(scans.map((s) => s.actorRole)).toEqual(['warehouse_staff', 'warehouse_staff']);
    });
    it('scans the leg in at once on the first box when the setting is off', async () => {
      setting = 'false';
      const [a] = await parcels.ensureBoxes('o1', 's1', 2);
      const t = await arrival();
      expect(await logistics.scanInByCode(a.code, hubA.id, staff(op))).toMatchObject({ completed: true });
      expect(await status(t.id)).toBe('delivered');
    });
    it('refuses a code that is not due at the warehouse, was cancelled, or whose leg a rider has not collected', async () => {
      const [a] = await parcels.ensureBoxes('o1', 's1', 1);
      await expect(logistics.scanInByCode(a.code, hubA.id, staff(op))).rejects.toThrow(`${a.code} is not due at your warehouse.`);
      const t = await arrival();
      await expect(logistics.scanInByCode(a.code, hubB.id, { ...staff(op), hubId: hubB.id })).rejects.toThrow(/not due at your warehouse/);
      await ds.getRepository(DeliveryTask).update({ id: t.id }, { status: 'assigned' });
      await expect(logistics.scanInByCode(a.code, hubA.id, staff(op))).rejects.toThrow(`A rider must collect ${a.code} before it can be scanned in.`);
      await parcels.voidFor('o1', ['s1']);
      await expect(logistics.scanInByCode(a.code, hubA.id, staff(op))).rejects.toThrow(`${a.code} was cancelled; use the new label.`);
    });
    it('lets a desk admin (no warehouse of their own) scan a box by code: the box\'s leg says which warehouse', async () => {
      const [a] = await parcels.ensureBoxes('o1', 's1', 1);
      const t = await arrival();
      const admin: Actor = { id: 'admin-1', role: 'admin_operations', name: 'Ops', hubId: null, tier: null };
      expect(await logistics.scanInByCode(a.code, null, admin)).toMatchObject({ completed: true });
      expect(await status(t.id)).toBe('delivered');
      await expect(logistics.scanInByCode(a.code, null, { ...staff(op), hubId: null })).rejects.toThrow(/not linked to a warehouse/);
    });
    it('hands a parcel to its rider only after every box was scanned out', async () => {
      const [a, b] = await parcels.ensureBoxes('o1', 's1', 2);
      const t = await mkTask({ kind: 'transfer', status: 'assigned', fromHubId: hubA.id, toHubId: hubB.id, hubId: hubA.id });
      await expect(logistics.scanOut(t.id, hubA.id, staff(op))).rejects.toThrow('Scan every parcel first: 0 of 2 scanned.');
      expect(await logistics.scanOutByCode(a.code, hubA.id, staff(op))).toMatchObject({ completed: false });
      expect(await logistics.scanOutByCode(b.code, hubA.id, staff(op))).toMatchObject({ completed: true });
      expect(await status(t.id)).toBe('picked_up');
    });
    it('dispatches and receives a transfer run only when the whole run is scanned (counted for the run)', async () => {
      const [a] = await parcels.ensureBoxes('o1', 's1', 1);
      const [b] = await parcels.ensureBoxes('o2', 's1', 2);
      const run = await ds.getRepository(TransferRun).save(ds.getRepository(TransferRun).create({ reference: 'TR-1', fromHubId: hubA.id, toHubId: hubB.id, riderId: rider.id, status: 'planned' }));
      const t1 = await mkTask({ orderId: 'o1', kind: 'transfer', status: 'assigned', fromHubId: hubA.id, toHubId: hubB.id, hubId: hubA.id, runId: run.id });
      const t2 = await mkTask({ orderId: 'o2', kind: 'transfer', status: 'assigned', fromHubId: hubA.id, toHubId: hubB.id, hubId: hubA.id, runId: run.id });
      await expect(runs.dispatch(staff(sup), { runId: run.id })).rejects.toThrow('Scan every parcel first: 0 of 3 scanned.');
      await parcels.riderScan(rider.id, { runId: run.id, code: a.code, stage: 'pickup' });
      for (const p of await parcels.activeFor('o2', ['s1'])) await parcels.riderScan(rider.id, { runId: run.id, code: p.code, stage: 'pickup' });
      expect(b.boxCount).toBe(2);
      expect((await runs.dispatch(staff(sup), { runId: run.id })).status).toBe('dispatched');
      expect([await status(t1.id), await status(t2.id)]).toEqual(['picked_up', 'picked_up']);
      const staffB = { ...staff(sup), hubId: hubB.id };
      await expect(runs.receive(staffB, { runId: run.id })).rejects.toThrow('Scan every parcel first: 0 of 3 scanned.');
      await parcels.riderScan(rider.id, { runId: run.id, code: a.code, stage: 'dropoff' });
      for (const p of await parcels.activeFor('o2', ['s1'])) await parcels.riderScan(rider.id, { runId: run.id, code: p.code, stage: 'dropoff' });
      expect((await runs.receive(staffB, { runId: run.id })).receivedCount).toBe(2);
    });
  });

  describe('marking by hand', () => {
    it('is for a supervisor or a manager, with a reason, and is audited and shown as manual', async () => {
      const [a] = await parcels.ensureBoxes('o1', 's1', 1);
      const t = await mkTask({ status: 'picked_up', toHubId: hubA.id });
      const mine = () => true;
      await expect(parcels.markByHand(staff(op), { taskId: t.id, code: a.code, stage: 'dropoff', reason: 'label torn' }, mine)).rejects.toThrow(/supervisor or a manager/);
      await expect(parcels.markByHand({ id: rider.id, role: 'rider' }, { taskId: t.id, code: a.code, stage: 'dropoff', reason: 'label torn' }, mine)).rejects.toThrow(/supervisor or a manager/);
      await expect(parcels.markByHand(staff(sup), { taskId: t.id, code: a.code, stage: 'dropoff', reason: ' ' }, mine)).rejects.toThrow(/reason/);
      const list = await parcels.markByHand(staff(sup), { taskId: t.id, code: a.code, stage: 'dropoff', reason: 'label torn' }, mine);
      expect(list.dropoffComplete).toBe(true);
      const row = await ds.getRepository(ParcelScan).findOneByOrFail({ taskId: t.id });
      expect(row).toMatchObject({ manual: true, reason: 'label torn', actorRole: 'warehouse_staff' });
      await new Promise((r) => setTimeout(r, 20));
      expect((await ds.getRepository(AuditLog).find()).map((l) => l.action)).toContain('parcel.marked_by_hand');
      // Now the leg can be scanned in.
      expect((await logistics.onScanIn(t.id, hubA.id, staff(op))).task.status).toBe('delivered');
    });
    it('is refused for a leg of another warehouse', async () => {
      const [a] = await parcels.ensureBoxes('o1', 's1', 1);
      const t = await mkTask({ status: 'picked_up' });
      await expect(parcels.markByHand(staff(sup), { taskId: t.id, code: a.code, stage: 'dropoff', reason: 'torn label' }, () => false)).rejects.toThrow(/another warehouse/);
    });
  });

  describe('returns', () => {
    it('get one parcel per case (idempotent), with no seller, carried by the return legs', async () => {
      const one = await parcels.createForReturn('o1', 'd1');
      expect(one).toMatchObject({ sellerId: null, returnId: 'd1', boxNo: 1, boxCount: 1 });
      expect((await parcels.createForReturn('o1', 'd1')).id).toBe(one.id);
      const pickup = await mkTask({ kind: 'return_pickup', disputeId: 'd1', sellerId: null, status: 'assigned', toHubId: hubA.id });
      expect(await scan(pickup.id, one.code)).toMatchObject({ total: 1, scanned: 1 });
      await expect(delivery.updateStatus(pickup.id, 'picked_up', rider.id)).resolves.toMatchObject({ status: 'picked_up' });
      // The customer (and only the customer) reads the label of their return.
      await ds.getRepository(Order).save(ds.getRepository(Order).create({ id: 'o1', reference: 'SOM-1', customerId: 'c1', customerName: 'C', status: 'delivered', totalUsd: 1 } as never));
      expect(await parcels.returnParcelFor({ id: 'c1', role: 'customer' }, 'd1')).toMatchObject({ code: one.code, orderReference: 'SOM-1' });
      await expect(parcels.returnParcelFor({ id: 'c2', role: 'customer' }, 'd1')).rejects.toThrow('Return not found.');
      expect(await parcels.returnParcelFor({ id: 'c1', role: 'customer' }, 'none')).toBeNull();
    });
  });

  describe('views and labels', () => {
    it('the leg view carries the boxes, their scans and the rule, and is empty for a leg without labels', async () => {
      const [a] = await parcels.ensureBoxes('o1', 's1', 2);
      const t = await mkTask();
      await scan(t.id, a.code);
      const v = await logistics.view(t);
      expect(v).toMatchObject({ pickupComplete: false, dropoffComplete: false, scanRequired: true });
      expect(v.parcels.map((p) => p.code)).toContain(a.code);
      const bare = await logistics.view(await mkTask({ orderId: 'none', sellerId: 's9' }));
      expect(bare).toMatchObject({ parcels: [], pickupComplete: true, dropoffComplete: true });
      setting = 'false';
      expect((await logistics.view(t)).scanRequired).toBe(false);
    });
  });

  describe('parcel groups: one box set for several same-day orders', () => {
    const ADDR = JSON.stringify({ line1: '12 Avenue du Commerce', commune: 'Gombe', city: 'Kinshasa', phone: '+243 811 111 111', geo: { lat: -4.3031, lng: 15.3033 } });
    let n = 0;
    const mkOrder = async (over: Partial<Order> = {}, lines: { name: string; variant?: string; qty: number; sellerId?: string; fulfilment?: OrderItem['fulfilment'] }[] = [{ name: 'Lamp', qty: 1 }]) => {
      const k = ++n;
      return ds.getRepository(Order).save(
        ds.getRepository(Order).create({
          reference: `SOM-G${k}`,
          customerId: 'cust1',
          customerName: 'Marie Dubois',
          status: 'processing',
          paymentMethod: 'stripe_card',
          totalUsd: 10,
          shippingAddress: ADDR,
          destinationHubId: hubB.id,
          items: lines.map((l) => Object.assign(new OrderItem(), { productId: `p-${l.name}`, productName: l.name, variant: l.variant ?? 'Default', qty: l.qty, priceUsd: 5, sellerId: l.sellerId ?? 's1', sellerName: 'Store', fulfilment: l.fulfilment ?? 'ready' })),
          ...over,
        }),
      );
    };
    const pack = (ids: string[], count?: number) => withOrderLocks(ds.manager, ids, (m) => parcels.packGroup(m, ids, 's1', count));
    const groupsOf = async () => ds.getRepository(ParcelGroup).find();

    it('double clicks and a second tab get the first one\'s boxes: never a second set', async () => {
      const o = await mkOrder();
      const results = await Promise.all([parcels.ensureBoxes(o.id, 's1', 2), parcels.ensureBoxes(o.id, 's1', 2), parcels.ensureBoxes(o.id, 's1', 2)]);
      expect(new Set(results.map((r) => r.map((p) => p.code).join())).size).toBe(1);
      expect(await ds.getRepository(Parcel).count({ where: { orderId: o.id } })).toBe(2);
      expect(await groupsOf()).toHaveLength(1);
    });
    it('the data layer refuses a second live box in a slot, and a void box frees the slot', async () => {
      const o = await mkOrder();
      const [a] = await parcels.ensureBoxes(o.id, 's1', 1);
      const dup = ds.getRepository(Parcel).create({ orderId: o.id, groupId: a.groupId, sellerId: 's1', returnId: null, code: 'PKG-DUPDUPD2', boxNo: 1, boxCount: 1, voidedAt: null, liveSlot: a.liveSlot });
      await expect(ds.getRepository(Parcel).save(dup)).rejects.toThrow(/UNIQUE|constraint/i);
      await parcels.ensureBoxes(o.id, 's1', 2); // voids box 1 (slot freed) and makes 2 new ones
      expect((await ds.getRepository(Parcel).findOneByOrFail({ id: a.id })).liveSlot).toBeNull();
    });
    it('packs two same-day orders into ONE set: one code per box, every order listed on the label', async () => {
      const a = await mkOrder({}, [{ name: 'Lamp', qty: 1 }]);
      const b = await mkOrder({}, [{ name: 'T-shirt', variant: 'L / Blue', qty: 2 }]);
      const { group, boxes } = await pack([a.id, b.id], 2);
      expect(boxes).toHaveLength(2);
      expect(await ds.getRepository(ParcelGroupOrder).count({ where: { groupId: group.id } })).toBe(2);
      const set = await parcels.labelsFor(b.id, ['s1']);
      expect(set.labels).toHaveLength(2);
      expect(set.labels[0].orderRefs).toEqual([a.reference, b.reference]);
      expect(set.labels[0].contents.map((c) => `${c.qty} x ${c.name}${c.variant ? ` (${c.variant})` : ''} ${c.orderReference}`)).toEqual([`1 x Lamp ${a.reference}`, `2 x T-shirt (L / Blue) ${b.reference}`]);
      expect(set.labels[0].destinationArea).toBe('Gombe, Kinshasa');
      expect(JSON.stringify(set)).not.toMatch(/811 111 111|12 Avenue/);
      // asking by either order gives the same boxes
      expect((await parcels.activeFor(a.id, ['s1'])).map((p) => p.code)).toEqual((await parcels.activeFor(b.id, ['s1'])).map((p) => p.code));
    });
    it('keeps a different address, a different customer and a different day apart', async () => {
      const a = await mkOrder();
      const far = await mkOrder({ shippingAddress: JSON.stringify({ line1: '5 Rue X', commune: 'Limete', city: 'Kinshasa' }) });
      const other = await mkOrder({ customerId: 'cust2' });
      const old = await mkOrder({ createdAt: new Date(Date.now() - 3 * 86_400_000) });
      for (const x of [far, other, old]) await expect(pack([a.id, x.id])).rejects.toThrow(/cannot share a label/);
      expect(await groupsOf()).toHaveLength(0); // nothing half done
    });
    it('does not merge a multi-seller order', async () => {
      const a = await mkOrder();
      const multi = await mkOrder({}, [{ name: 'Lamp', qty: 1 }, { name: 'Cup', qty: 1, sellerId: 's2' }]);
      await expect(pack([a.id, multi.id])).rejects.toThrow(/several sellers/);
    });
    it('locks at the first pickup scan: the orders cannot change, a later same-day order gets a new set', async () => {
      const a = await mkOrder();
      const b = await mkOrder();
      const c = await mkOrder();
      const { group, boxes } = await pack([a.id, b.id], 1);
      await scan((await mkTask({ orderId: a.id })).id, boxes[0].code);
      expect((await ds.getRepository(ParcelGroup).findOneByOrFail({ id: group.id })).lockedAt).not.toBeNull();
      await expect(pack([a.id, c.id])).rejects.toThrow(/already collected/);
      const next = await pack([c.id]);
      expect(next.group.id).not.toBe(group.id);
      expect(next.group.daySeq).toBeGreaterThan(group.daySeq - 1);
      await expect(parcels.ensureBoxes(a.id, 's1', 3)).rejects.toThrow(BOXES_LOCKED);
    });
    it('moving an order into another set voids its old boxes and deletes an emptied set; a count change replaces boxes before pickup', async () => {
      const a = await mkOrder();
      const b = await mkOrder();
      const soloA = await pack([a.id], 1);
      const soloB = await pack([b.id], 1);
      const oldBox = soloB.boxes[0];
      const merged = await pack([a.id, b.id], 2);
      expect(merged.group.id).toBe(soloA.group.id); // the oldest unlocked set with the same key is the target
      expect((await ds.getRepository(Parcel).findOneByOrFail({ id: oldBox.id })).voidedAt).not.toBeNull();
      expect((await ds.getRepository(Parcel).findOneByOrFail({ id: oldBox.id })).liveSlot).toBeNull();
      expect(await ds.getRepository(ParcelGroup).findOne({ where: { id: soloB.group.id } })).toBeNull(); // emptied: gone
      expect(merged.boxes).toHaveLength(2);
      const again = await pack([a.id, b.id], 2);
      expect(again.boxes.map((p) => p.code)).toEqual(merged.boxes.map((p) => p.code)); // same count: the same boxes
    });
    it('taking an order out gives it a set of its own and bumps the reprint counter of the one it left', async () => {
      const a = await mkOrder();
      const b = await mkOrder();
      const { group } = await pack([a.id, b.id], 1);
      const out = await withOrderLocks(ds.manager, [a.id, b.id], (m) => parcels.detachOrder(m, b.id, 's1'));
      expect(out.group.id).not.toBe(group.id);
      expect(out.boxes).toHaveLength(1);
      expect((await ds.getRepository(ParcelGroup).findOneByOrFail({ id: group.id })).contentsRev).toBeGreaterThan(0);
      expect(await parcels.siblingOrderIds(a.id)).toEqual([]);
    });
    it('a cancelled order leaves a shared set without voiding the others\' boxes', async () => {
      const a = await mkOrder();
      const b = await mkOrder();
      const { boxes } = await pack([a.id, b.id], 1);
      await parcels.voidFor(b.id);
      expect((await ds.getRepository(Parcel).findOneByOrFail({ id: boxes[0].id })).voidedAt).toBeNull();
      expect(await parcels.siblingOrderIds(a.id)).toEqual([]);
      await parcels.voidFor(a.id);
      expect((await ds.getRepository(Parcel).findOneByOrFail({ id: boxes[0].id })).voidedAt).not.toBeNull();
    });
    it('one scan serves every sibling leg, and the checklist of each lists the whole set\'s contents', async () => {
      const a = await mkOrder({}, [{ name: 'Lamp', qty: 1 }]);
      const b = await mkOrder({}, [{ name: 'Cap', variant: 'One size', qty: 3 }]);
      const { boxes } = await pack([a.id, b.id], 2);
      const ta = await mkTask({ orderId: a.id, orderReference: a.reference });
      const tb = await mkTask({ orderId: b.id, orderReference: b.reference });
      const r = await scan(ta.id, boxes[0].code);
      expect(r.scanned).toBe(1);
      const lists = await parcels.checklists([ta, tb]);
      for (const t of [ta, tb]) {
        expect(lists.get(t.id)!.parcels.map((p) => !!p.pickupScannedAt)).toEqual([true, false]);
        expect(lists.get(t.id)!.contents.map((c) => c.name)).toEqual(['Lamp', 'Cap']);
        expect(lists.get(t.id)!.orders.map((o) => o.reference)).toEqual([a.reference, b.reference]);
      }
      await scan(ta.id, boxes[1].code);
      setting = 'true';
      await expect(parcels.assertComplete([ta, tb], 'pickup')).resolves.toBeUndefined(); // the sibling needs no scan of its own
    });
    it('does not fan out to a sibling leg of another rider', async () => {
      const a = await mkOrder();
      const b = await mkOrder();
      const { boxes } = await pack([a.id, b.id], 1);
      const ta = await mkTask({ orderId: a.id });
      const tb = await mkTask({ orderId: b.id, riderId: rider2.id });
      await scan(ta.id, boxes[0].code);
      expect((await parcels.checklist(tb)).pickupComplete).toBe(false);
    });
    it('resolves a box by role: a rider their own legs, staff their hub, an admin all, a seller never the street or phone', async () => {
      const a = await mkOrder({}, [{ name: 'Lamp', qty: 1 }]);
      const b = await mkOrder({}, [{ name: 'Cap', qty: 2 }]);
      const { boxes } = await pack([a.id, b.id], 1);
      const code = boxes[0].code;
      const leg = await mkTask({ orderId: a.id, orderReference: a.reference, kind: 'delivery' as DeliveryKind, sellerIds: ['s1'], sellerId: null, hubId: hubA.id, fromHubId: hubA.id });
      const r = await parcels.resolve({ id: rider.id, role: 'rider' }, code);
      expect(r.contents).toHaveLength(2);
      expect(r.orders).toHaveLength(2);
      expect(r.destination).toMatchObject({ area: 'Gombe, Kinshasa', address: '12 Avenue du Commerce, Gombe, Kinshasa', phone: '+243 811 111 111' });
      expect(r.legs.map((l) => l.id)).toEqual([leg.id]);
      await expect(parcels.resolve({ id: rider2.id, role: 'rider' }, code)).rejects.toThrow('Parcel not found.');
      expect((await parcels.resolve({ id: op.id, role: 'warehouse_staff', hubId: hubA.id }, code)).destination.address).toContain('12 Avenue');
      await expect(parcels.resolve({ id: 'x', role: 'warehouse_staff', hubId: hubB.id }, code)).rejects.toThrow('Parcel not found.');
      expect((await parcels.resolve({ id: 'adm', role: 'admin' }, code)).destination.phone).toBe('+243 811 111 111');
      expect((await parcels.resolve({ id: 'fin', role: 'admin_finance' }, code)).destination.address).toBeNull();
      await expect(parcels.resolve({ id: 'mk', role: 'admin_marketing' }, code)).rejects.toThrow(/cannot read orders/);
      const seller = await parcels.resolve({ id: 's1', role: 'seller' }, code);
      expect(seller.destination).toMatchObject({ area: 'Gombe, Kinshasa', address: null, phone: null, recipient: null });
      expect(JSON.stringify(seller)).not.toMatch(/811 111 111|12 Avenue/);
      await expect(parcels.resolve({ id: 's9', role: 'seller' }, code)).rejects.toThrow('Parcel not found.');
      await expect(parcels.resolve({ id: 'c', role: 'customer' }, code)).rejects.toThrow('Parcel not found.');
      await expect(parcels.resolve({ id: rider.id, role: 'rider' }, 'PKG-ZZZZZZZZ')).rejects.toThrow('Parcel not found.');
    });
    it('shows a rider only the area on a pickup leg', async () => {
      const a = await mkOrder();
      const { boxes } = await pack([a.id], 1);
      await mkTask({ orderId: a.id, kind: 'pickup' as DeliveryKind });
      const r = await parcels.resolve({ id: rider.id, role: 'rider' }, boxes[0].code);
      expect(r.destination).toMatchObject({ area: 'Gombe, Kinshasa', address: null, phone: null });
    });
    it('lists an order\'s sets and boxes with scans for the admin order page', async () => {
      const a = await mkOrder();
      const b = await mkOrder();
      const { boxes } = await pack([a.id, b.id], 2);
      const ta = await mkTask({ orderId: a.id });
      await scan(ta.id, boxes[0].code);
      const r = await parcels.forOrder({ id: 'adm', role: 'admin' }, b.id);
      expect(r.sets).toHaveLength(1);
      expect(r.sets[0].orders).toHaveLength(2);
      expect(r.sets[0].boxes.map((x) => [x.boxNo, x.pickupScans])).toEqual([[1, 1], [2, 0]]);
      await expect(parcels.forOrder({ id: 'c', role: 'customer' }, b.id)).rejects.toThrow('Order not found.');
      expect((await parcels.forOrder({ id: 'adm', role: 'admin' }, 'nope')).sets).toEqual([]);
    });
  });
});
