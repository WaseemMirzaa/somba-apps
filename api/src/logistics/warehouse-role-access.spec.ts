import { DataSource } from 'typeorm';
import { AuditLog, DeliveryKind, DeliveryStatus, DeliveryTask, ENTITIES, Hub, HubOpsSettings, Order, OrderItem, Product, Seller, TransferRun, User, WarehouseException } from '../database/entities';
import { AgedParcelsService } from './aged-parcels.service';
import { HubOpsSettingsService } from './hub-ops-settings.service';
import { HubsService } from './hubs.service';
import { LogisticsGateway } from './logistics.gateway';
import { Actor, LogisticsService } from './logistics.service';
import { OpsAnalyticsService } from './ops-analytics.service';
import { RunsService } from './runs.service';
import { TransfersGateway } from './transfers.gateway';
import { WarehouseOpsGateway } from './warehouse-ops.gateway';
import { WarehouseOpsJob } from './warehouse-ops.job';
import { DESK_ADMINS_ONLY } from './tiers';
import { WarehouseService } from '../warehouse/warehouse.service';
import { recordingEmitter } from '../testing/test-db';

/**
 * The warehouse and logistics desk belongs to the desk admins (super admin, operations) and to warehouse staff of the
 * warehouse concerned, by tier. The other four admin roles (marketing, moderation, support, finance) are refused at every
 * socket event and at the service, a direct socket call included, and nothing changes in the database. Built on a real
 * in-memory SQLite schema so the refusals are shown not to have written anything.
 */
