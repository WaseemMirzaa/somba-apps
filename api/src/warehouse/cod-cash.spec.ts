import { DataSource } from 'typeorm';
import { serializeSqliteTransactions } from '../database/sqlite-transactions';
import { AuditLog, CodHandover, DeliveryTask, ENTITIES, Hub, Order, Payment, User, WarehouseException } from '../database/entities';
import { DeliveryService } from '../delivery/delivery.service';
import { Actor } from '../logistics/logistics.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { recordingEmitter } from '../testing/test-db';
import { CashService } from './cash.service';
import { WarehouseService } from './warehouse.service';

/**
 * Cash on delivery (C-cod): the rider confirms the cash at the door and the server records amount, time and person;
 * a supervisor records the hand-over at the warehouse; the rider's balance goes down, never below zero.
 * Real services over an in-memory SQLite schema; only the logistics follow-ups and the settings store are stubbed.
 */
describe('cash on delivery: the cash record and the hand-over', () => {
  let ds: DataSource;
  let emitter: ReturnType<typeof recordingEmitter>;
  let delivery: DeliveryService;
  let cash: CashService;
  let payments: PaymentsService;
  let setting: Record<string, string>;
  let gombe: Hub;
  let limete: Hub;
  let rider: User;
  let other: User;
  let seq = 0;

  const markCollected = jest.fn();
  const completesOrder = jest.fn(async (_task?: DeliveryTask) => true);
  const mkHub = (name: string) => ds.getRepository(Hub).save(ds.getRepository(Hub).create({ name, city: 'Kinshasa', lat: -4.3, lng: 15.3 }));
  const mkUser = (role: User['role'], hubId: string | null, name: string) => {
    const n = ++seq;
    return ds.getRepository(User).save(ds.getRepository(User).create({ emailHash: `h${n}`, email: `u${n}@t.test`, passwordHash: 'x', name, role, hubId }));
  };
  /** An order with a cash-on-delivery payment and its delivery task on the road (what the rider holds when they arrive). */
  const mkCodTask = async (amount: number, o: Partial<DeliveryTask> = {}) => {
    const n = ++seq;
    const order = await ds.getRepository(Order).save(ds.getRepository(Order).create({ reference: `SOM-${n}`, customerId: 'c1', customerName: 'Marie', status: 'out_for_delivery', paymentMethod: amount > 0 ? 'cod' : 'wallet', totalUsd: amount }));
    if (amount > 0) {
      await ds.getRepository(Payment).save(ds.getRepository(Payment).create({ reference: `PAY-${n}`, orderId: order.id, orderReference: order.reference, userId: 'c1', method: 'cod', amountUsd: amount, status: 'pending' }));
    }
    return ds.getRepository(DeliveryTask).save(
      ds.getRepository(DeliveryTask).create({ orderId: order.id, orderReference: order.reference, riderId: rider.id, hubId: gombe.id, status: 'in_transit', kind: 'delivery', codAmountUsd: amount, ...o }),
    );
  };
  const reload = (id: string) => ds.getRepository(DeliveryTask).findOneByOrFail({ id });
  const supervisor = (hub: Hub): Actor => ({ id: `sup-${hub.id}`, role: 'warehouse_staff', name: 'Sup', hubId: hub.id, tier: 'supervisor' });
  const manager = (hub: Hub): Actor => ({ id: `mgr-${hub.id}`, role: 'warehouse_staff', name: 'Mgr', hubId: hub.id, tier: 'manager' });
  const operator = (hub: Hub): Actor => ({ id: `op-${hub.id}`, role: 'warehouse_staff', name: 'Op', hubId: hub.id, tier: 'operator' });
  const admin: Actor = { id: 'a1', role: 'admin', name: 'Admin', hubId: null, tier: null };
  const deliver = (t: DeliveryTask, cash?: unknown, who = rider) => delivery.updateStatus(t.id, 'delivered', who.id, undefined, undefined, cash);
  const audits = (action: string) => ds.getRepository(AuditLog).find({ where: { action } });

  beforeEach(async () => {
    ds = serializeSqliteTransactions(new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true }));
    await ds.initialize();
    setting = {};
    emitter = recordingEmitter();
    markCollected.mockReset();
    completesOrder.mockReset();
    completesOrder.mockImplementation(async () => true);
    gombe = await mkHub('Gombe');
    limete = await mkHub('Limete');
    rider = await mkUser('rider', gombe.id, 'Rider One');
    other = await mkUser('rider', limete.id, 'Rider Two');
    const settings = { get: async (k: string) => setting[k] ?? null };
    const logistics = { proofCodeOf: async () => null, afterRiderStatus: async () => undefined, emitTask: async () => undefined, completesOrder };
    payments = new PaymentsService(
      ds.getRepository(Payment), ds.getRepository(Order), {} as never, {} as never, emitter as never, settings as never,
      null as never, ds.getRepository(DeliveryTask), {} as never,
    );
    markCollected.mockImplementation((orderId: string, receipt?: Parameters<PaymentsService['markCollected']>[1]) => payments.markCollected(orderId, receipt));
    delivery = new DeliveryService(ds.getRepository(DeliveryTask), ds.getRepository(Order), emitter as never, { markCollected } as never, settings as never, logistics as never);
    cash = new CashService(ds.getRepository(DeliveryTask), ds.getRepository(CodHandover), ds.getRepository(User), emitter as never);
  });
  afterEach(async () => ds.destroy());

  describe('recording the cash at the door', () => {
    it('stores the amount, the time and the rider on the task, marks the payment collected and audits both', async () => {
      const t = await mkCodTask(40);
      const before = Date.now();
      await deliver(t, 40);
      const saved = await reload(t.id);
      expect(saved).toMatchObject({ status: 'delivered', codCollectedUsd: 40, codCollectedById: rider.id, codHandedOverUsd: 0 });
      expect(saved.codCollectedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect((await ds.getRepository(Payment).findOneByOrFail({ orderId: t.orderId })).status).toBe('succeeded');
      expect(markCollected).toHaveBeenCalledWith(t.orderId, expect.objectContaining({ amountUsd: 40, byId: rider.id, byName: 'Rider One', byRole: 'rider', taskId: t.id, source: 'rider' }));
      const [onPayment] = await audits('payment.cod_collected');
      expect(onPayment).toMatchObject({ actor: 'Rider One', role: 'rider', entity: 'payment' });
      expect(onPayment.detail).toContain('40.00 USD cash collected by Rider One');
      expect((await audits('cod.collected'))[0]).toMatchObject({ entity: 'delivery', entityId: t.id });
    });

    it('a partial delivery records its cash on the task and audits it, but leaves the payment pending; the leg that finishes the order collects it, with the total', async () => {
      const first = await mkCodTask(14);
      const [{ id: orderId }] = await ds.getRepository(Order).find({ where: { id: first.orderId } });
      await ds.getRepository(Payment).update({ orderId }, { amountUsd: 23 });
      const second = await ds.getRepository(DeliveryTask).save(
        ds.getRepository(DeliveryTask).create({ orderId, orderReference: first.orderReference, riderId: rider.id, hubId: gombe.id, status: 'in_transit', kind: 'delivery', codAmountUsd: 9 }),
      );
      completesOrder.mockImplementation(async (t?: DeliveryTask) => t?.id === second.id);
      await deliver(first, 14);
      expect(await reload(first.id)).toMatchObject({ status: 'delivered', codCollectedUsd: 14, codCollectedById: rider.id });
      expect(markCollected).not.toHaveBeenCalled();
      expect((await ds.getRepository(Payment).findOneByOrFail({ orderId })).status).toBe('pending');
      expect(await audits('cod.collected')).toHaveLength(1);
      // the rider's cash balance already counts the partial leg
      await deliver(second, 9);
      expect(markCollected).toHaveBeenCalledTimes(1);
      expect(markCollected).toHaveBeenCalledWith(orderId, expect.objectContaining({ amountUsd: 23, taskId: second.id }));
      expect((await ds.getRepository(Payment).findOneByOrFail({ orderId })).status).toBe('succeeded');
      expect(await audits('cod.collected')).toHaveLength(2);
      // a repeat of the partial leg's "delivered" settles nothing
      markCollected.mockClear();
      await deliver(first, 14);
      expect(markCollected).not.toHaveBeenCalled();
    });

    it('accepts the amount as the app sends it (a string), to the cent', async () => {
      const t = await mkCodTask(25.5);
      await deliver(t, '25.50');
      expect((await reload(t.id)).codCollectedUsd).toBe(25.5);
    });

    it('refuses a different amount, with both figures in the message, and records nothing', async () => {
      const t = await mkCodTask(40);
      await expect(deliver(t, 35)).rejects.toThrow('The cash you entered ($35.00) is not the amount to collect ($40.00). Collect exactly $40.00');
      await expect(deliver(t, 45)).rejects.toThrow('not the amount to collect ($40.00)');
      await expect(deliver(t, 0)).rejects.toThrow('not the amount to collect ($40.00)');
      await expect(deliver(t, 'abc')).rejects.toThrow('Enter the cash you collected');
      const saved = await reload(t.id);
      expect(saved).toMatchObject({ status: 'in_transit', codCollectedUsd: null, codCollectedAt: null, codCollectedById: null });
      expect(markCollected).not.toHaveBeenCalled();
      expect((await ds.getRepository(Payment).findOneByOrFail({ orderId: t.orderId })).status).toBe('pending');
    });

    it('refuses a delivery that does not say how much cash was taken', async () => {
      const t = await mkCodTask(40);
      await expect(deliver(t)).rejects.toThrow('Confirm the cash you collected: $40.00 is due on this delivery.');
      expect((await reload(t.id)).status).toBe('in_transit');
    });

    it('asks for the amount due NOW: a refund that lowered the cash to collect changes what the rider must enter', async () => {
      const t = await mkCodTask(40);
      await ds.getRepository(DeliveryTask).update({ id: t.id }, { codAmountUsd: 30 });
      await expect(deliver(t, 40)).rejects.toThrow('not the amount to collect ($30.00)');
      await deliver(t, 30);
      expect((await reload(t.id)).codCollectedUsd).toBe(30);
    });

    it('a prepaid delivery needs no cash, records none, and refuses an invented amount', async () => {
      const t = await mkCodTask(0);
      await expect(deliver(t, 20)).rejects.toThrow('No cash is due on this delivery');
      await deliver(t);
      expect(await reload(t.id)).toMatchObject({ status: 'delivered', codCollectedUsd: null, codCollectedAt: null, codCollectedById: null });
      expect(await audits('cod.collected')).toHaveLength(0);
    });

    it('confirming twice is idempotent: one record, one payment audit, the same answer', async () => {
      const t = await mkCodTask(40);
      await deliver(t, 40);
      const first = await reload(t.id);
      const again = await deliver(t, 40);
      expect(again.status).toBe('delivered');
      const second = await reload(t.id);
      expect(second.codCollectedAt!.getTime()).toBe(first.codCollectedAt!.getTime());
      expect(second.codCollectedUsd).toBe(40);
      expect(await audits('payment.cod_collected')).toHaveLength(1);
      expect(await audits('cod.collected')).toHaveLength(1);
      // a retry that disagrees with what was recorded is not waved through
      await expect(deliver(t, 35)).rejects.toThrow('already complete with $40.00 collected');
    });

    it('a retry finishes the payment when the first request died before marking it collected', async () => {
      const t = await mkCodTask(40);
      await deliver(t, 40);
      await ds.getRepository(Payment).update({ orderId: t.orderId }, { status: 'pending' }); // the crash
      await deliver(t, 40);
      expect((await ds.getRepository(Payment).findOneByOrFail({ orderId: t.orderId })).status).toBe('succeeded');
      expect(await audits('payment.cod_collected')).toHaveLength(2);
    });

    it('two taps at the same moment record the cash once', async () => {
      const t = await mkCodTask(40);
      const results = await Promise.allSettled([deliver(t, 40), deliver(t, 40), deliver(t, 40)]);
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      expect(await audits('payment.cod_collected')).toHaveLength(1);
      const held = await cash.balance(rider.id);
      expect(held).toMatchObject({ collectedUsd: 40, heldUsd: 40, openTasks: 1 });
    });

    it("another rider cannot confirm someone else's cash", async () => {
      const t = await mkCodTask(40);
      await expect(deliver(t, 40, other)).rejects.toThrow('Delivery task not found.');
      expect((await reload(t.id)).codCollectedUsd).toBeNull();
    });
  });

  describe("PaymentsService.markCollected", () => {
    it('writes the audit line only for the call that flips the payment', async () => {
      const t = await mkCodTask(12);
      const receipt = { amountUsd: 12, byId: 'u', byName: 'Zed', byRole: 'rider', at: new Date('2026-01-02T03:04:05Z'), taskId: t.id, source: 'rider' as const };
      await payments.markCollected(t.orderId, receipt);
      await payments.markCollected(t.orderId, receipt);
      const lines = await audits('payment.cod_collected');
      expect(lines).toHaveLength(1);
      expect(lines[0].detail).toContain('12.00 USD cash collected by Zed (rider) on 2026-01-02T03:04:05.000Z');
      expect(emitter.sent.filter((e) => e.event === 'audit:created')).toHaveLength(1);
    });

    it('says when an admin closed the delivery by hand', async () => {
      const t = await mkCodTask(12);
      await payments.markCollected(t.orderId, { amountUsd: 12, byId: 'a1', byName: 'Admin', byRole: 'admin', at: new Date(), taskId: t.id, source: 'admin_close' });
      expect((await audits('payment.cod_collected'))[0].detail).toContain('delivery closed by hand');
    });

    it('still works without a receipt (old callers) and ignores prepaid payments', async () => {
      const t = await mkCodTask(12);
      await payments.markCollected(t.orderId);
      expect((await ds.getRepository(Payment).findOneByOrFail({ orderId: t.orderId })).status).toBe('succeeded');
      expect(await audits('payment.cod_collected')).toHaveLength(0);
    });
  });

  describe('cash in hand and the hand-over at the warehouse', () => {
    it("shows the rider what they hold: collected, handed in, still held, and the receipts", async () => {
      await deliver(await mkCodTask(40), 40);
      await deliver(await mkCodTask(10), 10);
      expect(await cash.forRider(rider.id)).toMatchObject({ collectedUsd: 50, handedOverUsd: 0, heldUsd: 50, openTasks: 2, handovers: [] });
      await cash.handOver(supervisor(gombe), { riderId: rider.id, amountUsd: 20 });
      const mine = await cash.forRider(rider.id);
      expect(mine).toMatchObject({ collectedUsd: 50, handedOverUsd: 20, heldUsd: 30 });
      expect(mine.handovers).toHaveLength(1);
      expect(mine.handovers[0]).toMatchObject({ amountUsd: 20, heldBeforeUsd: 50, heldAfterUsd: 30, receivedByName: 'Sup' });
    });

    it('records who received how much and when, reduces the balance, and allows partial hand-overs until it is zero', async () => {
      await deliver(await mkCodTask(40), 40);
      await deliver(await mkCodTask(10), 10);
      const a = await cash.handOver(supervisor(gombe), { riderId: rider.id, amountUsd: 25, note: 'first part' });
      expect(a.handover).toMatchObject({ riderId: rider.id, amountUsd: 25, receivedById: `sup-${gombe.id}`, receivedByName: 'Sup', hubId: gombe.id, note: 'first part', heldBeforeUsd: 50, heldAfterUsd: 25 });
      expect(a.handover.createdAt).toBeInstanceOf(Date);
      expect(a.balance.heldUsd).toBe(25);
      const b = await cash.handOver(manager(gombe), { riderId: rider.id, amountUsd: 25 });
      expect(b.balance).toMatchObject({ heldUsd: 0, openTasks: 0, handedOverUsd: 50 });
      await expect(cash.handOver(manager(gombe), { riderId: rider.id, amountUsd: 1 })).rejects.toThrow('Rider One holds no cash to hand in.');
      expect(await ds.getRepository(CodHandover).count()).toBe(2);
    });

    it('never records more than the rider holds, in one go or after earlier hand-overs, and records nothing when refused', async () => {
      await deliver(await mkCodTask(40), 40);
      await expect(cash.handOver(supervisor(gombe), { riderId: rider.id, amountUsd: 40.01 })).rejects.toThrow('Rider One holds $40.00: you cannot record $40.01.');
      await cash.handOver(supervisor(gombe), { riderId: rider.id, amountUsd: 30 });
      await expect(cash.handOver(supervisor(gombe), { riderId: rider.id, amountUsd: 10.5 })).rejects.toThrow('holds $10.00');
      expect((await cash.balance(rider.id)).heldUsd).toBe(10);
      expect(await ds.getRepository(CodHandover).count()).toBe(1);
      expect(await audits('cod.handover')).toHaveLength(1);
      const sum = (await ds.getRepository(DeliveryTask).find()).reduce((s, t) => s + t.codHandedOverUsd, 0);
      expect(sum).toBe(30);
    });

    it('spreads a receipt over the oldest deliveries first and never past what one delivery collected', async () => {
      const t1 = await mkCodTask(40);
      await deliver(t1, 40);
      await new Promise((r) => setTimeout(r, 15));
      const t2 = await mkCodTask(10);
      await deliver(t2, 10);
      await cash.handOver(supervisor(gombe), { riderId: rider.id, amountUsd: 45 });
      expect(await reload(t1.id)).toMatchObject({ codHandedOverUsd: 40 });
      expect(await reload(t2.id)).toMatchObject({ codHandedOverUsd: 5 });
      for (const t of await ds.getRepository(DeliveryTask).find()) expect(t.codHandedOverUsd).toBeLessThanOrEqual(t.codCollectedUsd ?? 0);
    });

    it('two receipts racing for the same cash cannot both succeed', async () => {
      await deliver(await mkCodTask(40), 40);
      const results = await Promise.allSettled([
        cash.handOver(supervisor(gombe), { riderId: rider.id, amountUsd: 40 }),
        cash.handOver(manager(gombe), { riderId: rider.id, amountUsd: 40 }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect((await cash.balance(rider.id)).heldUsd).toBe(0);
      expect(await ds.getRepository(CodHandover).count()).toBe(1);
    });

    it('enforces the tier: an operator is refused; a supervisor, a manager and an admin may', async () => {
      await deliver(await mkCodTask(40), 40);
      await expect(cash.handOver(operator(gombe), { riderId: rider.id, amountUsd: 5 })).rejects.toThrow("Only supervisors and managers can record a rider's cash hand-over.");
      await expect(cash.handOver({ id: 'x', role: 'warehouse_staff', name: 'Untiered', hubId: gombe.id, tier: null }, { riderId: rider.id, amountUsd: 5 })).rejects.toThrow('Only supervisors and managers');
      await expect(cash.handOver({ id: rider.id, role: 'rider', name: 'Rider One', hubId: gombe.id, tier: null }, { riderId: rider.id, amountUsd: 5 })).rejects.toThrow('Staff only.');
      await expect(cash.handOver({ id: 'c', role: 'customer', name: 'C' }, { riderId: rider.id, amountUsd: 5 })).rejects.toThrow('Staff only.');
      expect((await cash.balance(rider.id)).heldUsd).toBe(40);
      await cash.handOver(supervisor(gombe), { riderId: rider.id, amountUsd: 5 });
      await cash.handOver(manager(gombe), { riderId: rider.id, amountUsd: 5 });
      await cash.handOver(admin, { riderId: rider.id, amountUsd: 5 });
      expect((await cash.balance(rider.id)).heldUsd).toBe(25);
    });

    it("staff of another warehouse cannot take a rider's cash; a non-rider is not a rider", async () => {
      await deliver(await mkCodTask(40), 40);
      await expect(cash.handOver(supervisor(limete), { riderId: rider.id, amountUsd: 5 })).rejects.toThrow('This rider belongs to another warehouse.');
      await expect(cash.handOver(supervisor(gombe), { riderId: other.id, amountUsd: 5 })).rejects.toThrow('This rider belongs to another warehouse.');
      await expect(cash.handOver(supervisor(gombe), { riderId: 'nobody', amountUsd: 5 })).rejects.toThrow('Rider not found.');
      const staffUser = await mkUser('warehouse_staff', gombe.id, 'Staffer');
      await expect(cash.handOver(supervisor(gombe), { riderId: staffUser.id, amountUsd: 5 })).rejects.toThrow('Rider not found.');
      expect((await cash.balance(rider.id)).heldUsd).toBe(40);
    });

    it('refuses amounts that are zero, negative, not numbers or not whole cents', async () => {
      await deliver(await mkCodTask(40), 40);
      for (const bad of [0, -5, 'abc', '', null, undefined, 1.005, 2000000]) {
        await expect(cash.handOver(supervisor(gombe), { riderId: rider.id, amountUsd: bad })).rejects.toThrow(/Enter the amount/);
      }
      expect(await ds.getRepository(CodHandover).count()).toBe(0);
    });

    it('a receipt sent twice with the same reference is recorded once', async () => {
      await deliver(await mkCodTask(40), 40);
      const a = await cash.handOver(supervisor(gombe), { riderId: rider.id, amountUsd: 15, clientRef: 'ref-1' });
      const b = await cash.handOver(supervisor(gombe), { riderId: rider.id, amountUsd: 15, clientRef: 'ref-1' });
      expect(b.handover.id).toBe(a.handover.id);
      expect((await cash.balance(rider.id)).heldUsd).toBe(25);
      await expect(cash.handOver(supervisor(gombe), { riderId: rider.id, amountUsd: 20, clientRef: 'ref-1' })).rejects.toThrow('already used for a different hand-over');
    });

    it('audits every hand-over with who, how much and what is left, and tells the rider and the desks live', async () => {
      await deliver(await mkCodTask(40), 40);
      await cash.handOver(supervisor(gombe), { riderId: rider.id, amountUsd: 15, note: 'counted twice' });
      const [line] = await audits('cod.handover');
      expect(line).toMatchObject({ actor: 'Sup', role: 'warehouse_staff', entity: 'rider', entityId: rider.id });
      expect(line.detail).toBe('Rider One: $15.00 received by Sup; still holds $25.00 (counted twice)');
      const live = emitter.sent.filter((e) => e.event === 'cash:updated').map((e) => e.to);
      expect(live).toEqual(expect.arrayContaining([`user:${rider.id}`, `hub:${gombe.id}`]));
    });

    it('lets supervisors and managers read the receipts of their own warehouse only; admins read all', async () => {
      await deliver(await mkCodTask(40), 40);
      await cash.handOver(supervisor(gombe), { riderId: rider.id, amountUsd: 10 });
      expect(await cash.history(supervisor(gombe))).toHaveLength(1);
      expect(await cash.history(manager(gombe))).toHaveLength(1);
      expect(await cash.history(supervisor(limete))).toHaveLength(0);
      expect(await cash.history(admin)).toHaveLength(1);
      expect(await cash.history(admin, { hubId: limete.id })).toHaveLength(0);
      await expect(cash.history({ id: 'c', role: 'customer', name: 'C' })).rejects.toThrow('Staff only.');
    });

    it('an operator cannot read the hand-over receipts (supervisor and above)', async () => {
      await deliver(await mkCodTask(40), 40);
      await cash.handOver(supervisor(gombe), { riderId: rider.id, amountUsd: 10 });
      await expect(cash.history(operator(gombe))).rejects.toThrow('Only supervisors and managers can see cash hand-overs.');
      await expect(cash.history({ ...operator(gombe), tier: null })).rejects.toThrow('Only supervisors and managers');
    });

    it('only the Super Admin, Finance and Operations admins touch rider cash; support, marketing and moderation are refused', async () => {
      await deliver(await mkCodTask(40), 40);
      const as = (role: string): Actor => ({ id: `x-${role}`, role, name: role, hubId: null, tier: null });
      for (const role of ['admin_support', 'admin_marketing', 'admin_moderation']) {
        await expect(cash.history(as(role))).rejects.toThrow('Not allowed.');
        await expect(cash.handOver(as(role), { riderId: rider.id, amountUsd: 5 })).rejects.toThrow('Not allowed.');
      }
      expect((await cash.balance(rider.id)).handedOverUsd).toBe(0);
      expect(await ds.getRepository(CodHandover).count()).toBe(0);
      for (const role of ['admin', 'admin_finance', 'admin_operations']) {
        await expect(cash.history(as(role))).resolves.toEqual(expect.any(Array));
      }
      await cash.handOver(as('admin_finance'), { riderId: rider.id, amountUsd: 5 });
      await cash.handOver(as('admin_operations'), { riderId: rider.id, amountUsd: 5 });
      expect((await cash.balance(rider.id)).handedOverUsd).toBe(10);
    });

    it('an operator cannot record a hand-over, and a supervisor of another warehouse cannot take this warehouse’s rider cash', async () => {
      await deliver(await mkCodTask(40), 40);
      await expect(cash.handOver(operator(gombe), { riderId: rider.id, amountUsd: 5 })).rejects.toThrow('Only supervisors and managers');
      await expect(cash.handOver(supervisor(limete), { riderId: rider.id, amountUsd: 5 })).rejects.toThrow('belongs to another warehouse');
      expect((await cash.balance(rider.id)).handedOverUsd).toBe(0);
    });

    it('the live cash update goes to the cash admins, the warehouse and the rider, not to every admin role', async () => {
      await deliver(await mkCodTask(40), 40);
      await cash.handOver(supervisor(gombe), { riderId: rider.id, amountUsd: 10 });
      const live = emitter.sent.filter((e) => e.event === 'cash:updated').map((e) => e.to);
      const roleTargets = live.filter((t) => t.includes('admin')).join(',').split(',');
      expect(roleTargets.sort()).toEqual(['admin', 'admin_finance', 'admin_operations']);
    });

    it('the warehouse count sheet shows due, collected, handed in and held per rider', async () => {
      const warehouse = new WarehouseService(
        ds.getRepository(Hub), {} as never, ds.getRepository(DeliveryTask), {} as never, ds.getRepository(Order),
        ds.getRepository(WarehouseException), emitter as never, {} as never, {} as never, {} as never, {} as never,
      );
      await deliver(await mkCodTask(40), 40);
      await deliver(await mkCodTask(10), 10);
      // a delivery from before the cash record: due, but no recorded collection
      await mkCodTask(7, { status: 'delivered', deliveredAt: new Date() });
      await cash.handOver(supervisor(gombe), { riderId: rider.id, amountUsd: 20 });
      const rows = await warehouse.reconcile(gombe.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ riderId: rider.id, parcels: 3, codUsd: 57, collectedUsd: 50, handedOverUsd: 20, heldUsd: 30 });
      expect(rows[0].lastHandoverAt).toBeInstanceOf(Date);
      expect(await warehouse.reconcile(limete.id)).toEqual([]);
      expect((await warehouse.reconcile(null))[0].heldUsd).toBe(30);
    });
  });

  describe('closing a COD delivery by hand', () => {
    it('is not cash a rider holds: it is recorded as taken and settled by the admin who closed it', async () => {
      const t = await mkCodTask(40);
      const orders = ds.getRepository(Order);
      // the same lines OrdersService.updateStatus runs for status "delivered", with the cash record it now writes
      const svc = Object.create(OrdersService.prototype) as InstanceType<typeof OrdersService>;
      Object.assign(svc, {
        orders,
        deliveries: ds.getRepository(DeliveryTask),
        settings: { get: async () => null },
        payments,
        emitter,
        notifications: { toUser: async () => undefined },
        logisticsSvc: { emitTask: async () => undefined },
      });
      await ds.getRepository(Order).update({ id: t.orderId }, { status: 'out_for_delivery' });
      await svc.updateStatus(t.orderId, 'delivered', { id: 'a1', name: 'Admin One', role: 'admin' }).catch((e) => {
        // anything after the delivery step (notifications, pushes) is outside this test
        if (!/undefined|not a function/.test(String(e))) throw e;
      });
      const saved = await reload(t.id);
      expect(saved).toMatchObject({ status: 'delivered', codCollectedUsd: 40, codCollectedById: 'a1', codHandedOverUsd: 40 });
      expect((await cash.balance(rider.id)).heldUsd).toBe(0);
      const [line] = await audits('payment.cod_collected');
      expect(line).toMatchObject({ actor: 'Admin One', role: 'admin' });
      expect(line.detail).toContain('delivery closed by hand');
    });
  });
});
