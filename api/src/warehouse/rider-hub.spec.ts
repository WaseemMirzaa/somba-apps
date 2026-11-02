import { DataSource } from 'typeorm';
import { DeliveryTask, ENTITIES, Hub, Order, User } from '../database/entities';
import { tasksOfHub } from '../logistics/hub-scope';
import { RiderService } from './rider.service';

/** Riders belong to one warehouse and only ever see the tasks assigned to them. */
describe('riders, warehouses and tasks', () => {
  let ds: DataSource;
  let svc: RiderService;
  let seq = 0;

  const mkHub = (name: string) => ds.getRepository(Hub).save(ds.getRepository(Hub).create({ name, city: 'Kinshasa', lat: -4.3, lng: 15.3 }));
  const mkRider = (hubId: string | null, active = true) => {
    const n = ++seq;
    return ds.getRepository(User).save(ds.getRepository(User).create({ emailHash: `e${n}`, email: `r${n}@t.test`, passwordHash: 'x', name: `Rider ${n}`, role: 'rider', hubId, active }));
  };
  const mkTask = (o: Partial<DeliveryTask> & { orderId: string }) =>
    ds.getRepository(DeliveryTask).save(ds.getRepository(DeliveryTask).create({ orderReference: `SOM-${++seq}`, status: 'unassigned', kind: 'delivery', ...o }));

  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true });
    await ds.initialize();
    const logistics = { viewMany: async (rows: DeliveryTask[]) => rows.map((t) => ({ kind: t.kind, from: null, to: null })) };
    svc = new RiderService(ds.getRepository(DeliveryTask), ds.getRepository(Order), ds.getRepository(User), ds.getRepository(Hub), logistics as never);
  });
  afterEach(async () => ds.destroy());

  it("lists a warehouse's active riders with their open workload, and every rider for an admin", async () => {
    const [h1, h2] = [await mkHub('H1'), await mkHub('H2')];
    const [r1, r2, r3] = [await mkRider(h1.id), await mkRider(h2.id), await mkRider(h1.id, false)];
    await mkTask({ orderId: 'o1', riderId: r1.id, status: 'assigned', hubId: h1.id });
    await mkTask({ orderId: 'o2', riderId: r1.id, status: 'delivered', hubId: h1.id });
    const h1Riders = await svc.activeRiders(h1.id);
    expect(h1Riders.map((r) => r.id)).toEqual([r1.id]);
    expect(h1Riders[0].activeTasks).toBe(1);
    expect((await svc.activeRiders()).map((r) => r.id).sort()).toEqual([r1.id, r2.id].sort());
    expect((await svc.activeRiders()).map((r) => r.id)).not.toContain(r3.id);
  });

  it("shows a rider only the tasks assigned to them: no open pool, nothing of another rider's", async () => {
    const h1 = await mkHub('H1');
    const [me, other] = [await mkRider(h1.id), await mkRider(h1.id)];
    const mine = await mkTask({ orderId: 'o1', riderId: me.id, status: 'assigned', hubId: h1.id });
    await mkTask({ orderId: 'o2', riderId: null, status: 'unassigned', hubId: h1.id }); // waiting in the warehouse queue
    await mkTask({ orderId: 'o3', riderId: other.id, status: 'assigned', hubId: h1.id });
    const q = await svc.queue(me.id);
    expect(q.map((t) => t.id)).toEqual([mine.id]);
    expect(q[0]).toMatchObject({ kind: 'delivery', status: 'assigned', hubId: h1.id });
    expect('zoneId' in q[0]).toBe(false);
  });

  it("tells a rider their warehouse, with its position (no zones any more)", async () => {
    const h1 = await mkHub('H1');
    const me = await mkRider(h1.id);
    const a = await svc.assignment(me.id);
    expect(a.hub).toMatchObject({ id: h1.id, name: 'H1', lat: -4.3, lng: 15.3 });
    expect(Object.keys(a)).toEqual(['hub']);
  });

  it('workStats: counts completed, failed and active across every kind, with the breakdown by kind (counts only)', async () => {
    const h1 = await mkHub('H1');
    const [me, other] = [await mkRider(h1.id), await mkRider(h1.id)];
    await mkTask({ orderId: 'o1', riderId: me.id, status: 'delivered', kind: 'delivery', codAmountUsd: 40, hubId: h1.id });
    await mkTask({ orderId: 'o2', riderId: me.id, status: 'delivered', kind: 'delivery', codAmountUsd: 10, hubId: h1.id });
    await mkTask({ orderId: 'o3', riderId: me.id, status: 'delivered', kind: 'pickup', hubId: h1.id });
    await mkTask({ orderId: 'o4', riderId: me.id, status: 'delivered', kind: 'transfer', hubId: h1.id });
    await mkTask({ orderId: 'o5', riderId: me.id, status: 'in_transit', kind: 'delivery', codAmountUsd: 99, hubId: h1.id });
    await mkTask({ orderId: 'o6', riderId: me.id, status: 'failed', kind: 'delivery', hubId: h1.id });
    await mkTask({ orderId: 'o7', riderId: other.id, status: 'delivered', kind: 'delivery', hubId: h1.id });
    const e = await svc.workStats(me.id);
    expect(e).toMatchObject({ totalTasks: 6, completed: 4, active: 1, failed: 1, codCollectedUsd: 50, successRate: 80, delivered: 4 });
    expect(e.byKind).toEqual([
      { kind: 'pickup', count: 1 },
      { kind: 'transfer', count: 1 },
      { kind: 'delivery', count: 2 },
    ]);
    expect(e.byKind.reduce((s, k) => s + k.count, 0)).toBe(e.completed);
  });

  it('workStats: today and the last 7 days follow deliveredAt, in UTC days', async () => {
    const h1 = await mkHub('H1');
    const [me, other] = [await mkRider(h1.id), await mkRider(h1.id)];
    const now = new Date('2026-11-02T12:00:00.000Z');
    const at = (iso: string) => new Date(iso);
    const done = (orderId: string, deliveredAt: Date | null, riderId = me.id) => mkTask({ orderId, riderId, status: 'delivered', hubId: h1.id, deliveredAt });
    await done('a', at('2026-11-02T00:00:00.000Z')); // first second of today
    await done('b', at('2026-11-02T09:30:00.000Z'));
    await done('c', at('2026-11-01T23:59:59.000Z')); // yesterday, last second
    await done('d', at('2026-10-27T00:00:00.000Z')); // 6 days before today: still in the 7 days
    await done('e', at('2026-10-26T23:59:59.000Z')); // 7 days before: out
    await done('f', null); // an old row with no timestamp counts as completed but not in any window
    await done('g', at('2026-11-02T10:00:00.000Z'), other.id); // someone else's
    await mkTask({ orderId: 'h', riderId: me.id, status: 'failed', hubId: h1.id, deliveredAt: at('2026-11-02T11:00:00.000Z') });
    const e = await svc.workStats(me.id, now);
    expect(e).toMatchObject({ completed: 6, completedToday: 2, completedLast7Days: 4, failed: 1 });
  });

  it('workStats: successRate is a whole percent of finished tasks, null when nothing is finished', async () => {
    const h1 = await mkHub('H1');
    const me = await mkRider(h1.id);
    await mkTask({ orderId: 'o1', riderId: me.id, status: 'assigned', hubId: h1.id });
    expect((await svc.workStats(me.id)).successRate).toBeNull();
    await mkTask({ orderId: 'o2', riderId: me.id, status: 'delivered', hubId: h1.id });
    await mkTask({ orderId: 'o3', riderId: me.id, status: 'delivered', hubId: h1.id });
    await mkTask({ orderId: 'o4', riderId: me.id, status: 'failed', hubId: h1.id });
    expect((await svc.workStats(me.id)).successRate).toBe(67); // 2 of 3
    await mkTask({ orderId: 'o5', riderId: me.id, status: 'failed', hubId: h1.id });
    expect((await svc.workStats(me.id)).successRate).toBe(50);
  });

  it('workStats: riders are salaried, so there is no money in the payload but the cash collected', async () => {
    const h1 = await mkHub('H1');
    const me = await mkRider(h1.id);
    await mkTask({ orderId: 'o1', riderId: me.id, status: 'delivered', hubId: h1.id, codAmountUsd: 12 });
    const e = await svc.workStats(me.id);
    const json = JSON.stringify(e);
    expect(json).not.toMatch(/earning|perTask|payUsd|rateUsd/i);
    expect(Object.keys(e).filter((k) => /usd/i.test(k))).toEqual(['codCollectedUsd']);
    expect(e.byKind.every((k) => Object.keys(k).sort().join() === 'count,kind')).toBe(true);
  });

  it('workStats: a rider with nothing done has zeros, no rate and an empty breakdown', async () => {
    const me = await mkRider(null);
    expect(await svc.workStats(me.id)).toEqual({
      totalTasks: 0, completed: 0, active: 0, failed: 0, completedToday: 0, completedLast7Days: 0, successRate: null, byKind: [], codCollectedUsd: 0, delivered: 0,
    });
  });

  it("a warehouse's task filter covers the legs it manages, sends or receives", () => {
    expect(tasksOfHub({ status: 'unassigned' }, 'H1')).toEqual([
      { status: 'unassigned', hubId: 'H1' },
      { status: 'unassigned', fromHubId: 'H1' },
      { status: 'unassigned', toHubId: 'H1' },
    ]);
    expect(tasksOfHub({ status: 'unassigned' }, null)).toEqual({ status: 'unassigned' });
  });
});
