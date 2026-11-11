import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { AuditLog, DeliveryTask, ENTITIES, Hub, Order, User } from '../database/entities';
import { LogisticsService } from '../logistics/logistics.service';
import type { Actor } from '../logistics/logistics.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { DeliveryService } from './delivery.service';
import { lockAfter, sameCode, triesLeft } from './delivery-code-lock';

/**
 * RD-01 / A-13: the 4-digit delivery code had no attempt limit, so a rider who was not at the door could try all 10,000
 * codes and finish the delivery without the customer. Real (in-memory SQLite) schema, the real
 * DeliveryService and LogisticsService; only the emitter and the notification sender are stand-ins.
 */
describe('delivery code lockout (RD-01)', () => {
  let ds: DataSource;
  let delivery: DeliveryService;
  let logistics: LogisticsService;
  let setting: Record<string, string>;
  let rider: User;
  let hub: Hub;
  let task: DeliveryTask;
  let seq = 0;
  const CODE = '4321';
  const notif = { toUser: jest.fn(async () => undefined), toUsers: jest.fn(async () => undefined), toAdmins: jest.fn(async () => undefined), toRole: jest.fn(async () => undefined) };
  const emitter = { toUser: jest.fn(), toRoles: jest.fn(), toHub: jest.fn() };
  const WRONG = '0000';
  const LOCK_15 = /locked for 15 minutes/;

  const mkUser = (role: User['role'], hubId: string | null, extra: Partial<User> = {}) => {
    const n = ++seq;
    return ds.getRepository(User).save(ds.getRepository(User).create({ emailHash: `h${n}`, email: `u${n}@t.test`, passwordHash: 'x', name: `${role}${n}`, role, hubId, ...extra }));
  };
  const mkTask = async (extra: Partial<DeliveryTask> = {}) => {
    const n = ++seq;
    const order = await ds.getRepository(Order).save(
      ds.getRepository(Order).create({ reference: `SOM-${n}`, customerId: 'cust1', customerName: 'Marie', status: 'out_for_delivery', paymentMethod: 'stripe_card', totalUsd: 50, shippingAddress: '{}' }),
    );
    return ds.getRepository(DeliveryTask).save(
      ds.getRepository(DeliveryTask).create({
        orderId: order.id,
        orderReference: order.reference,
        kind: 'delivery',
        status: 'in_transit',
        riderId: rider.id,
        hubId: hub.id,
        proofCode: CODE,
        ...extra,
      } as DeliveryTask),
    );
  };
  /** The counters straight from the database (raw SQL: no entity cache, no service in between). */
  const counters = async (id = task.id) => {
    const rows: { codeFailures: number; codeLockedUntil: string | null }[] = await ds.query('SELECT codeFailures, codeLockedUntil FROM delivery_tasks WHERE id = ?', [id]);
    return rows[0];
  };
  const state = async (id = task.id) => (await ds.getRepository(DeliveryTask).findOneByOrFail({ id })).status;
  const tryCode = (code: string | undefined, id = task.id, riderId = rider.id) => delivery.updateStatus(id, 'delivered', riderId, undefined, code);
  const makeServices = () => {
    const settings = { all: async () => ({ ...setting }), get: async (k: string) => setting[k] ?? null };
    const lg = new LogisticsService(
      ds.getRepository(DeliveryTask),
      ds.getRepository(Order),
      {} as never,
      ds.getRepository(Hub),
      ds.getRepository(User),
      {} as never,
      {} as never,
      ds.getRepository(AuditLog) as never,
      {} as never,
      {} as never,
      notif as never,
      emitter as never,
      settings as never,
    );
    jest.spyOn(lg, 'afterRiderStatus').mockResolvedValue(undefined as never);
    jest.spyOn(lg, 'emitTask').mockResolvedValue(undefined);
    const ds2 = new DeliveryService(ds.getRepository(DeliveryTask), ds.getRepository(Order), emitter as never, settings as never, lg);
    return { lg, ds2 };
  };

  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true });
    await ds.initialize();
    setting = { requireDeliveryCode: 'true' };
    hub = await ds.getRepository(Hub).save(ds.getRepository(Hub).create({ name: 'Entrepôt Kinshasa', city: 'Kinshasa', country: 'CD', lat: -4.31, lng: 15.31, active: true }));
    rider = await mkUser('rider', hub.id);
    const s = makeServices();
    logistics = s.lg;
    delivery = s.ds2;
    task = await mkTask();
    jest.clearAllMocks();
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await ds.destroy();
  });

  it('five wrong codes lock the code step: the sixth try with the CORRECT code is refused with the lock message', async () => {
    for (let i = 0; i < 5; i++) await expect(tryCode(WRONG)).rejects.toThrow(i < 4 ? /Wrong delivery code/ : LOCK_15);
    await expect(tryCode(CODE)).rejects.toThrow(LOCK_15);
    await expect(tryCode(CODE)).rejects.toThrow(/Ask the customer to confirm the code in their app, or call the warehouse/);
    expect(await state()).toBe('in_transit');
  });

  it('a brute force cannot finish the delivery: every one of 10,000 guesses fails once the lock is on', async () => {
    let accepted = 0;
    for (let i = 0; i < 40; i++) {
      const guess = String(1000 + i).replace(CODE, '9999'); // never the real code
      try {
        await tryCode(guess);
        accepted++;
      } catch {
        /* refused */
      }
    }
    // the real code is among the next guesses: the rider is locked out before reaching it
    await expect(tryCode(CODE)).rejects.toThrow(LOCK_15);
    expect(accepted).toBe(0);
    expect(await state()).toBe('in_transit');
  });

  const MIN = 60_000;
  /** Move the clock the service reads (`Date.now()`) forward. */
  const clockAt = (ms: number) => jest.spyOn(Date, 'now').mockReturnValue(ms);
  const realNow = Date.now();

  it('the lock expires after 15 minutes: then the correct code works again', async () => {
    for (let i = 0; i < 5; i++) await expect(tryCode(WRONG)).rejects.toThrow();
    const locked = await counters();
    expect(locked.codeFailures).toBe(5);
    expect(locked.codeLockedUntil).toBeTruthy();
    clockAt(realNow + 14 * MIN);
    await expect(tryCode(CODE)).rejects.toThrow(/locked for (1|2) minutes?/); // what is left, not the full 15
    clockAt(realNow + 15 * MIN + 5_000);
    await tryCode(CODE);
    expect(await state()).toBe('delivered');
    expect(await counters()).toMatchObject({ codeFailures: 0, codeLockedUntil: null });
  });

  it('a correct code never counts as a failure and clears the counter', async () => {
    for (let i = 0; i < 4; i++) await expect(tryCode(WRONG)).rejects.toThrow();
    expect((await counters()).codeFailures).toBe(4);
    await tryCode(CODE);
    expect(await state()).toBe('delivered');
    expect(await counters()).toMatchObject({ codeFailures: 0, codeLockedUntil: null });
    expect(await ds.getRepository(AuditLog).count({ where: { action: 'delivery.code_failed' } })).toBe(4); // the correct one left no failure line
  });

  it('escalates: 15 minutes, then 1 hour, then only a supervisor unlocks it (waiting does not)', async () => {
    for (let i = 0; i < 5; i++) await expect(tryCode(WRONG)).rejects.toThrow();
    clockAt(realNow + 16 * MIN);
    for (let i = 0; i < 4; i++) await expect(tryCode(WRONG)).rejects.toThrow(/Wrong delivery code/);
    await expect(tryCode(WRONG)).rejects.toThrow(/locked for 60 minutes/);
    clockAt(realNow + 16 * MIN + 59 * MIN);
    await expect(tryCode(CODE)).rejects.toThrow(/locked for 1 minute\./);
    clockAt(realNow + 16 * MIN + 61 * MIN);
    for (let i = 0; i < 4; i++) await expect(tryCode(WRONG)).rejects.toThrow(/Wrong delivery code/);
    await expect(tryCode(WRONG)).rejects.toThrow(/until a warehouse supervisor unlocks it/);
    clockAt(realNow + 30 * 24 * 60 * MIN);
    await expect(tryCode(CODE)).rejects.toThrow(/until a warehouse supervisor unlocks it. Call the warehouse/);
    expect(await state()).toBe('in_transit');
    expect((await counters()).codeFailures).toBe(15);
  });

  it('the counter lives in the database: a new service instance (a restart, another API process) sees the same lock', async () => {
    for (let i = 0; i < 3; i++) await expect(tryCode(WRONG)).rejects.toThrow();
    const other = makeServices().ds2; // a "second API process": nothing shared in memory
    await expect(other.updateStatus(task.id, 'delivered', rider.id, undefined, WRONG)).rejects.toThrow();
    await expect(other.updateStatus(task.id, 'delivered', rider.id, undefined, WRONG)).rejects.toThrow(LOCK_15); // 3 + 2 = 5 across two instances
    const third = makeServices().ds2;
    await expect(third.updateStatus(task.id, 'delivered', rider.id, undefined, CODE)).rejects.toThrow(LOCK_15);
  });

  it('parallel guesses cannot beat the counter: 40 at once end with exactly 5 counted and the rest refused as locked', async () => {
    const results = await Promise.allSettled(Array.from({ length: 40 }, (_, i) => tryCode(String(2000 + i))));
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    const msgs = results.map((r) => (r as PromiseRejectedResult).reason.message as string);
    expect(msgs.filter((m) => /^Wrong delivery code/.test(m)).length).toBeLessThanOrEqual(4);
    expect((await counters()).codeFailures).toBe(5);
    await expect(tryCode(CODE)).rejects.toThrow(LOCK_15);
  });

  it('tells the rider how many tries are left once only two remain, and what to do when locked', async () => {
    await expect(tryCode(WRONG)).rejects.toThrow('Wrong delivery code. Ask the customer for the 4-digit code shown in their app.');
    await expect(tryCode(WRONG)).rejects.toThrow('Wrong delivery code. Ask the customer for the 4-digit code shown in their app.');
    await expect(tryCode(WRONG)).rejects.toThrow(/2 tries left before this step locks\./);
    await expect(tryCode(WRONG)).rejects.toThrow(/1 try left before this step locks\./);
    await expect(tryCode(WRONG)).rejects.toThrow('Too many wrong delivery codes. The code step is locked for 15 minutes. Ask the customer to confirm the code in their app, or call the warehouse.');
  });

  it('an empty code field is refused but is not a guess: it does not count (and a locked task still says it is locked)', async () => {
    for (let i = 0; i < 10; i++) await expect(tryCode(undefined)).rejects.toThrow(/Wrong delivery code/);
    await expect(tryCode('  ')).rejects.toThrow(/Wrong delivery code/);
    expect((await counters()).codeFailures).toBe(0);
    for (let i = 0; i < 5; i++) await expect(tryCode(WRONG)).rejects.toThrow();
    await expect(tryCode(undefined)).rejects.toThrow(LOCK_15);
  });

  it('the lock is per task: another delivery of the same rider is not locked, and nothing is asked when the code is not required', async () => {
    for (let i = 0; i < 5; i++) await expect(tryCode(WRONG)).rejects.toThrow();
    const other = await mkTask();
    await tryCode(CODE, other.id);
    expect(await state(other.id)).toBe('delivered');
    setting.requireDeliveryCode = 'false';
    await tryCode(undefined, task.id); // the platform does not ask for a code: nothing to lock (unchanged behaviour)
    expect(await state()).toBe('delivered');
  });

  it('a task that is not the rider\'s is still "not found" and never counts against the owner', async () => {
    const intruder = await mkUser('rider', hub.id);
    for (let i = 0; i < 8; i++) await expect(tryCode(WRONG, task.id, intruder.id)).rejects.toThrow('Delivery task not found.');
    expect((await counters()).codeFailures).toBe(0);
  });

  describe('audit and alerts', () => {
    it('every wrong code writes an audit line (task, rider, count) and never the guess; alerts start with the 3rd', async () => {
      const guesses = ['1357', '2468', '9753'];
      for (const g of guesses) await expect(tryCode(g)).rejects.toThrow();
      const lines = await ds.getRepository(AuditLog).find({ where: { action: 'delivery.code_failed' }, order: { createdAt: 'ASC' } });
      expect(lines).toHaveLength(3);
      for (const l of lines) {
        expect(l).toMatchObject({ entity: 'delivery', entityId: task.id, role: 'rider', actor: rider.name });
        expect(l.detail).toContain(task.orderReference);
        expect(l.detail).toContain(rider.id);
        for (const g of [...guesses, CODE]) expect(l.detail).not.toContain(g);
      }
      expect(lines.map((l) => l.detail)).toEqual(expect.arrayContaining([expect.stringContaining('try 1 '), expect.stringContaining('try 2 '), expect.stringContaining('try 3 ')]));
      // the 1st and 2nd wrong codes are quiet, the 3rd tells the warehouse side
      expect(notif.toAdmins).toHaveBeenCalledTimes(1);
      expect(notif.toAdmins).toHaveBeenCalledWith(expect.objectContaining({ title: 'Wrong delivery codes', type: 'task', entityId: task.id, body: expect.stringMatching(/^SOM-\d+: .+ entered a wrong delivery code 3 times\. Call the customer to check the code\.$/) }), 'logisticsDesk');
      expect(notif.toUsers).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(notif.toAdmins.mock.calls)).not.toMatch(/1357|2468|9753|4321/);
    });

    it('the first two wrong codes send no alert', async () => {
      await expect(tryCode(WRONG)).rejects.toThrow();
      await expect(tryCode(WRONG)).rejects.toThrow();
      expect(notif.toAdmins).not.toHaveBeenCalled();
      expect(notif.toUsers).not.toHaveBeenCalled();
    });

    it('the lock itself is audited and alerted with what the warehouse should do', async () => {
      for (let i = 0; i < 5; i++) await expect(tryCode(WRONG)).rejects.toThrow();
      const locked = await ds.getRepository(AuditLog).find({ where: { action: 'delivery.code_locked' } });
      expect(locked).toHaveLength(1);
      expect(locked[0].detail).toMatch(/locked after 5 wrong tries.*for 15 minutes/);
      expect(notif.toAdmins).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Delivery code locked', body: expect.stringContaining('locked for 15 minutes. Call the customer to check the code.') }), 'logisticsDesk');
      expect(emitter.toRoles).toHaveBeenCalledWith(expect.anything(), 'audit:created', expect.objectContaining({ action: 'delivery.code_locked' }));
    });

    it('a failing notification sender never turns a wrong code into a crash (the count and the lock are already saved)', async () => {
      notif.toAdmins.mockRejectedValueOnce(new Error('down'));
      for (let i = 0; i < 5; i++) await expect(tryCode(WRONG)).rejects.toThrow(i < 4 ? /Wrong delivery code/ : LOCK_15);
      expect((await counters()).codeFailures).toBe(5);
    });
  });

  describe('a supervisor or an admin unlocks it (delivery:resetCode)', () => {
    const lock = async () => {
      for (let i = 0; i < 5; i++) await expect(tryCode(WRONG)).rejects.toThrow();
    };
    const staff = (tier: string | null, hubId = hub.id, role = 'warehouse_staff'): Actor => ({ id: `s-${tier}`, role, name: `Staff ${tier}`, hubId, tier });

    it('a supervisor clears the counter and the lock, it is audited, the rider is told, and the correct code works at once', async () => {
      await lock();
      await expect(tryCode(CODE)).rejects.toThrow(LOCK_15);
      const saved = await delivery.resetCodeLock(task.id, staff('supervisor'));
      expect(saved).toMatchObject({ codeFailures: 0, codeLockedUntil: null });
      expect(await counters()).toMatchObject({ codeFailures: 0, codeLockedUntil: null });
      const line = await ds.getRepository(AuditLog).findOneByOrFail({ action: 'delivery.code_unlocked' });
      expect(line).toMatchObject({ actor: 'Staff supervisor', role: 'warehouse_staff', entity: 'delivery', entityId: task.id });
      expect(line.detail).toContain('was at 5 wrong tries');
      expect(notif.toUser).toHaveBeenCalledWith(rider.id, expect.objectContaining({ title: 'Delivery code unlocked', entityId: task.id }));
      await tryCode(CODE);
      expect(await state()).toBe('delivered');
    });

    it('a manager, an operations admin and the super admin can; the lock starts over (5 more tries)', async () => {
      for (const actor of [staff('manager'), staff(null, null as never, 'admin_operations'), staff(null, null as never, 'admin')]) {
        await lock();
        await delivery.resetCodeLock(task.id, actor);
        for (let i = 0; i < 4; i++) await expect(tryCode(WRONG)).rejects.toThrow(/Wrong delivery code/);
        await delivery.resetCodeLock(task.id, actor);
      }
    });

    it('an operator, another warehouse\'s supervisor, a rider and the other admin roles cannot', async () => {
      await lock();
      const elsewhere = await ds.getRepository(Hub).save(ds.getRepository(Hub).create({ name: 'Entrepôt Lubumbashi', city: 'Lubumbashi', country: 'CD', lat: -11.6, lng: 27.4, active: true }));
      await expect(delivery.resetCodeLock(task.id, staff('operator'))).rejects.toThrow('Only a warehouse supervisor or an operations administrator can unlock a delivery code.');
      await expect(delivery.resetCodeLock(task.id, staff(null))).rejects.toThrow(/Only a warehouse supervisor/);
      await expect(delivery.resetCodeLock(task.id, staff('manager', elsewhere.id))).rejects.toThrow('This task belongs to another warehouse.');
      for (const role of ['rider', 'customer', 'admin_marketing', 'admin_support', 'admin_finance', 'admin_moderation']) {
        await expect(delivery.resetCodeLock(task.id, staff('manager', null as never, role))).rejects.toThrow(/Only a warehouse supervisor/);
      }
      expect(await counters()).toMatchObject({ codeFailures: 5 });
      await expect(tryCode(CODE)).rejects.toThrow(LOCK_15);
      expect(await ds.getRepository(AuditLog).count({ where: { action: 'delivery.code_unlocked' } })).toBe(0);
    });

    it('refuses to "unlock" a task that is not locked and one that has no code', async () => {
      await expect(delivery.resetCodeLock(task.id, staff('supervisor'))).rejects.toThrow('This delivery code is not locked.');
      const pickup = await mkTask({ kind: 'pickup' });
      await expect(delivery.resetCodeLock(pickup.id, staff('supervisor'))).rejects.toThrow('This delivery code is not locked.');
      await expect(delivery.resetCodeLock('nope', staff('supervisor'))).rejects.toThrow('Delivery task not found.');
    });

    it('works from the supervisor-needed state (15 wrong tries) as well', async () => {
      await ds.getRepository(DeliveryTask).update({ id: task.id }, { codeFailures: 15 });
      await expect(tryCode(CODE)).rejects.toThrow(/until a warehouse supervisor unlocks it/);
      await delivery.resetCodeLock(task.id, staff('supervisor'));
      await tryCode(CODE);
      expect(await state()).toBe('delivered');
    });
  });

  describe('the sockets (every way in to the code goes through the same check)', () => {
    let gw: RealtimeGateway;
    const as = (u: User | { id: string; role: string; name: string }) => ({ data: { user: { id: u.id, role: u.role, name: u.name } } }) as never;
    beforeEach(() => {
      const users = { findById: (id: string) => ds.getRepository(User).findOneBy({ id }) };
      gw = Object.assign(Object.create(RealtimeGateway.prototype), { delivery, logistics, users });
    });

    it('delivery:updateStatus (the rider app and the web rider portal both send exactly this) locks after 5 wrong codes', async () => {
      for (let i = 0; i < 4; i++) expect(await gw.deliveryUpdateStatus(as(rider), { taskId: task.id, status: 'delivered', code: WRONG })).toMatchObject({ ok: false, error: expect.stringMatching(/^Wrong delivery code/) });
      expect(await gw.deliveryUpdateStatus(as(rider), { taskId: task.id, status: 'delivered', code: WRONG })).toMatchObject({ ok: false, error: expect.stringMatching(LOCK_15) });
      expect(await gw.deliveryUpdateStatus(as(rider), { taskId: task.id, status: 'delivered', code: CODE })).toMatchObject({ ok: false, error: expect.stringMatching(LOCK_15) });
      expect(await state()).toBe('in_transit');
    });

    it('delivery:resetCode is for supervisors and operations admins only, and unlocks what the rider socket locked', async () => {
      for (let i = 0; i < 5; i++) await gw.deliveryUpdateStatus(as(rider), { taskId: task.id, status: 'delivered', code: WRONG });
      const operator = await mkUser('warehouse_staff', hub.id, { warehouseTier: 'operator' });
      const supervisor = await mkUser('warehouse_staff', hub.id, { warehouseTier: 'supervisor' });
      const marketing = await mkUser('admin_marketing', null);
      const ops = await mkUser('admin_operations', null);
      expect(await gw.deliveryResetCode(as(rider), { taskId: task.id })).toEqual({ ok: false, error: 'Ops only.' });
      expect(await gw.deliveryResetCode(as({ id: 'g', role: 'customer', name: 'C' }), { taskId: task.id })).toEqual({ ok: false, error: 'Ops only.' });
      expect(await gw.deliveryResetCode(as(operator), { taskId: task.id })).toMatchObject({ ok: false, error: expect.stringMatching(/^Only a warehouse supervisor/) });
      expect(await gw.deliveryResetCode(as(marketing), { taskId: task.id })).toEqual({ ok: false, error: 'Ops only.' });
      expect((await counters()).codeFailures).toBe(5);
      const done = await gw.deliveryResetCode(as(supervisor), { taskId: task.id });
      expect(done).toMatchObject({ ok: true, data: { id: task.id, codeFailures: 0, codeLocked: false } });
      expect(await gw.deliveryUpdateStatus(as(rider), { taskId: task.id, status: 'delivered', code: CODE })).toMatchObject({ ok: true });
      // an operations admin can too (on another locked task)
      const t2 = await mkTask();
      for (let i = 0; i < 5; i++) await gw.deliveryUpdateStatus(as(rider), { taskId: t2.id, status: 'delivered', code: WRONG });
      expect(await gw.deliveryResetCode(as(ops), { taskId: t2.id })).toMatchObject({ ok: true });
      expect(await ds.getRepository(AuditLog).count({ where: { action: 'delivery.code_unlocked' } })).toBe(2);
    });

    it('the warehouse view of a task shows the count and the lock, so the desk can see who is stuck', async () => {
      for (let i = 0; i < 5; i++) await expect(tryCode(WRONG)).rejects.toThrow();
      const v = await logistics.view((await ds.getRepository(DeliveryTask).findOneByOrFail({ id: task.id })) as DeliveryTask);
      expect(v).toMatchObject({ codeFailures: 5, codeLocked: true });
      expect(JSON.stringify(v)).not.toContain(CODE);
    });
  });

  describe('the customer still sees their code', () => {
    it('codeForOrder returns it while the parcel is on its way, locked or not (the lock is about the rider typing, not about showing)', async () => {
      for (let i = 0; i < 5; i++) await expect(tryCode(WRONG)).rejects.toThrow();
      expect(await delivery.codeForOrder(task.orderId)).toBe(CODE);
    });
  });

  describe('the policy', () => {
    it('locks at 5, 10 and 15 wrong codes and at no other count', () => {
      const t = 1_000_000;
      expect([1, 2, 3, 4, 6, 7, 9, 11, 14].map((n) => lockAfter(n, t))).toEqual(Array(9).fill(null));
      expect(lockAfter(5, t)).toEqual({ until: new Date(t + 15 * MIN), supervisor: false, minutes: 15 });
      expect(lockAfter(10, t)).toEqual({ until: new Date(t + 60 * MIN), supervisor: false, minutes: 60 });
      expect(lockAfter(15, t)).toEqual({ until: null, supervisor: true, minutes: 0 });
      expect([0, 1, 4, 5, 9, 15, 20].map(triesLeft)).toEqual([5, 4, 1, 5, 1, 0, 0]);
    });

    it('compares in constant time: equal, different, empty and different-length inputs', () => {
      expect(sameCode('4321', '4321')).toBe(true);
      expect(sameCode(' 4321 ', '4321')).toBe(true);
      expect(sameCode('4322', '4321')).toBe(false);
      expect(sameCode('', '4321')).toBe(false);
      expect(sameCode(undefined, '4321')).toBe(false);
      expect(sameCode('43211', '4321')).toBe(false);
      expect(sameCode(4321, '4321')).toBe(true);
    });
  });

  /**
   * "Every path that accepts the code": the code is compared in exactly one place, DeliveryService.checkDeliveryCode. This
   * guard fails when someone reads the stored code anywhere else (a second comparison would have no counter).
   */
  it('the stored code is read by nothing that compares it: only the customer endpoint, the legs that create it and the demo flow', () => {
    const root = join(__dirname, '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) files.push(full);
      }
    };
    walk(root);
    const readers = files.filter((f) => /getProofCode\(|proofCodeOf\(|addSelect\('t\.proofCode'\)|sameCode\(/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(root.length + 1).replace(/\\/g, '/')).sort();
    expect(readers).toEqual(['database/demo/demo-flow.ts', 'delivery/delivery-code-lock.ts', 'delivery/delivery.service.ts', 'logistics/logistics.service.ts']);
    // and inside DeliveryService the comparison helper is used by the one guarded method only
    const svc = readFileSync(join(root, 'delivery/delivery.service.ts'), 'utf8');
    expect(svc.match(/sameCode\(/g)).toHaveLength(1);
    expect(svc.match(/this\.checkDeliveryCode\(/g)).toHaveLength(1);
    expect(svc.match(/getProofCode\(/g)!.length).toBe(3); // the guard, codeForOrder and the method itself
  });
});