describe('warehouse and logistics desk: who may work it', () => {
  let ds: DataSource;
  let emitter: ReturnType<typeof recordingEmitter>;
  let settings: HubOpsSettingsService;
  let logistics: LogisticsService;
  let runs: RunsService;
  let warehouse: WarehouseService;
  let logisticsGw: LogisticsGateway;
  let transfersGw: TransfersGateway;
  let opsGw: WarehouseOpsGateway;
  let hubA: Hub;
  let hubB: Hub;
  let riderA: User;
  let supA: User;
  let opA: User;
  let supB: User;
  let mgrB: User;
  let seq = 0;
  const notif = { toUser: jest.fn(async () => undefined), toUsers: jest.fn(async () => undefined), toAdmins: jest.fn(async () => undefined), toRole: jest.fn(async () => undefined) };

  /** The four admin roles that have no business in the warehouse. */
  const OTHER_ADMINS = ['admin_marketing', 'admin_moderation', 'admin_support', 'admin_finance'];
  const DESK_ADMINS = ['admin', 'admin_operations'];
  const sock = (role: string, id = `${role}-1`) => ({ data: { user: { id, role, name: `${role} name` } } }) as never;
  const asUser = (u: User) => sock(u.role, u.id);

  const mkHub = (name: string) => ds.getRepository(Hub).save(ds.getRepository(Hub).create({ name, city: 'Kinshasa', country: 'CD', lat: -4.3, lng: 15.3 }));
  const mkUser = (role: User['role'], hubId: string | null, extra: Partial<User> = {}) => {
    const n = ++seq;
    return ds.getRepository(User).save(ds.getRepository(User).create({ emailHash: `h${n}`, email: `u${n}@t.test`, passwordHash: 'x', name: `${role}${n}`, role, hubId, ...extra }));
  };
  const mkTask = async (over: Partial<DeliveryTask> = {}) => {
    const t = await ds.getRepository(DeliveryTask).save(
      ds.getRepository(DeliveryTask).create({ orderId: `o${++seq}`, orderReference: `SOM-${seq}`, kind: 'delivery' as DeliveryKind, status: 'unassigned' as DeliveryStatus, hubId: hubA.id, fromHubId: hubA.id, address: '12 Rue du Lac, Gombe', ...over }),
    );
    return t;
  };
  const taskRow = (id: string) => ds.getRepository(DeliveryTask).findOneByOrFail({ id });
  /** A parcel a rider collected from a seller and brought to warehouse A: ready to scan in. */
  const mkPickup = () => mkTask({ kind: 'pickup', status: 'picked_up', hubId: hubA.id, fromHubId: null, toHubId: hubA.id });
  /** A customer parcel at warehouse A with its rider: ready to hand over. */
  const mkOutbound = () => mkTask({ status: 'assigned', riderId: riderA.id });
  /** A transfer leg waiting at A for warehouse B. */
  const mkTransfer = () => mkTask({ kind: 'transfer', status: 'unassigned', hubId: hubA.id, fromHubId: hubA.id, toHubId: hubB.id });

  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true });
    await ds.initialize();
    emitter = recordingEmitter();
    jest.clearAllMocks();
    hubA = await mkHub('Entrepôt Gombe');
    hubB = await mkHub('Entrepôt Limete');
    riderA = await mkUser('rider', hubA.id);
    supA = await mkUser('warehouse_staff', hubA.id, { warehouseTier: 'supervisor' });
    opA = await mkUser('warehouse_staff', hubA.id, { warehouseTier: 'operator' });
    supB = await mkUser('warehouse_staff', hubB.id, { warehouseTier: 'supervisor' });
    mgrB = await mkUser('warehouse_staff', hubB.id, { warehouseTier: 'manager' });
    settings = new HubOpsSettingsService(ds.getRepository(HubOpsSettings), ds.getRepository(Hub), ds.getRepository(AuditLog), emitter as never);
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
    runs = new RunsService(
      ds.getRepository(TransferRun),
      ds.getRepository(DeliveryTask),
      ds.getRepository(User),
      ds.getRepository(Hub),
      ds.getRepository(WarehouseException),
      ds.getRepository(AuditLog),
      logistics,
      notif as never,
      emitter as never,
    );
    warehouse = new WarehouseService(ds.getRepository(Hub), ds.getRepository('WarehouseBatch') as never, ds.getRepository(DeliveryTask), ds.getRepository(Product), ds.getRepository(Order), ds.getRepository(WarehouseException), emitter as never, notif as never, {} as never, {} as never, logistics, settings);
    const hubsSvc = new HubsService(ds.getRepository(Hub), ds.getRepository(User), {} as never, emitter as never, {} as never, {} as never);
    jest.spyOn(hubsSvc, 'list').mockResolvedValue([{ id: hubA.id, name: hubA.name, city: 'Kinshasa', country: 'CD', lat: 1, lng: 2, active: true, areaId: null, activeRiders: 3, staffCount: 4, capacity: 500, address: 'secret street' }] as never);
    logisticsGw = new LogisticsGateway(logistics, {} as never, hubsSvc as never, {} as never, {} as never, ds.getRepository(User));
    transfersGw = new TransfersGateway({ list: jest.fn(async () => []), preview: jest.fn(async () => ({})) } as never, runs, ds.getRepository(User));
    const aged = new AgedParcelsService(ds.getRepository(DeliveryTask), ds.getRepository('AgedAlert') as never, ds.getRepository(User), settings, notif as never);
    opsGw = new WarehouseOpsGateway(settings, aged, new OpsAnalyticsService(ds.getRepository(DeliveryTask), ds.getRepository(User), settings), logistics, new WarehouseOpsJob(aged, logistics), ds.getRepository(User));
  });
  afterEach(async () => ds.destroy());

  // ── dispatch: assign, reassign, unassign ───────────────────────────────────
  describe('dispatch (logistics:assign, riders)', () => {
    it.each(OTHER_ADMINS)('%s cannot assign a rider, list the riders of a task or read the queue, whatever the warehouse', async (role) => {
      const t = await mkTransfer();
      expect(await logisticsGw.assign(sock(role), { taskId: t.id, riderId: riderA.id })).toEqual({ ok: false, error: DESK_ADMINS_ONLY });
      expect(await logisticsGw.riders(sock(role), { taskId: t.id })).toEqual({ ok: false, error: DESK_ADMINS_ONLY });
      expect(await logisticsGw.queue(sock(role), { hubId: hubA.id })).toEqual({ ok: false, error: DESK_ADMINS_ONLY });
      expect(await logisticsGw.custody(sock(role), { hubId: hubA.id })).toEqual({ ok: false, error: DESK_ADMINS_ONLY });
      expect(await (await taskRow(t.id)).riderId).toBeNull();
      expect((await taskRow(t.id)).status).toBe('unassigned');
    });

    it.each(DESK_ADMINS)('%s still assigns, reassigns and reads the queue', async (role) => {
      const t = await mkTask();
      expect(await logisticsGw.assign(sock(role), { taskId: t.id, riderId: riderA.id })).toMatchObject({ ok: true, data: { status: 'assigned', riderId: riderA.id } });
      expect(await logisticsGw.queue(sock(role), { hubId: hubA.id })).toMatchObject({ ok: true });
      expect(await logisticsGw.riders(sock(role), { taskId: t.id })).toMatchObject({ ok: true });
    });

    it('a supervisor assigns in their own warehouse; an operator does not; a supervisor of another warehouse cannot touch the task', async () => {
      const t = await mkTask();
      expect(await logisticsGw.assign(asUser(opA), { taskId: t.id, riderId: riderA.id })).toEqual({ ok: false, error: 'Only supervisors and managers can assign riders.' });
      expect(await logisticsGw.assign(asUser(supB), { taskId: t.id, riderId: riderA.id })).toEqual({ ok: false, error: 'This task belongs to another warehouse.' });
      expect(await logisticsGw.riders(asUser(supB), { taskId: t.id })).toEqual({ ok: false, error: 'This task belongs to another warehouse.' });
      expect((await taskRow(t.id)).riderId).toBeNull();
      expect(await logisticsGw.assign(asUser(supA), { taskId: t.id, riderId: riderA.id })).toMatchObject({ ok: true, data: { status: 'assigned' } });
    });

    it('the service refuses the other admin roles too (no gateway in the way)', async () => {
      const t = await mkTask();
      for (const role of OTHER_ADMINS) {
        const actor: Actor = { id: `${role}-1`, role, name: role, hubId: null, tier: null };
        await expect(logistics.assign(t.id, riderA.id, actor)).rejects.toThrow(/Only supervisors and managers can assign riders/);
        expect(logistics.desk(t, actor)).toEqual({ assign: false, scanIn: false, scanOut: false });
      }
      expect((await taskRow(t.id)).riderId).toBeNull();
    });
  });

  // ── scanning parcels in and out ────────────────────────────────────────────
  describe('scanning (logistics:scanIn, scanOut, dispatchTransfer)', () => {
    it.each(OTHER_ADMINS)('%s cannot scan a parcel in or out', async (role) => {
      const inbound = await mkPickup();
      const outbound = await mkOutbound();
      expect(await logisticsGw.scanIn(sock(role), { taskId: inbound.id })).toEqual({ ok: false, error: DESK_ADMINS_ONLY });
      expect(await logisticsGw.scanOut(sock(role), { taskId: outbound.id })).toEqual({ ok: false, error: DESK_ADMINS_ONLY });
      expect(await logisticsGw.dispatchTransfer(sock(role), { taskId: outbound.id })).toEqual({ ok: false, error: DESK_ADMINS_ONLY });
      expect((await taskRow(inbound.id)).status).toBe('picked_up');
      expect((await taskRow(outbound.id)).status).toBe('assigned');
      expect(await ds.getRepository(AuditLog).count({ where: { action: 'parcel.received' } })).toBe(0);
    });

    it.each(OTHER_ADMINS)('%s is refused by the service itself when it scans', async (role) => {
      const inbound = await mkPickup();
      const outbound = await mkOutbound();
      const actor: Actor = { id: `${role}-1`, role, name: role, hubId: null, tier: null };
      await expect(logistics.onScanIn(inbound.id, hubA.id, actor)).rejects.toThrow(DESK_ADMINS_ONLY);
      await expect(logistics.scanOut(outbound.id, hubA.id, actor)).rejects.toThrow(DESK_ADMINS_ONLY);
      expect((await taskRow(inbound.id)).status).toBe('picked_up');
      expect((await taskRow(outbound.id)).status).toBe('assigned');
    });

    it.each(DESK_ADMINS)('%s still scans in and out', async (role) => {
      const inbound = await mkPickup();
      const outbound = await mkOutbound();
      expect(await logisticsGw.scanIn(sock(role), { taskId: inbound.id })).toMatchObject({ ok: true, data: { task: { status: 'delivered' } } });
      expect(await logisticsGw.scanOut(sock(role), { taskId: outbound.id })).toMatchObject({ ok: true, data: { status: 'picked_up' } });
    });

    it('warehouse staff scan their own warehouse only, operators included', async () => {
      const inbound = await mkPickup();
      const outbound = await mkOutbound();
      expect(await logisticsGw.scanIn(asUser(mgrB), { taskId: inbound.id })).toEqual({ ok: false, error: 'This parcel is not due at your warehouse.' });
      expect(await logisticsGw.scanOut(asUser(supB), { taskId: outbound.id })).toEqual({ ok: false, error: 'This parcel does not leave from your warehouse.' });
      expect((await taskRow(inbound.id)).status).toBe('picked_up');
      expect((await taskRow(outbound.id)).status).toBe('assigned');
      expect(await logisticsGw.scanIn(asUser(opA), { taskId: inbound.id })).toMatchObject({ ok: true });
      expect(await logisticsGw.scanOut(asUser(opA), { taskId: outbound.id })).toMatchObject({ ok: true });
    });
  });

  // ── the rest of the desk: hub directory, tiers, return legs ─────────────────
  describe('hub people and tiers, return legs, the hub directory', () => {
    it.each(OTHER_ADMINS)('%s cannot read a warehouse’s staff list or promote a hub manager', async (role) => {
      expect(await logisticsGw.hubsPeople(sock(role), { hubId: hubA.id })).toEqual({ ok: false, error: DESK_ADMINS_ONLY });
      expect(await logisticsGw.hubsSetTier(sock(role), { userId: opA.id, tier: 'manager' })).toEqual({ ok: false, error: DESK_ADMINS_ONLY });
      expect((await ds.getRepository(User).findOneByOrFail({ id: opA.id })).warehouseTier).toBe('operator');
      expect(await logisticsGw.createReturnPickup(sock(role), { disputeId: 'd', orderId: 'o' })).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await logisticsGw.createReplacementDelivery(sock(role), { orderId: 'o' })).toEqual({ ok: false, error: 'Not allowed.' });
    });

    it('the desk admins promote; a manager of another warehouse does not', async () => {
      expect(await logisticsGw.hubsSetTier(sock('admin_operations'), { userId: opA.id, tier: 'supervisor' })).toMatchObject({ ok: true });
      expect((await ds.getRepository(User).findOneByOrFail({ id: opA.id })).warehouseTier).toBe('supervisor');
      expect(await logisticsGw.hubsSetTier(asUser(mgrB), { userId: supA.id, tier: 'operator' })).toMatchObject({ ok: false, error: 'This person works at another warehouse.' });
    });

    it('the full hub directory (head counts, addresses) is for the desk; every other admin role gets the public list', async () => {
      for (const role of [...DESK_ADMINS, 'warehouse_staff']) {
        const res = (await logisticsGw.hubsList(sock(role, role === 'warehouse_staff' ? supA.id : undefined))) as { data: Record<string, unknown>[] };
        expect(res.data[0]).toHaveProperty('activeRiders');
        expect(res.data[0]).toHaveProperty('address');
      }
      for (const role of [...OTHER_ADMINS, 'customer']) {
        const res = (await logisticsGw.hubsList(sock(role))) as { data: Record<string, unknown>[] };
        expect(res.data[0]).toMatchObject({ id: hubA.id, name: hubA.name });
        expect(res.data[0]).not.toHaveProperty('activeRiders');
        expect(res.data[0]).not.toHaveProperty('address');
      }
    });
  });

  // ── batches and transfer runs ──────────────────────────────────────────────
  describe('batches and runs', () => {
    it.each(OTHER_ADMINS)('%s cannot build a batch (service) or touch any run event', async (role) => {
      const t1 = await mkTask();
      const t2 = await mkTask();
      const actor: Actor = { id: `${role}-1`, role, name: role, hubId: null, tier: null };
      await expect(warehouse.buildBatch(actor, [t1.id, t2.id], { id: riderA.id, name: 'R', hubId: hubA.id })).rejects.toThrow(/Only supervisors and managers can assign riders/);
      expect(await ds.getRepository('WarehouseBatch').count()).toBe(0);
      expect((await taskRow(t1.id)).riderId).toBeNull();

      const transfer = await mkTransfer();
      const s = sock(role);
      const refused = { ok: false, error: DESK_ADMINS_ONLY };
      expect(await transfersGw.runList(s, {})).toEqual(refused);
      expect(await transfersGw.runProposals(s, { hubId: hubA.id })).toEqual(refused);
      expect(await transfersGw.createRun(s, { toHubId: hubB.id, taskIds: [transfer.id], fromHubId: hubA.id })).toEqual(refused);
      expect(await transfersGw.updateRun(s, { runId: 'r' })).toEqual(refused);
      expect(await transfersGw.splitRun(s, { runId: 'r' })).toEqual(refused);
      expect(await transfersGw.assignRun(s, { runId: 'r', riderId: riderA.id })).toEqual(refused);
      expect(await transfersGw.dispatchRun(s, { runId: 'r' })).toEqual(refused);
      expect(await transfersGw.receiveRun(s, { runId: 'r' })).toEqual(refused);
      expect(await transfersGw.closeRun(s, { runId: 'r' })).toEqual(refused);
      expect(await transfersGw.lanesList(s, {})).toEqual(refused);
      expect(await transfersGw.routesPreview(s, { fromHubId: hubA.id, toHubId: hubB.id })).toEqual(refused);
      expect(await ds.getRepository(TransferRun).count()).toBe(0);
      expect((await taskRow(transfer.id)).runId ?? null).toBeNull();
    });

    it('the runs service refuses the other admin roles directly', async () => {
      const transfer = await mkTransfer();
      const run = await runs.create({ id: 'a', role: 'admin', name: 'A', hubId: null, tier: null }, { toHubId: hubB.id, taskIds: [transfer.id] });
      for (const role of OTHER_ADMINS) {
        const actor: Actor = { id: `${role}-1`, role, name: role, hubId: null, tier: null };
        await expect(runs.list(actor, {})).rejects.toThrow(DESK_ADMINS_ONLY);
        await expect(runs.proposals(actor, hubA.id)).rejects.toThrow(DESK_ADMINS_ONLY);
        await expect(runs.create(actor, { toHubId: hubB.id, taskIds: [transfer.id], fromHubId: hubA.id })).rejects.toThrow(DESK_ADMINS_ONLY);
        await expect(runs.assign(actor, { runId: run.id, riderId: riderA.id })).rejects.toThrow(DESK_ADMINS_ONLY);
        await expect(runs.dispatch(actor, { runId: run.id })).rejects.toThrow(DESK_ADMINS_ONLY);
        await expect(runs.receive(actor, { runId: run.id })).rejects.toThrow(DESK_ADMINS_ONLY);
        await expect(runs.close(actor, { runId: run.id })).rejects.toThrow(DESK_ADMINS_ONLY);
      }
      expect((await ds.getRepository(TransferRun).findOneByOrFail({ id: run.id })).status).toBe('planned');
    });

    it('the desk admins and the sending warehouse’s supervisor run them; another warehouse’s supervisor cannot send, only its receiver may receive', async () => {
      const transfer = await mkTransfer();
      for (const role of DESK_ADMINS) expect(await transfersGw.runList(sock(role), {})).toMatchObject({ ok: true });
      const made = await transfersGw.createRun(asUser(supA), { toHubId: hubB.id, taskIds: [transfer.id] });
      expect(made).toMatchObject({ ok: true, data: { fromHubId: hubA.id, toHubId: hubB.id } });
      const runId = (made as { data: { id: string } }).data.id;
      // B is only the receiver: it cannot change, assign or dispatch the run A sends
      expect(await transfersGw.assignRun(asUser(supB), { runId, riderId: riderA.id })).toEqual({ ok: false, error: 'This task belongs to another warehouse.' });
      expect(await transfersGw.dispatchRun(asUser(mgrB), { runId })).toEqual({ ok: false, error: 'This task belongs to another warehouse.' });
      expect(await transfersGw.assignRun(asUser(supA), { runId, riderId: riderA.id })).toMatchObject({ ok: true });
    });
  });

  // ── warehouse settings, aged parcels, analytics, the job ───────────────────
  describe('warehouse operations gateway', () => {
    it.each(OTHER_ADMINS)('%s cannot read or change warehouse settings, the aged board or the analytics, or run the job', async (role) => {
      const s = sock(role);
      const t = await mkTask();
      expect(await opsGw.get(s, { hubId: hubA.id })).toEqual({ ok: false, error: DESK_ADMINS_ONLY });
      expect(await opsGw.update(s, { hubId: hubA.id, batchSize: 5 })).toEqual({ ok: false, error: DESK_ADMINS_ONLY });
      expect(await opsGw.summary(s, { hubId: hubA.id })).toEqual({ ok: false, error: DESK_ADMINS_ONLY });
      expect(await opsGw.returnToSeller(s, { taskId: t.id })).toEqual({ ok: false, error: DESK_ADMINS_ONLY });
      expect(await opsGw.legs(s, { hubId: hubA.id })).toEqual({ ok: false, error: DESK_ADMINS_ONLY });
      expect(await opsGw.runNow(s)).toEqual({ ok: false, error: DESK_ADMINS_ONLY });
      expect((await settings.ops(hubA.id)).batchSize).toBe(20);
    });

    it.each(DESK_ADMINS)('%s still reads the settings and the aged board', async (role) => {
      expect(await opsGw.get(sock(role), { hubId: hubA.id })).toMatchObject({ ok: true, data: { hubId: hubA.id } });
      expect(await opsGw.summary(sock(role), { hubId: hubA.id })).toMatchObject({ ok: true });
    });
  });

  // ── what is pushed live ────────────────────────────────────────────────────
  describe('live pushes of tasks (customer addresses)', () => {
    it('a task update goes to the desk admins and the warehouses concerned, never to marketing, moderation, support or finance', async () => {
      const t = await mkTask({ toHubId: hubB.id });
      emitter.sent.length = 0;
      await logistics.emitTask(t);
      const tasks = emitter.sent.filter((e) => e.event === 'task:updated' || e.event === 'delivery:updated');
      expect(tasks.length).toBeGreaterThan(0);
      const audiences = tasks.map((e) => e.to).join('|');
      for (const role of OTHER_ADMINS) expect(audiences).not.toContain(role);
      expect(tasks.some((e) => e.to === 'admin,admin_operations')).toBe(true);
      expect(tasks.some((e) => e.to === `hub:${hubA.id}`)).toBe(true);
    });

    it('a batch built by a supervisor is announced to the desk admins and that warehouse only', async () => {
      const t = await mkTask();
      emitter.sent.length = 0;
      await warehouse.buildBatch({ id: supA.id, role: 'warehouse_staff', name: 'Sup', hubId: hubA.id, tier: 'supervisor' }, [t.id], { id: riderA.id, name: 'R', hubId: hubA.id });
      const batch = emitter.sent.filter((e) => e.event === 'batch:updated');
      expect(batch.map((e) => e.to)).toEqual(['admin,admin_operations', `hub:${hubA.id}`]);
    });
  });
});
