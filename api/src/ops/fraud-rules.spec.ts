import { DataSource } from 'typeorm';
import { Dispute, FraudAlert, FraudSignal, Order, Payment, PaymentRefund, User } from '../database/entities';
import { recordingEmitter, testDb } from '../testing/test-db';
import { FRAUD_THRESHOLDS } from './fraud-rules.config';
import { FraudRulesService } from './fraud-rules.service';
import { FraudService } from './fraud.service';
import { FraudSignalsService } from './fraud-signals.service';

let ds: DataSource;
let emitter: ReturnType<typeof recordingEmitter>;
let settingsMap: Record<string, string>;
let fraud: FraudService;
let rules: FraudRulesService;
let signals: FraudSignalsService;
let seq = 0;

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
const daysAgo = (d: number) => hoursAgo(d * 24);

const addUser = (over: Partial<User> = {}) =>
  ds.getRepository(User).save(ds.getRepository(User).create({ emailHash: `h-${++seq}`, email: `u${seq}@x.test`, passwordHash: 'x', name: `Customer ${seq}`, role: 'customer', createdAt: daysAgo(60), ...over }));
const addOrder = (u: User, over: Partial<Order> = {}) =>
  ds.getRepository(Order).save(ds.getRepository(Order).create({ reference: `SOM-${++seq}`, customerId: u.id, customerName: u.name, status: 'pending', paymentMethod: 'wallet', totalUsd: 20, ...over }));
const addPayment = (u: User, status: Payment['status'], over: Partial<Payment> = {}) =>
  ds.getRepository(Payment).save(ds.getRepository(Payment).create({ reference: `PAY-${++seq}`, userId: u.id, method: 'airtel_money', amountUsd: 10, status, ...over }));
const addDispute = (u: User, orderId: string, over: Partial<Dispute> = {}) =>
  ds.getRepository(Dispute).save(ds.getRepository(Dispute).create({ reference: `RET-${++seq}`, orderId, orderReference: 'SOM-x', customerId: u.id, customerName: u.name, type: 'return', reason: 'Not as described', ...over }));
const alertsOf = (u: User) => ds.getRepository(FraudAlert).find({ where: { customerId: u.id }, order: { createdAt: 'ASC' } });
const types = async (u: User) => (await alertsOf(u)).map((a) => a.type);

beforeEach(async () => {
  ds = await testDb();
  emitter = recordingEmitter();
  settingsMap = {};
  const settings = { get: async (k: string) => settingsMap[k] ?? null };
  const audit = { record: async () => undefined };
  const customers = {};
  const notifications = { toAdmins: async () => undefined, toUser: async () => undefined };
  fraud = new FraudService(ds.getRepository(FraudAlert), ds.getRepository(Order), ds.getRepository(User), emitter as never, customers as never, audit as never, notifications as never);
  signals = new FraudSignalsService(ds.getRepository(FraudSignal), ds.getRepository(Order));
  rules = new FraudRulesService(
    ds.getRepository(FraudAlert), ds.getRepository(Order), ds.getRepository(User), ds.getRepository(Payment), ds.getRepository(Dispute),
    ds.getRepository(PaymentRefund), ds.getRepository(FraudSignal), settings as never, fraud, emitter as never, signals,
  );
});
afterEach(async () => ds.destroy());

describe('a fraud check started by a signal', () => {
  it('logs a failed check and never leaves an unhandled rejection', async () => {
    let listener: ((userId: string) => unknown) | undefined;
    const source = { onSignal: (fn: (userId: string) => unknown) => void (listener = fn) };
    const settings = { get: async () => null };
    const r = new FraudRulesService(
      ds.getRepository(FraudAlert), ds.getRepository(Order), ds.getRepository(User), ds.getRepository(Payment), ds.getRepository(Dispute),
      ds.getRepository(PaymentRefund), ds.getRepository(FraudSignal), settings as never, fraud, emitter as never, source as never,
    );
    r.onModuleInit();
    jest.spyOn(r, 'evaluate').mockRejectedValue(new Error('db down'));
    const warn = jest.spyOn((r as unknown as { logger: { warn: (m: string) => void } }).logger, 'warn').mockImplementation(() => undefined);
    const out = listener!('u1');
    expect(out).toBeInstanceOf(Promise);
    await expect(out).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('db down'));
    r.onModuleDestroy();
  });
});

