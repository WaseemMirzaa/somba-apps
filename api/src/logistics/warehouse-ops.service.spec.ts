import { DataSource } from 'typeorm';
import { AgedAlert, AuditLog, DeliveryKind, DeliveryStatus, DeliveryTask, ENTITIES, Hub, HubOpsSettings, Order, OrderItem, Product, Seller, User } from '../database/entities';
import { AgedParcelsService } from './aged-parcels.service';
import { HubOpsSettingsService } from './hub-ops-settings.service';
import { Actor, LogisticsService } from './logistics.service';
import { OpsAnalyticsService, rangeOf } from './ops-analytics.service';
import { WarehouseOpsGateway } from './warehouse-ops.gateway';
import { WarehouseOpsJob } from './warehouse-ops.job';
import { WarehouseService } from '../warehouse/warehouse.service';
import { recordingEmitter } from '../testing/test-db';

/**
 * Warehouse operations on a real (in-memory SQLite) schema: settings, the aged-parcel job (each level, idempotency), auto-assignment,
 * return to seller and the analytics. Notifications and the emitter are recorded.
 */
describe('warehouse operations', () => {
  let ds: DataSource;
  let emitter: ReturnType<typeof recordingEmitter>;
  let settings: HubOpsSettingsService;
  let aged: AgedParcelsService;
  let analytics: OpsAnalyticsService;
  let logistics: LogisticsService;
  let hub: Hub;
  let other: Hub;
  let seq = 0;
  const notif = {
    toUser: jest.fn(async () => undefined as unknown),
    toUsers: jest.fn(async (_ids: string[], _n: unknown) => undefined),
    toAdmins: jest.fn(async (_n: unknown) => undefined),
  };

  const NOW = new Date('2026-11-02T09:00:00Z'); // Monday 10:00 in Kinshasa: inside the default working hours
  const hoursAgo = (h: number, from = NOW) => new Date(from.getTime() - h * 3_600_000);

  const mkHub = (name: string) => ds.getRepository(Hub).save(ds.getRepository(Hub).create({ name, city: 'Kinshasa', country: 'CD', lat: -4.3, lng: 15.3 }));
  const mkUser = (role: User['role'], hubId: string | null, extra: Partial<User> = {}) => {
    const n = ++seq;
    return ds.getRepository(User).save(ds.getRepository(User).create({ emailHash: `h${n}`, email: `u${n}@t.test`, passwordHash: 'x', name: `${role}${n}`, role, hubId, ...extra }));
  };
  const staff = (h: Hub, tier: string): Actor => ({ id: `s-${tier}-${h.id}`, role: 'warehouse_staff', name: `Staff ${tier}`, hubId: h.id, tier });
  const admin = (role = 'admin'): Actor => ({ id: 'adm', role, name: 'Admin', hubId: null, tier: null });

  /** A leg, aged `age` hours at NOW. */
  const mkTask = async (over: Partial<DeliveryTask> & { age?: number } = {}) => {
    const { age, ...rest } = over;
    const t = await ds.getRepository(DeliveryTask).save(
      ds.getRepository(DeliveryTask).create({ orderId: `o${++seq}`, orderReference: `SOM-${seq}`, kind: 'delivery' as DeliveryKind, status: 'unassigned' as DeliveryStatus, hubId: hub.id, fromHubId: hub.id, ...rest }),
    );
    if (age !== undefined) await ds.getRepository(DeliveryTask).update({ id: t.id }, { createdAt: hoursAgo(age) });
    return (await ds.getRepository(DeliveryTask).findOneByOrFail({ id: t.id }))!;
  };
  const alertsOf = (taskId: string) => ds.getRepository(AgedAlert).find({ where: { taskId }, order: { level: 'ASC' } });
  const told = () => notif.toUsers.mock.calls.map(([ids, n]) => ({ ids: [...ids].sort(), ...(n as object) })) as { ids: string[]; title: string; body: string; entityId: string }[];

  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true });
    await ds.initialize();
    emitter = recordingEmitter();
    jest.clearAllMocks();
    hub = await mkHub('Entrepôt Gombe');
    other = await mkHub('Entrepôt Limete');
    settings = new HubOpsSettingsService(ds.getRepository(HubOpsSettings), ds.getRepository(Hub), ds.getRepository(AuditLog), emitter as never);
    aged = new AgedParcelsService(ds.getRepository(DeliveryTask), ds.getRepository(AgedAlert), ds.getRepository(User), settings, notif as never);
    logistics = new LogisticsService(
      ds.getRepository(DeliveryTask),
      ds.getRepository(Order),
      ds.getRepository(OrderItem),
      ds.getRepository(Hub),
      ds.getRepository(User),
      ds.getRepository(Seller),
      ds.getRepository(Product),
      ds.getRepository(AuditLog),
      {} as never,
      {} as never,
      notif as never,
      emitter as never,
      undefined,
      undefined,
      settings,
    );
    analytics = new OpsAnalyticsService(ds.getRepository(DeliveryTask), ds.getRepository(User), settings);
  });
  afterEach(async () => ds.destroy());

  // ── settings ───────────────────────────────────────────────────────────────
  describe('settings', () => {
    it('a warehouse that never saved settings runs on the defaults (auto-assignment off)', async () => {
      const v = await settings.view(hub.id);
      expect(v).toMatchObject({ isDefault: true, autoAssign: false, batchSize: 20, workStart: '08:00', workEnd: '18:00', agedLevels: [24, 48, 72], deliveryTargetHours: 24, updatedAt: null });
    });

    it('its manager saves them; the change is stored, announced to the warehouse and the admins, and audited with before and after', async () => {
      const out = await settings.update(staff(hub, 'manager'), hub.id, { autoAssign: true, batchSize: 35, agedLevels: [12, 30, 60], workDays: [1, 2, 3] });
      expect(out).toMatchObject({ isDefault: false, autoAssign: true, batchSize: 35, agedLevels: [12, 30, 60], workDays: [1, 2, 3], updatedByName: 'Staff manager' });
      expect(await settings.ops(hub.id)).toMatchObject({ autoAssign: true, batchSize: 35, agedLevels: [12, 30, 60] });
      expect(emitter.sent.some((e) => e.to === `hub:${hub.id}` && e.event === 'hubSettings:updated')).toBe(true);
      const [log] = await ds.getRepository(AuditLog).find({ where: { action: 'hub.settings.updated' } });
      expect(log).toMatchObject({ actor: 'Staff manager', role: 'warehouse_staff', entity: 'hub', entityId: hub.id });
      expect(log.detail).toContain('batchSize 20 -> 35');
      expect(log.detail).toContain('autoAssign false -> true');
    });

    it('super admin and operations admin may change any warehouse; other admin roles may not', async () => {
      await settings.update(admin('admin'), other.id, { batchSize: 50 });
      await settings.update(admin('admin_operations'), hub.id, { batchSize: 51 });
      expect((await settings.ops(other.id)).batchSize).toBe(50);
      expect((await settings.ops(hub.id)).batchSize).toBe(51);
      for (const role of ['admin_finance', 'admin_support', 'admin_marketing', 'admin_moderation']) {
        await expect(settings.update(admin(role), hub.id, { batchSize: 5 })).rejects.toThrow(/Only the warehouse manager or an operations admin/);
      }
      expect((await settings.ops(hub.id)).batchSize).toBe(51);
    });

    it('operators, supervisors, a manager of another warehouse, riders and customers are refused', async () => {
      await expect(settings.update(staff(hub, 'operator'), hub.id, { batchSize: 5 })).rejects.toThrow(/Only the warehouse manager/);
      await expect(settings.update(staff(hub, 'supervisor'), hub.id, { batchSize: 5 })).rejects.toThrow(/Only the warehouse manager/);
      await expect(settings.update(staff(other, 'manager'), hub.id, { batchSize: 5 })).rejects.toThrow(/Only the warehouse manager/);
      await expect(settings.update({ id: 'r', role: 'rider', name: 'R', hubId: hub.id, tier: null }, hub.id, { batchSize: 5 })).rejects.toThrow(/Only the warehouse manager/);
      await expect(settings.update({ id: 'c', role: 'customer', name: 'C', hubId: null, tier: null }, hub.id, { batchSize: 5 })).rejects.toThrow(/Only the warehouse manager/);
      expect(await ds.getRepository(HubOpsSettings).count()).toBe(0);
      expect(await ds.getRepository(AuditLog).count()).toBe(0);
    });

    it('an invalid change is refused whole: nothing stored, nothing audited', async () => {
      await settings.update(staff(hub, 'manager'), hub.id, { batchSize: 30 });
      await expect(settings.update(staff(hub, 'manager'), hub.id, { batchSize: 40, agedLevels: [48, 24, 72] })).rejects.toThrow(/must increase/);
      await expect(settings.update(staff(hub, 'manager'), hub.id, { workStart: '19:00' })).rejects.toThrow(/after opening/);
      expect((await settings.ops(hub.id)).batchSize).toBe(30);
      expect(await ds.getRepository(AuditLog).count()).toBe(1);
    });

    it('refuses an unknown warehouse, and saving the same values twice audits once', async () => {
      await expect(settings.update(admin(), 'nope', { batchSize: 5 })).rejects.toThrow(/Warehouse not found/);
      await settings.update(admin(), hub.id, { batchSize: 25 });
      await settings.update(admin(), hub.id, { batchSize: 25 });
      expect(await ds.getRepository(AuditLog).count()).toBe(1);
    });

    it('limits a batch to the warehouse batch size, in the service (not only in the page)', async () => {
      const mkWarehouse = () =>
        new WarehouseService(ds.getRepository(Hub), ds.getRepository('WarehouseBatch') as never, ds.getRepository(DeliveryTask), ds.getRepository(Product), ds.getRepository(Order), {} as never, emitter as never, {} as never, {} as never, {} as never, { assign: async () => undefined } as never, settings);
      const rider = await mkUser('rider', hub.id);
      const tasks = [await mkTask(), await mkTask(), await mkTask()];
      await settings.update(admin(), hub.id, { batchSize: 2 });
      const sup = staff(hub, 'supervisor');
      await expect(mkWarehouse().buildBatch(sup, tasks.map((t) => t.id), { id: rider.id, name: rider.name, hubId: hub.id })).rejects.toThrow(/at most 2 parcels/);
      expect(await ds.getRepository('WarehouseBatch').count()).toBe(0);
      const batch = await mkWarehouse().buildBatch(sup, tasks.slice(0, 2).map((t) => t.id), { id: rider.id, name: rider.name, hubId: hub.id });
      expect(batch.riderId).toBe(rider.id);
    });
  });

  // ── gateway guards ─────────────────────────────────────────────────────────
  describe('gateway', () => {
    it('answers every event with a refusal to the people who may not use it', async () => {
      const job = new WarehouseOpsJob(aged, logistics);
      const gw = new WarehouseOpsGateway(settings, aged, analytics, logistics, job, ds.getRepository(User));
      const op = await mkUser('warehouse_staff', hub.id, { warehouseTier: 'operator' });
      const sup = await mkUser('warehouse_staff', hub.id, { warehouseTier: 'supervisor' });
      const mgr = await mkUser('warehouse_staff', hub.id, { warehouseTier: 'manager' });
      const sock = (u: { id: string; role: string; name: string }) => ({ data: { user: u } }) as never;
      const as = (u: User) => sock({ id: u.id, role: u.role, name: u.name });

      // settings: staff read their own; only the manager (or operations admins) write
      expect(await gw.get(as(op))).toMatchObject({ ok: true, data: { hubId: hub.id, canEdit: false } });
      expect(await gw.update(as(sup), { batchSize: 9 })).toMatchObject({ ok: false });
      expect(await gw.update(as(mgr), { batchSize: 9, hubId: other.id })).toMatchObject({ ok: true, data: { hubId: hub.id, batchSize: 9 } }); // a hub they send is ignored
      expect((await settings.ops(other.id)).batchSize).toBe(20);
      expect(await gw.update(sock({ id: 'a', role: 'admin_finance', name: 'F' }), { hubId: hub.id, batchSize: 8 })).toMatchObject({ ok: false });
      expect(await gw.update(sock({ id: 'a', role: 'admin_operations', name: 'O' }), { hubId: hub.id, batchSize: 8 })).toMatchObject({ ok: true });
      expect(await gw.get(sock({ id: 'a', role: 'admin_operations', name: 'O' }))).toMatchObject({ ok: false, error: 'Choose a warehouse.' });
      expect(await gw.get(sock({ id: 'c', role: 'customer', name: 'C' }))).toMatchObject({ ok: false, error: 'Staff only.' });
      expect(await gw.get(sock({ id: 'g', role: 'guest', name: 'G' }))).toMatchObject({ ok: false });
      expect(await gw.get({ data: {} } as never)).toMatchObject({ ok: false });

      // aged board: supervisors and up
      expect(await gw.summary(as(op))).toMatchObject({ ok: false });
      expect(await gw.summary(as(sup))).toMatchObject({ ok: true });
      // analytics: managers and admins
      expect(await gw.legs(as(sup))).toMatchObject({ ok: false, error: 'Only managers can see this.' });
      expect(await gw.legs(as(mgr), { from: '2026-10-01', to: '2026-10-31' })).toMatchObject({ ok: true });
      expect(await gw.legs(as(mgr), { from: '2026-10-31', to: '2026-10-01' })).toMatchObject({ ok: false, error: 'The start date must be before the end date.' });
      // the job: operations admins only
      expect(await gw.runNow(as(mgr))).toMatchObject({ ok: false, error: 'Not allowed.' });
      expect(await gw.runNow(sock({ id: 'a', role: 'admin', name: 'A' }))).toMatchObject({ ok: true });
      // return to seller: supervisors and up
      const t = await mkTask({ age: 1 });
      expect(await gw.returnToSeller(as(op), { taskId: t.id })).toMatchObject({ ok: false });
    });
  });

  // ── aged parcels ───────────────────────────────────────────────────────────
  describe('aged-parcel alerts', () => {
    let sup1: User;
    let sup2: User;
    let mgr: User;
    let otherSup: User;
    beforeEach(async () => {
      sup1 = await mkUser('warehouse_staff', hub.id, { warehouseTier: 'supervisor' });
      sup2 = await mkUser('warehouse_staff', hub.id, { warehouseTier: 'supervisor' });
      mgr = await mkUser('warehouse_staff', hub.id, { warehouseTier: 'manager' });
      await mkUser('warehouse_staff', hub.id, { warehouseTier: 'operator' });
      await mkUser('warehouse_staff', hub.id, { warehouseTier: 'supervisor', active: false });
      otherSup = await mkUser('warehouse_staff', other.id, { warehouseTier: 'supervisor' });
    });

    it('does nothing for a parcel younger than the first age', async () => {
      const t = await mkTask({ age: 23 });
      expect(await aged.sweep(NOW)).toEqual({ checked: 0, alerted: 0, skipped: 0 });
      expect(await alertsOf(t.id)).toHaveLength(0);
      expect(notif.toUsers).not.toHaveBeenCalled();
      expect(notif.toAdmins).not.toHaveBeenCalled();
    });

    it('level 1 (24 h) tells the active supervisors of ITS warehouse, in-app and push (one notice each), and nobody else', async () => {
      const t = await mkTask({ age: 25 });
      expect(await aged.sweep(NOW)).toEqual({ checked: 1, alerted: 1, skipped: 0 });
      expect(told()).toEqual([{ ids: [sup1.id, sup2.id].sort(), title: 'Aged parcel', body: `${t.orderReference}: delivery has been open for 25 hours.`, type: 'task', entityId: t.id, extra: { orderId: t.orderId, kind: 'delivery', agedLevel: '1' } }].map((x) => expect.objectContaining(x)));
      expect(told()[0].ids).not.toContain(otherSup.id);
      expect(told()[0].ids).not.toContain(mgr.id);
      expect(notif.toAdmins).not.toHaveBeenCalled();
      expect(await alertsOf(t.id)).toMatchObject([{ level: 1, hubId: hub.id, notified: 2 }]);
    });

    it('level 2 (48 h) tells the supervisors again, as a new alert', async () => {
      const t = await mkTask({ age: 25 });
      await aged.sweep(NOW);
      notif.toUsers.mockClear();
      const later = new Date(NOW.getTime() + 24 * 3_600_000); // the parcel is now 49 h old
      expect(await aged.sweep(later)).toEqual({ checked: 1, alerted: 1, skipped: 0 });
      expect(told()).toHaveLength(1);
      expect(told()[0]).toMatchObject({ ids: [sup1.id, sup2.id].sort(), title: 'Aged parcel', body: `${t.orderReference}: delivery has been open for 49 hours.` });
      expect(notif.toAdmins).not.toHaveBeenCalled();
      expect((await alertsOf(t.id)).map((a) => a.level)).toEqual([1, 2]);
    });

    it('level 3 (72 h, the last) escalates to the warehouse manager and to the admins, not to the supervisors', async () => {
      const t = await mkTask({ age: 73 });
      expect(await aged.sweep(NOW)).toEqual({ checked: 1, alerted: 1, skipped: 2 });
      expect(told()).toHaveLength(1);
      expect(told()[0]).toMatchObject({ ids: [mgr.id], title: 'Parcel escalated', body: `${t.orderReference}: delivery has been open for 73 hours and needs a decision.`, entityId: t.id });
      expect(notif.toAdmins).toHaveBeenCalledTimes(1);
      expect(notif.toAdmins.mock.calls[0][0]).toMatchObject({ title: 'Parcel escalated', type: 'task', entityId: t.id });
      expect(await alertsOf(t.id)).toMatchObject([{ level: 1, notified: 0 }, { level: 2, notified: 0 }, { level: 3, notified: 2 }]);
    });

    it('walks 24 -> 48 -> 72 h as the parcel ages, one alert per level', async () => {
      const t = await mkTask({ age: 0 });
      const at = (h: number) => new Date(NOW.getTime() + h * 3_600_000);
      expect(await aged.sweep(at(10))).toMatchObject({ alerted: 0 });
      expect(await aged.sweep(at(24.5))).toMatchObject({ alerted: 1 });
      expect(await aged.sweep(at(30))).toMatchObject({ alerted: 0 });
      expect(await aged.sweep(at(48.5))).toMatchObject({ alerted: 1 });
      expect(await aged.sweep(at(72.5))).toMatchObject({ alerted: 1 });
      expect(await aged.sweep(at(200))).toMatchObject({ alerted: 0 });
      expect(told().map((x) => x.title)).toEqual(['Aged parcel', 'Aged parcel', 'Parcel escalated']);
      expect(notif.toAdmins).toHaveBeenCalledTimes(1);
      expect(await ds.getRepository(AgedAlert).count({ where: { taskId: t.id } })).toBe(3);
    });

    it('is idempotent: running it again, or twice at once, tells nobody twice', async () => {
      const t = await mkTask({ age: 50 });
      const results = await Promise.all([aged.sweep(NOW), aged.sweep(NOW), aged.sweep(NOW)]);
      expect(results.reduce((n, r) => n + r.alerted, 0)).toBe(1);
      expect(await aged.sweep(NOW)).toMatchObject({ alerted: 0 });
      expect(await aged.sweep(NOW)).toMatchObject({ alerted: 0 });
      expect(notif.toUsers).toHaveBeenCalledTimes(1);
      expect(await alertsOf(t.id)).toHaveLength(2);
    });

    it('survives a restart: a new service on the same database does not repeat an alert', async () => {
      await mkTask({ age: 25 });
      await aged.sweep(NOW);
      const again = new AgedParcelsService(ds.getRepository(DeliveryTask), ds.getRepository(AgedAlert), ds.getRepository(User), settings, notif as never);
      expect(await again.sweep(NOW)).toMatchObject({ alerted: 0 });
      expect(notif.toUsers).toHaveBeenCalledTimes(1);
    });

    it('stops alerting once a leg is closed, and ignores delivered and failed legs', async () => {
      const done = await mkTask({ age: 100, status: 'delivered' });
      const failed = await mkTask({ age: 100, status: 'failed' });
      const open = await mkTask({ age: 100 });
      expect(await aged.sweep(NOW)).toMatchObject({ checked: 1, alerted: 1 });
      expect(await alertsOf(done.id)).toHaveLength(0);
      expect(await alertsOf(failed.id)).toHaveLength(0);
      expect((await alertsOf(open.id)).length).toBe(3);
    });

    it('uses each warehouse own ages', async () => {
      await settings.update(admin(), hub.id, { agedLevels: [2, 4, 6] });
      const mine = await mkTask({ age: 3 });
      const theirs = await mkTask({ age: 3, hubId: other.id, fromHubId: other.id });
      expect(await aged.sweep(NOW)).toMatchObject({ checked: 1, alerted: 1 });
      expect(await alertsOf(mine.id)).toHaveLength(1);
      expect(await alertsOf(theirs.id)).toHaveLength(0);
      expect(told()[0].ids).toEqual([sup1.id, sup2.id].sort());
    });

    it('falls back to the managers when a warehouse has no supervisor, and to the admins when no warehouse manages the leg', async () => {
      await ds.getRepository(User).update({ hubId: hub.id, warehouseTier: 'supervisor' }, { warehouseTier: 'operator' });
      await mkTask({ age: 25 });
      await aged.sweep(NOW);
      expect(told()[0].ids).toEqual([mgr.id]);
      notif.toUsers.mockClear();
      const orphan = await mkTask({ age: 25, hubId: null, fromHubId: null });
      await aged.sweep(NOW);
      expect(notif.toUsers).not.toHaveBeenCalled();
      expect(notif.toAdmins).toHaveBeenCalledTimes(1);
      expect(await alertsOf(orphan.id)).toHaveLength(1);
    });

    it('a failed notification does not break the sweep or re-alert later', async () => {
      const t = await mkTask({ age: 25 });
      notif.toUsers.mockRejectedValueOnce(new Error('push down'));
      expect(await aged.sweep(NOW)).toMatchObject({ alerted: 1 });
      expect(await aged.sweep(NOW)).toMatchObject({ alerted: 0 });
      expect(await alertsOf(t.id)).toMatchObject([{ level: 1, notified: 0 }]);
    });

    it('pages through many aged parcels', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 7; i++) ids.push((await mkTask({ age: 30 + i })).id);
      const r = await aged.sweep(NOW);
      expect(r).toMatchObject({ checked: 7, alerted: 7 });
      expect(await ds.getRepository(AgedAlert).count()).toBe(7);
    });

    it('summary: the ages, the level each leg reached and when it was alerted', async () => {
      const young = await mkTask({ age: 5 });
      const l1 = await mkTask({ age: 30 });
      const l3 = await mkTask({ age: 80 });
      await aged.sweep(NOW);
      const s = await aged.summary(hub.id, NOW);
      expect(s.levels).toEqual([24, 48, 72]);
      expect(s.counts).toEqual([1, 0, 1]);
      expect(s.byTask[young.id]).toBeUndefined();
      expect(s.byTask[l1.id]).toMatchObject({ level: 1 });
      expect(s.byTask[l1.id].alertedAt).toBeInstanceOf(Date);
      expect(s.byTask[l3.id]).toMatchObject({ level: 3 });
      expect((await aged.summary(other.id, NOW)).counts).toEqual([0, 0, 0]);
    });
  });

  // ── auto-assignment ────────────────────────────────────────────────────────
  describe('auto-assignment', () => {
    const on = (patch: object = {}) => settings.update(admin(), hub.id, { autoAssign: true, ...patch });
    let r1: User;
    let r2: User;
    let r3: User;
    beforeEach(async () => {
      [r1, r2, r3] = [await mkUser('rider', hub.id, { name: 'Ann' }), await mkUser('rider', hub.id, { name: 'Ben' }), await mkUser('rider', hub.id, { name: 'Cy' })];
    });
    const busy = (rider: User, n: number, status: DeliveryStatus = 'assigned') => Promise.all(Array.from({ length: n }, () => mkTask({ riderId: rider.id, status, kind: 'delivery' })));

    it('is off by default: nothing is assigned', async () => {
      const t = await mkTask();
      expect(await logistics.autoAssign(t, NOW)).toBeNull();
      expect((await ds.getRepository(DeliveryTask).findOneByOrFail({ id: t.id })).status).toBe('unassigned');
    });

    it('gives the task to the rider with the fewest open tasks, as an assignment (no accept step)', async () => {
      await on();
      await busy(r1, 3);
      await busy(r2, 1);
      await busy(r3, 2, 'in_transit');
      const t = await mkTask();
      const done = await logistics.autoAssign(t, NOW);
      expect(done).toMatchObject({ id: t.id, riderId: r2.id, status: 'assigned' });
      // the rider is told "assigned to you", the way a manual assignment tells them; staff get no "task to assign" for it
      expect(notif.toUser).toHaveBeenCalledWith(r2.id, expect.objectContaining({ title: 'New task assigned to you', entityId: t.id }));
      const [audit] = await ds.getRepository(AuditLog).find({ where: { action: 'task.assigned' } });
      expect(audit).toMatchObject({ actor: 'Auto-assignment', role: 'system', entityId: t.id });
      expect(audit.detail).toContain(`-> ${r2.name}`);
    });

    it('never overwrites a supervisor who assigned the leg while the sweep was deciding (it claims unassigned legs only)', async () => {
      await on();
      const t = await mkTask(); // the sweep read it as unassigned ...
      await ds.getRepository(DeliveryTask).update({ id: t.id }, { riderId: r3.id, status: 'assigned' }); // ... then a supervisor gave it to Cy
      expect(await logistics.autoAssign(t, NOW)).toBeNull();
      expect(await ds.getRepository(DeliveryTask).findOneByOrFail({ id: t.id })).toMatchObject({ riderId: r3.id, status: 'assigned' });
      expect(await ds.getRepository(AuditLog).count({ where: { action: 'task.assigned' } })).toBe(0);
    });

    it('counts picked-up and in-transit tasks as busy, but not delivered, failed or unassigned ones', async () => {
      await on();
      await busy(r1, 2, 'delivered');
      await busy(r1, 2, 'failed');
      await busy(r2, 1, 'picked_up');
      await busy(r3, 1, 'in_transit');
      const t = await mkTask();
      expect((await logistics.autoAssign(t, NOW))?.riderId).toBe(r1.id);
    });

    it('spreads work: each new task goes to whoever is least busy at that moment', async () => {
      await on();
      const got: string[] = [];
      for (let i = 0; i < 6; i++) got.push((await logistics.autoAssign(await mkTask(), NOW))!.riderId!);
      const count = (id: string) => got.filter((g) => g === id).length;
      expect([count(r1.id), count(r2.id), count(r3.id)]).toEqual([2, 2, 2]);
    });

    it('breaks a tie by who was given fewer tasks lately, then by name', async () => {
      await on();
      await busy(r1, 2, 'delivered'); // recent work, nothing open
      await busy(r2, 1, 'delivered');
      const t = await mkTask();
      expect((await logistics.autoAssign(t, NOW))?.riderId).toBe(r3.id); // no recent work at all
    });

    it('only considers active riders of the same warehouse', async () => {
      await on();
      await ds.getRepository(User).update({ id: r1.id }, { active: false });
      await mkUser('rider', other.id, { name: 'Aaa Far Away' });
      await busy(r2, 5);
      await busy(r3, 5);
      const t = await mkTask();
      const done = await logistics.autoAssign(t, NOW);
      expect(done?.riderId).toBe(r2.id); // not the inactive r1 (idle), not the other warehouse's idle rider
    });

    it('leaves the task alone with no riders, outside working hours, on a day off, and for legs that are not its kind', async () => {
      await on();
      const t = await mkTask();
      expect(await logistics.autoAssign(t, new Date('2026-11-02T20:00:00Z'))).toBeNull(); // 21:00 local
      expect(await logistics.autoAssign(t, new Date('2026-11-01T10:00:00Z'))).toBeNull(); // Sunday
      expect(await logistics.autoAssign(await mkTask({ kind: 'transfer', toHubId: other.id }), NOW)).toBeNull(); // transfers are planned into runs
      expect(await logistics.autoAssign(await mkTask({ runId: 'run-1' }), NOW)).toBeNull();
      expect(await logistics.autoAssign(await mkTask({ status: 'assigned', riderId: r1.id }), NOW)).toBeNull();
      expect(await logistics.autoAssign(await mkTask({ hubId: null }), NOW)).toBeNull();
      await ds.getRepository(User).update({ hubId: hub.id }, { active: false });
      expect(await logistics.autoAssign(t, NOW)).toBeNull();
      expect((await ds.getRepository(DeliveryTask).findOneByOrFail({ id: t.id })).status).toBe('unassigned');
    });

    it('follows the warehouse working hours and time zone', async () => {
      await on({ workStart: '06:00', workEnd: '22:00', workDays: [1, 2, 3, 4, 5, 6, 7] });
      const t = await mkTask();
      expect(await logistics.autoAssign(t, new Date('2026-11-02T20:00:00Z'))).not.toBeNull(); // 21:00 local, now inside
    });

    it('two attempts on the same task assign it once', async () => {
      await on();
      const t = await mkTask();
      const [a, b] = await Promise.all([logistics.autoAssign(t, NOW), logistics.autoAssign(t, NOW)]);
      expect([a, b].filter(Boolean).length).toBeGreaterThanOrEqual(1);
      const row = await ds.getRepository(DeliveryTask).findOneByOrFail({ id: t.id });
      expect(row.status).toBe('assigned');
      expect(await ds.getRepository(AuditLog).count({ where: { action: 'task.assigned' } })).toBeLessThanOrEqual(2);
    });

    it('the job gives out legs that waited (made while closed or switched off) once the warehouse is open', async () => {
      const waiting = [await mkTask({ age: 2 }), await mkTask({ age: 1 })];
      await on();
      const job = new WarehouseOpsJob(aged, logistics);
      expect(await logistics.autoAssignWaiting(new Date('2026-11-02T20:00:00Z'))).toBe(0); // closed
      expect(await job.run(NOW)).toMatchObject({ autoAssigned: 2 });
      for (const t of waiting) expect((await ds.getRepository(DeliveryTask).findOneByOrFail({ id: t.id })).status).toBe('assigned');
      expect(await job.run(NOW)).toMatchObject({ autoAssigned: 0 }); // idempotent
    });

    it('a warehouse with auto-assignment off keeps its waiting legs for staff', async () => {
      await mkTask();
      expect(await logistics.autoAssignWaiting(NOW)).toBe(0);
    });
  });

  // ── return to seller ───────────────────────────────────────────────────────
  describe('return to seller', () => {
    let s1: Seller;
    let s2: Seller;
    let order: Order;
    const mkSeller = (name: string) => ds.getRepository(Seller).save(ds.getRepository(Seller).create({ name, status: 'approved', pickupAddress: `${name} street` }));
    beforeEach(async () => {
      [s1, s2] = [await mkSeller('Shop One'), await mkSeller('Shop Two')];
      order = await ds.getRepository(Order).save(
        ds.getRepository(Order).create({
          reference: 'SOM-RET',
          customerId: 'cust1',
          customerName: 'Marie',
          status: 'confirmed',
          paymentMethod: 'stripe_card',
          totalUsd: 30,
          items: [
            Object.assign(new OrderItem(), { productId: 'p1', productName: 'Lamp', variant: 'Default', qty: 1, priceUsd: 10, sellerId: s1.id, fulfilment: 'open' }),
            Object.assign(new OrderItem(), { productId: 'p2', productName: 'Mug', variant: 'Default', qty: 2, priceUsd: 10, sellerId: s2.id, fulfilment: 'open' }),
            Object.assign(new OrderItem(), { productId: 'p3', productName: 'Gone', variant: 'Default', qty: 1, priceUsd: 5, sellerId: s2.id, fulfilment: 'cancelled' }),
          ],
        }),
      );
    });
    const delivery = (over: Partial<DeliveryTask> = {}) => mkTask({ orderId: order.id, orderReference: order.reference, ...over });

    it('is for the super admin, operations admin and warehouse supervisors and managers; no other admin role', async () => {
      for (const role of ['admin_finance', 'admin_support', 'admin_marketing', 'admin_moderation']) {
        const t = await delivery();
        await expect(logistics.returnToSeller(t.id, admin(role))).rejects.toThrow(/Only the super admin and the operations admin/);
        expect((await ds.getRepository(DeliveryTask).findOneByOrFail({ id: t.id })).status).toBe('unassigned');
      }
      const ok1 = await delivery();
      await expect(logistics.returnToSeller(ok1.id, admin('admin'))).resolves.toBeTruthy();
    });

    it('closes the stuck delivery and opens one return leg per seller, from the warehouse, with that seller\'s goods', async () => {
      const t = await delivery({ age: 80 });
      const { closed, legs } = await logistics.returnToSeller(t.id, staff(hub, 'supervisor'));
      expect(closed).toMatchObject({ id: t.id, status: 'failed', failureReason: 'Returned to seller' });
      expect(legs).toHaveLength(2);
      expect(legs.map((l) => l.kind)).toEqual(['return_to_seller', 'return_to_seller']);
      for (const l of legs) expect(l).toMatchObject({ status: 'unassigned', fromHubId: hub.id, hubId: hub.id, parentTaskId: t.id, orderId: order.id, disputeId: null });
      const bySeller = new Map(legs.map((l) => [l.sellerId, JSON.parse(l.itemsJson!) as { name: string; qty: number }[]]));
      expect(bySeller.get(s1.id)).toEqual([expect.objectContaining({ name: 'Lamp', qty: 1 })]);
      expect(bySeller.get(s2.id)).toEqual([expect.objectContaining({ name: 'Mug', qty: 2 })]); // the cancelled line does not go back
      expect(legs.find((l) => l.sellerId === s1.id)!.address).toBe('Shop One street');
    });

    it('tells the admins and the customer, audits it, and leaves the order and its money alone', async () => {
      const t = await delivery();
      await logistics.returnToSeller(t.id, admin('admin_operations'));
      expect(notif.toAdmins).toHaveBeenCalledWith(expect.objectContaining({ title: 'Parcel returned to seller', entityId: t.id }));
      expect(notif.toUser).toHaveBeenCalledWith('cust1', expect.objectContaining({ title: 'Order update', entityId: order.id }));
      expect(await ds.getRepository(AuditLog).count({ where: { action: 'parcel.returned_to_seller' } })).toBe(1);
      expect((await ds.getRepository(Order).findOneByOrFail({ id: order.id })).status).toBe('confirmed');
    });

    it('is idempotent: doing it again returns the same legs and creates nothing', async () => {
      const t = await delivery();
      const first = await logistics.returnToSeller(t.id, staff(hub, 'manager'));
      const again = await logistics.returnToSeller(t.id, staff(hub, 'manager'));
      expect(again.legs.map((l) => l.id).sort()).toEqual(first.legs.map((l) => l.id).sort());
      expect(await ds.getRepository(DeliveryTask).count({ where: { kind: 'return_to_seller' } })).toBe(2);
    });

    it('works on an assigned (not yet collected) parcel and tells the rider it left their list', async () => {
      const rider = await mkUser('rider', hub.id);
      const t = await delivery({ status: 'assigned', riderId: rider.id });
      await logistics.returnToSeller(t.id, staff(hub, 'supervisor'));
      expect(emitter.sent.some((e) => e.to === `user:${rider.id}` && e.event === 'task:updated' && e.payload.removed === true)).toBe(true);
    });

    it('is refused for operators, for the supervisor of another warehouse, and for riders', async () => {
      const t = await delivery();
      await expect(logistics.returnToSeller(t.id, staff(hub, 'operator'))).rejects.toThrow(/Only supervisors and managers/);
      await expect(logistics.returnToSeller(t.id, staff(other, 'manager'))).rejects.toThrow(/another warehouse/);
      await expect(logistics.returnToSeller(t.id, { id: 'r', role: 'rider', name: 'R', hubId: hub.id, tier: null })).rejects.toThrow(/Only supervisors and managers/);
      expect((await ds.getRepository(DeliveryTask).findOneByOrFail({ id: t.id })).status).toBe('unassigned');
      expect(await ds.getRepository(DeliveryTask).count({ where: { kind: 'return_to_seller' } })).toBe(0);
    });

    it('is refused once a rider has the parcel, for other kinds of leg, and inside a transfer run', async () => {
      await expect(logistics.returnToSeller((await delivery({ status: 'picked_up' })).id, admin())).rejects.toThrow(/already has this parcel/);
      await expect(logistics.returnToSeller((await delivery({ status: 'in_transit' })).id, admin())).rejects.toThrow(/already has this parcel/);
      await expect(logistics.returnToSeller((await delivery({ kind: 'pickup' })).id, admin())).rejects.toThrow(/Only the delivery to the customer/);
      await expect(logistics.returnToSeller((await delivery({ runId: 'run-9' })).id, admin())).rejects.toThrow(/transfer run/);
      await expect(logistics.returnToSeller('missing', admin())).rejects.toThrow(/not found/);
      expect(await ds.getRepository(DeliveryTask).count({ where: { kind: 'return_to_seller' } })).toBe(0);
    });

    it('the new legs are auto-assigned when the warehouse uses auto-assignment', async () => {
      const rider = await mkUser('rider', hub.id);
      await settings.update(admin(), hub.id, { autoAssign: true, workDays: [1, 2, 3, 4, 5, 6, 7], workStart: '00:00', workEnd: '23:59' });
      const t = await delivery();
      const { legs } = await logistics.returnToSeller(t.id, admin());
      for (const l of legs) expect((await ds.getRepository(DeliveryTask).findOneByOrFail({ id: l.id })).riderId).toBe(rider.id);
    });
  });

  // ── analytics ──────────────────────────────────────────────────────────────
  describe('analytics', () => {
    let a: User;
    let b: User;
    const done = (over: Partial<DeliveryTask> & { took: number; at?: Date }) => {
      const { took, at = hoursAgo(5), ...rest } = over;
      return mkTask({ status: 'delivered', kind: 'delivery', ...rest }).then(async (t) => {
        await ds.getRepository(DeliveryTask).update({ id: t.id }, { createdAt: new Date(at.getTime() - took * 3_600_000), deliveredAt: at, updatedAt: at });
        return t;
      });
    };
    const failed = (over: Partial<DeliveryTask> = {}, at = hoursAgo(5)) =>
      mkTask({ status: 'failed', kind: 'delivery', failureReason: 'Customer not at home', ...over }).then(async (t) => {
        await ds.getRepository(DeliveryTask).update({ id: t.id }, { updatedAt: at });
        return t;
      });
    beforeEach(async () => {
      [a, b] = [await mkUser('rider', hub.id, { name: 'Ann' }), await mkUser('rider', hub.id, { name: 'Ben' })];
    });

    it('on-time rate: deliveries handed over within the warehouse target (default 24 h) of opening at the warehouse', async () => {
      await done({ took: 10, riderId: a.id });
      await done({ took: 24, riderId: a.id }); // exactly on target counts as on time
      await done({ took: 30, riderId: b.id });
      await done({ took: 60, riderId: b.id });
      const r = await analytics.legs(hub.id, { from: '2026-10-25', to: '2026-11-02' }, NOW);
      expect(r.targetHours).toBe(24);
      expect(r.onTime).toEqual({ deliveries: 4, onTime: 2, late: 2, ratePct: 50 });
    });

    it('follows the target the manager sets, and has no rate when there were no deliveries', async () => {
      await done({ took: 30, riderId: a.id });
      await settings.update(admin(), hub.id, { deliveryTargetHours: 36 });
      expect((await analytics.legs(hub.id, { from: '2026-10-25', to: '2026-11-02' }, NOW)).onTime).toMatchObject({ onTime: 1, ratePct: 100 });
      const empty = await analytics.legs(other.id, { from: '2026-10-25', to: '2026-11-02' }, NOW);
      expect(empty.onTime).toEqual({ deliveries: 0, onTime: 0, late: 0, ratePct: null });
      expect(empty.legs).toEqual([]);
    });

    it('average time per leg, by kind, from opening to completion (and hand-over minutes where a rider finishes)', async () => {
      await done({ took: 10 });
      await done({ took: 20 });
      const t = await done({ took: 4, kind: 'pickup', toHubId: hub.id, fromHubId: null });
      await ds.getRepository(DeliveryTask).update({ id: t.id }, { pickedUpAt: hoursAgo(6) });
      const del = await done({ took: 2 });
      await ds.getRepository(DeliveryTask).update({ id: del.id }, { pickedUpAt: new Date(hoursAgo(5).getTime() - 90 * 60_000) });
      const r = await analytics.legs(hub.id, { from: '2026-10-25', to: '2026-11-02' }, NOW);
      const byKind = new Map(r.legs.map((l) => [l.kind, l]));
      expect(byKind.get('delivery')).toMatchObject({ completed: 3, failed: 0, avgHours: 10.7, avgTransitMinutes: 90 });
      expect(byKind.get('pickup')).toMatchObject({ completed: 1, avgHours: 4, avgTransitMinutes: null }); // a hub-bound leg ends with a scan, not a hand-over
    });

    it('per rider: legs completed, failed and success rate; counts only', async () => {
      await done({ took: 5, riderId: a.id });
      await done({ took: 5, riderId: a.id });
      await done({ took: 5, riderId: a.id });
      await failed({ riderId: a.id });
      await failed({ riderId: b.id });
      await failed({ riderId: b.id });
      const r = await analytics.legs(hub.id, { from: '2026-10-25', to: '2026-11-02' }, NOW);
      expect(r.riders).toEqual([
        { riderId: a.id, name: 'Ann', completed: 3, failed: 1, successRatePct: 75 },
        { riderId: b.id, name: 'Ben', completed: 0, failed: 2, successRatePct: 0 },
      ]);
      expect(r.totals).toEqual({ completed: 3, failed: 3, voided: 0 });
      const text = JSON.stringify(r);
      expect(text).not.toMatch(/usd|pay|salary|earn|wage|commission/i);
    });

    it('does not count a leg the system or staff closed against the rider', async () => {
      await done({ took: 5, riderId: a.id });
      await failed({ riderId: a.id, failureReason: 'Returned to seller' });
      await failed({ riderId: a.id, failureReason: 'Order cancelled' });
      await failed({ riderId: a.id, failureReason: 'Customer refused' });
      const r = await analytics.legs(hub.id, { from: '2026-10-25', to: '2026-11-02' }, NOW);
      expect(r.riders).toEqual([{ riderId: a.id, name: 'Ann', completed: 1, failed: 1, successRatePct: 50 }]);
      expect(r.totals).toEqual({ completed: 1, failed: 1, voided: 2 });
    });

    it('filters by date range (inclusive of the whole last day) and by warehouse', async () => {
      await done({ took: 5, riderId: a.id, at: new Date('2026-10-10T12:00:00Z') });
      await done({ took: 5, riderId: a.id, at: new Date('2026-10-20T23:30:00Z') });
      await done({ took: 5, riderId: a.id, at: new Date('2026-10-21T00:30:00Z') });
      await done({ took: 5, riderId: a.id, at: new Date('2026-10-20T10:00:00Z'), hubId: other.id, fromHubId: other.id });
      expect((await analytics.legs(hub.id, { from: '2026-10-20', to: '2026-10-20' }, NOW)).totals.completed).toBe(1);
      expect((await analytics.legs(hub.id, { from: '2026-10-10', to: '2026-10-20' }, NOW)).totals.completed).toBe(2);
      expect((await analytics.legs(hub.id, { from: '2026-10-01', to: '2026-10-31' }, NOW)).totals.completed).toBe(3);
      expect((await analytics.legs(null, { from: '2026-10-01', to: '2026-10-31' }, NOW)).totals.completed).toBe(4); // admins: every warehouse
      expect((await analytics.legs(null, { from: '2026-10-01', to: '2026-10-31' }, NOW)).targetHours).toBeNull();
    });

    it('defaults to the last 30 days', async () => {
      await done({ took: 5, at: hoursAgo(24 * 29) });
      await done({ took: 5, at: hoursAgo(24 * 40) });
      expect((await analytics.legs(hub.id, undefined, NOW)).totals.completed).toBe(1);
    });

    describe('range validation', () => {
      it('accepts dates, defaults and ISO times', () => {
        expect(rangeOf({ from: '2026-10-01', to: '2026-10-31' }, NOW)).toMatchObject({ days: 31 });
        expect(rangeOf({}, NOW).days).toBe(30);
        expect(rangeOf({ from: '2026-10-01T00:00:00Z', to: '2026-10-02T00:00:00Z' }, NOW).days).toBe(1);
        expect(rangeOf({ from: '2026-10-31', to: '2026-10-31' }, NOW).days).toBe(1);
      });
      it.each([
        [{ from: '2026-11-01', to: '2026-10-01' }, /start date must be before/],
        [{ from: 'yesterday' }, /Start date must be a date/],
        [{ to: '2026-13-45' }, /End date must be a date/],
        [{ from: 5 }, /Start date must be a date/],
        [{ from: '2024-01-01', to: '2026-01-01' }, /at most 366 days/],
      ])('refuses %j', (input, message) => {
        expect(() => rangeOf(input as never, NOW)).toThrow(message);
      });
    });
  });
});