describe('fraud rule: many failed payment attempts in 24 hours', () => {
  it('raises one alert with the reason once the default limit (5) is reached, not before', async () => {
    const u = await addUser();
    for (let i = 0; i < 4; i++) await addPayment(u, 'failed');
    expect(await rules.evaluate(u.id)).toEqual([]);
    await addPayment(u, 'failed');
    const [alert] = await rules.evaluate(u.id);
    expect(alert).toMatchObject({ type: 'failed_payments', customerId: u.id, customer: u.name, status: 'open', severity: 'low' });
    expect(alert.reason).toBe('5 failed payment attempts in the last 24 hours (limit 5).');
    expect(alert.reasonFr).toContain('5 tentatives de paiement échouées');
    expect(emitter.sent.filter((s) => s.event === 'fraud:created')).toHaveLength(1);
  });

  it('ignores succeeded payments, other people, and attempts older than 24 hours', async () => {
    const u = await addUser();
    const other = await addUser();
    for (let i = 0; i < 6; i++) await addPayment(u, 'succeeded');
    for (let i = 0; i < 6; i++) await addPayment(other, 'failed');
    for (let i = 0; i < 6; i++) await addPayment(u, 'failed', { createdAt: hoursAgo(30) });
    expect(await rules.evaluate(u.id)).toEqual([]);
  });

  it('follows the threshold setting, and falls back to the default for a bad value', async () => {
    const u = await addUser();
    for (let i = 0; i < 3; i++) await addPayment(u, 'failed');
    settingsMap[FRAUD_THRESHOLDS.failedPayments.key] = '3';
    expect(await types(u)).toEqual([]);
    expect(await rules.evaluate(u.id)).toHaveLength(1);
    const v = await addUser();
    for (let i = 0; i < 3; i++) await addPayment(v, 'failed');
    settingsMap[FRAUD_THRESHOLDS.failedPayments.key] = 'abc';
    expect(await rules.evaluate(v.id)).toEqual([]); // default 5 applies
    expect((await rules.thresholds()).failedPayments).toBe(5);
  });

  it('severity grows with the ratio to the limit', async () => {
    const u = await addUser();
    for (let i = 0; i < 10; i++) await addPayment(u, 'failed');
    const [alert] = await rules.evaluate(u.id);
    expect(alert.severity).toBe('high');
    expect(alert.score).toBe(99); // 10/5 * 50 = 100, capped at 99
  });
});

describe('fraud rule: many orders from a brand-new account in 24 hours', () => {
  it('alerts at 3 orders on an account that is a day old', async () => {
    const u = await addUser({ createdAt: daysAgo(1) });
    await addOrder(u);
    await addOrder(u);
    expect(await rules.evaluate(u.id)).toEqual([]);
    const o3 = await addOrder(u);
    const [alert] = await rules.evaluate(u.id, { orderId: o3.id });
    expect(alert).toMatchObject({ type: 'new_account_orders', orderId: o3.id });
    expect(alert.reason).toBe('3 orders in the last 24 hours from an account created 1 day(s) ago (limit 3).');
  });

  it('does not apply to an account older than the "new" window (7 days by default)', async () => {
    const u = await addUser({ createdAt: daysAgo(20) });
    for (let i = 0; i < 6; i++) await addOrder(u);
    expect(await rules.evaluate(u.id)).toEqual([]);
    settingsMap[FRAUD_THRESHOLDS.newAccountDays.key] = '30';
    expect(await types(u)).toEqual([]);
    expect((await rules.evaluate(u.id)).map((a) => a.type)).toEqual(['new_account_orders']);
  });

  it('counts only the last 24 hours', async () => {
    const u = await addUser({ createdAt: daysAgo(2) });
    for (let i = 0; i < 4; i++) await addOrder(u, { createdAt: hoursAgo(30) });
    await addOrder(u);
    expect(await rules.evaluate(u.id)).toEqual([]);
  });
});

describe('fraud rule: the same phone or device on several accounts', () => {
  it('alerts when 3 customer accounts share one phone number', async () => {
    const a = await addUser({ phone: '+243812345678' });
    const b = await addUser({ phone: '+243812345678' });
    expect(await rules.evaluate(a.id)).toEqual([]);
    await addUser({ phone: '+243812345678' });
    const [alert] = await rules.evaluate(a.id);
    expect(alert).toMatchObject({ type: 'shared_identity', customerId: a.id });
    expect(alert.reason).toBe('3 accounts use the same phone number (limit 3).');
    expect(alert.reasonFr).toBe('3 comptes utilisent le même numéro de téléphone (limite 3).');
    expect(await rules.evaluate(b.id)).toHaveLength(1); // each account is judged on its own
  });

  it('alerts when one device has been used by 3 accounts, and stores only a hash of the token', async () => {
    const [a, b, c] = [await addUser(), await addUser(), await addUser()];
    await signals.noteDevice(a.id, 'fcm-token-shared');
    await signals.noteDevice(b.id, 'fcm-token-shared');
    expect(await alertsOf(c)).toEqual([]);
    await signals.noteDevice(c.id, 'fcm-token-shared');
    await signals.noteDevice(c.id, 'fcm-token-shared'); // the same device again for the same account: no new row
    const rows = await ds.getRepository(FraudSignal).find({ where: { kind: 'device' } });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => !r.key.includes('fcm-token'))).toBe(true);
    const [alert] = await rules.evaluate(c.id);
    expect(alert.type).toBe('shared_identity');
    expect(alert.reason).toBe('3 accounts used the same device (limit 3).');
  });

  it('different devices and different phones do not alert; staff accounts are not counted as customers', async () => {
    const a = await addUser({ phone: '+243800000001' });
    await addUser({ phone: '+243800000001', role: 'rider' });
    await addUser({ phone: '+243800000001', role: 'warehouse_staff' });
    await signals.noteDevice(a.id, 'one');
    const b = await addUser();
    await signals.noteDevice(b.id, 'two');
    expect(await rules.evaluate(a.id)).toEqual([]);
    expect(await rules.evaluate(b.id)).toEqual([]);
  });
});

describe('fraud rule: refund/return rate above a threshold over 30 days', () => {
  it('alerts when half of the last 30 days orders came back, once there are at least 3 orders', async () => {
    const u = await addUser();
    const orders = [await addOrder(u), await addOrder(u), await addOrder(u), await addOrder(u)];
    await addDispute(u, orders[0].id);
    expect(await rules.evaluate(u.id)).toEqual([]); // 1 of 4 = 25%
    await addDispute(u, orders[1].id, { type: 'dispute' });
    const [alert] = await rules.evaluate(u.id);
    expect(alert.type).toBe('return_rate');
    expect(alert.reason).toBe('2 of 4 orders in the last 30 days were returned, disputed or refunded (50%, limit 50%).');
  });

  it('does not judge fewer than the minimum number of orders', async () => {
    const u = await addUser();
    const o1 = await addOrder(u);
    const o2 = await addOrder(u);
    await addDispute(u, o1.id);
    await addDispute(u, o2.id);
    expect(await rules.evaluate(u.id)).toEqual([]); // 2 orders < 3, even at 100%
    settingsMap[FRAUD_THRESHOLDS.returnMinOrders.key] = '2';
    expect((await rules.evaluate(u.id)).map((a) => a.type)).toEqual(['return_rate']);
  });

  it('counts an order once however many returns, refunds and the returned status it has; cancelled orders do not count as placed', async () => {
    const u = await addUser();
    const [o1, o2, o3] = [await addOrder(u), await addOrder(u), await addOrder(u)];
    await addOrder(u, { status: 'cancelled' });
    await addDispute(u, o1.id);
    await addDispute(u, o1.id, { type: 'dispute' });
    await ds.getRepository(PaymentRefund).save(ds.getRepository(PaymentRefund).create({ paymentId: 'p', orderId: o1.id, userId: u.id, amountUsd: 5, refundTo: 'wallet', status: 'completed', kind: 'return' }));
    expect(await rules.evaluate(u.id)).toEqual([]); // 1 of 3
    await ds.getRepository(Order).update({ id: o2.id }, { status: 'returned' });
    await ds.getRepository(PaymentRefund).save(ds.getRepository(PaymentRefund).create({ paymentId: 'p', orderId: o3.id, userId: u.id, amountUsd: 5, refundTo: 'wallet', status: 'completed', kind: 'cancellation' }));
    const [alert] = await rules.evaluate(u.id);
    expect(alert.reason).toContain('2 of 3 orders'); // the cancellation refund is not a return
  });

  it('ignores returns older than 30 days', async () => {
    const u = await addUser();
    const orders = [await addOrder(u), await addOrder(u), await addOrder(u)];
    for (const o of orders) await addDispute(u, o.id, { createdAt: daysAgo(40) });
    expect(await rules.evaluate(u.id)).toEqual([]);
  });
});

describe('fraud rule: many address changes before delivery', () => {
  it('records a change only while an order is on its way', async () => {
    const u = await addUser();
    await signals.noteAddressChange(u.id, 'addr-1');
    expect(await ds.getRepository(FraudSignal).count()).toBe(0); // no order yet
    await addOrder(u, { status: 'delivered' });
    await signals.noteAddressChange(u.id, 'addr-1');
    expect(await ds.getRepository(FraudSignal).count()).toBe(0); // delivered orders are not "on their way"
    await addOrder(u, { status: 'shipped' });
    await signals.noteAddressChange(u.id, 'addr-1');
    expect(await ds.getRepository(FraudSignal).count()).toBe(1);
  });

  it('alerts at the third change in 24 hours', async () => {
    const u = await addUser();
    await addOrder(u, { status: 'out_for_delivery' });
    for (const id of ['a', 'b']) await signals.noteAddressChange(u.id, id);
    expect(await rules.evaluate(u.id)).toEqual([]);
    await signals.noteAddressChange(u.id, 'c');
    const [alert] = await rules.evaluate(u.id);
    expect(alert).toMatchObject({ type: 'address_changes' });
    expect(alert.reason).toBe('3 delivery address changes in the last 24 hours while an order was on its way (limit 3).');
  });

  it('does not count changes older than 24 hours', async () => {
    const u = await addUser();
    for (const key of ['a', 'b', 'c']) await ds.getRepository(FraudSignal).save(ds.getRepository(FraudSignal).create({ userId: u.id, kind: 'address_change', key, createdAt: hoursAgo(26) }));
    expect(await rules.evaluate(u.id)).toEqual([]);
  });

  it('the recorder runs the rules at once (listener), so the alert appears without waiting for the sweep', async () => {
    rules.onModuleInit();
    const u = await addUser();
    await addOrder(u, { status: 'processing' });
    for (const id of ['a', 'b', 'c']) await signals.noteAddressChange(u.id, id);
    await new Promise((r) => setTimeout(r, 50));
    expect(await types(u)).toEqual(['address_changes']);
    rules.onModuleDestroy();
  });
});

describe('fraud alerts: one per rule per customer per day', () => {
  it('does not raise the same alert twice on the same day, but does on the next day', async () => {
    const u = await addUser();
    for (let i = 0; i < 5; i++) await addPayment(u, 'failed');
    expect(await rules.evaluate(u.id)).toHaveLength(1);
    expect(await rules.evaluate(u.id)).toEqual([]);
    expect(await rules.evaluate(u.id)).toEqual([]);
    expect(await ds.getRepository(FraudAlert).count()).toBe(1);
    const tomorrow = new Date(Date.now() + 24 * 3_600_000);
    // the payments are now 24h+ old for "tomorrow", so make them fresh relative to it
    await ds.getRepository(Payment).update({ userId: u.id }, { createdAt: new Date(tomorrow.getTime() - 3_600_000) });
    expect(await rules.evaluate(u.id, { now: tomorrow })).toHaveLength(1);
    expect(await ds.getRepository(FraudAlert).count()).toBe(2);
  });

  it('two rules the same day make two alerts; a second customer is judged separately', async () => {
    const u = await addUser({ createdAt: hoursAgo(5) });
    const v = await addUser();
    for (let i = 0; i < 5; i++) await addPayment(u, 'failed');
    for (let i = 0; i < 3; i++) await addOrder(u);
    for (let i = 0; i < 5; i++) await addPayment(v, 'failed');
    expect((await rules.evaluate(u.id)).map((a) => a.type).sort()).toEqual(['failed_payments', 'new_account_orders']);
    expect((await rules.evaluate(v.id)).map((a) => a.type)).toEqual(['failed_payments']);
  });

  it('a race between two evaluations leaves one alert (the unique key)', async () => {
    const u = await addUser();
    for (let i = 0; i < 5; i++) await addPayment(u, 'failed');
    await Promise.all([rules.evaluate(u.id), rules.evaluate(u.id), rules.evaluate(u.id)]);
    expect(await ds.getRepository(FraudAlert).count()).toBe(1);
  });

  it('only customers are judged, and not suspended ones', async () => {
    const staff = await addUser({ role: 'rider' });
    const off = await addUser({ active: false });
    for (const x of [staff, off]) for (let i = 0; i < 6; i++) await addPayment(x, 'failed');
    expect(await rules.evaluate(staff.id)).toEqual([]);
    expect(await rules.evaluate(off.id)).toEqual([]);
    expect(await rules.evaluate('nobody')).toEqual([]);
  });

  it('a blocked rule alert suspends the account by customerId, even with no order, and lifting it reactivates', async () => {
    const u = await addUser();
    for (let i = 0; i < 5; i++) await addPayment(u, 'failed');
    const [alert] = await rules.evaluate(u.id);
    const customers = { setActive: jest.fn(async () => undefined) };
    const f = new FraudService(ds.getRepository(FraudAlert), ds.getRepository(Order), ds.getRepository(User), emitter as never, customers as never, { record: async () => undefined } as never, { toAdmins: async () => undefined, toUser: async () => undefined } as never);
    const actor = { id: 'a1', name: 'Sam', role: 'admin_support', canSuspend: true, confirmed: true };
    const res = await f.setStatus(alert.id, 'blocked', actor);
    expect(res.kickUserId).toBe(u.id);
    expect(customers.setActive).toHaveBeenCalledWith(u.id, false, 'a1');
    await f.setStatus(alert.id, 'open', actor);
    expect(customers.setActive).toHaveBeenLastCalledWith(u.id, true, 'a1');
  });
});

describe('fraud rules after an order, and the COD cap', () => {
  const placed = async (u: User, paymentMethod: Order['paymentMethod'], totalUsd: number) => {
    const o = await addOrder(u, { paymentMethod, totalUsd });
    await rules.afterOrder({ id: u.id, name: u.name }, o);
    return o;
  };

  it('raises no COD alert while codEnabled is not true (the COD-cap rule is gated on the flag)', async () => {
    const u = await addUser();
    await placed(u, 'cod', 900);
    settingsMap.codEnabled = 'false';
    await placed(u, 'cod', 900);
    expect(await alertsOf(u)).toEqual([]);
  });

  it('raises the COD alert above the cap when COD is on, with the reason and the customer id', async () => {
    settingsMap.codEnabled = 'true';
    settingsMap.codCapUsd = '500';
    const u = await addUser();
    await placed(u, 'cod', 450);
    expect(await alertsOf(u)).toEqual([]);
    await placed(u, 'cod', 600);
    const [alert] = await alertsOf(u);
    expect(alert).toMatchObject({ type: 'cod_risk', customerId: u.id, severity: 'medium' });
    expect(alert.reason).toBe('Cash-on-delivery order of $600.00 is above the $500.00 cap.');
  });

  it('a non-COD order never raises a COD alert even with COD on', async () => {
    settingsMap.codEnabled = 'true';
    const u = await addUser();
    await placed(u, 'wallet', 9000);
    expect(await alertsOf(u)).toEqual([]);
  });

  it('runs the other rules too: the 3rd order of a new account raises an alert tied to that order', async () => {
    const u = await addUser({ createdAt: hoursAgo(2) });
    await placed(u, 'wallet', 10);
    await placed(u, 'wallet', 10);
    const third = await placed(u, 'wallet', 10);
    const [alert] = await alertsOf(u);
    expect(alert).toMatchObject({ type: 'new_account_orders', orderId: third.id });
  });

  it('never throws into the order flow, even when a repository fails', async () => {
    const u = await addUser();
    const o = await addOrder(u);
    const broken = new FraudRulesService(ds.getRepository(FraudAlert), ds.getRepository(Order), { findOne: async () => { throw new Error('db down'); } } as never, ds.getRepository(Payment), ds.getRepository(Dispute), ds.getRepository(PaymentRefund), ds.getRepository(FraudSignal), { get: async () => null } as never, fraud, emitter as never);
    await expect(broken.afterOrder({ id: u.id, name: u.name }, o)).resolves.toBeUndefined();
  });

  it('FraudService.afterOrder is a no-op until the rules register, then delegates', async () => {
    const u = await addUser({ createdAt: hoursAgo(2) });
    const o = await addOrder(u);
    await expect(fraud.afterOrder({ id: u.id, name: u.name }, o)).resolves.toBeUndefined();
    rules.onModuleInit();
    await addOrder(u);
    const third = await addOrder(u);
    await fraud.afterOrder({ id: u.id, name: u.name }, third);
    expect(await types(u)).toEqual(['new_account_orders']);
    rules.onModuleDestroy();
  });
});

describe('fraud rules sweep', () => {
  it('finds failed payments, returns and signals with no order to trigger them, and checks each customer once', async () => {
    const payer = await addUser();
    for (let i = 0; i < 5; i++) await addPayment(payer, 'failed');
    const returner = await addUser();
    const os = [await addOrder(returner, { createdAt: hoursAgo(3) }), await addOrder(returner, { createdAt: hoursAgo(3) }), await addOrder(returner, { createdAt: hoursAgo(3) })];
    await addDispute(returner, os[0].id);
    await addDispute(returner, os[1].id);
    const quiet = await addUser();
    expect(await rules.sweep()).toBe(2); // payer and returner; the quiet customer did nothing
    expect(await types(payer)).toEqual(['failed_payments']);
    expect(await types(returner)).toEqual(['return_rate']);
    expect(await alertsOf(quiet)).toEqual([]);
    expect(await rules.sweep()).toBe(2);
    expect(await ds.getRepository(FraudAlert).count()).toBe(2); // deduplicated
  });
});

describe('fraud thresholds', () => {
  it('uses the documented defaults', async () => {
    expect(await rules.thresholds()).toEqual({ failedPayments: 5, newAccountOrders: 3, newAccountDays: 7, sharedAccounts: 3, returnRatePct: 50, returnMinOrders: 3, addressChanges: 3 });
  });

  it('reads valid settings and ignores out-of-range or non-integer ones', async () => {
    settingsMap.fraudFailedPayments24h = '8';
    settingsMap.fraudReturnRatePct = '101';
    settingsMap.fraudSharedAccounts = '2.5';
    settingsMap.fraudAddressChanges24h = '';
    const t = await rules.thresholds();
    expect(t).toMatchObject({ failedPayments: 8, returnRatePct: 50, sharedAccounts: 3, addressChanges: 3 });
  });
});
