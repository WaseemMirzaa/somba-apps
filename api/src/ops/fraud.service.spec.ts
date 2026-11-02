import { DataSource } from 'typeorm';
import { AuditLog, FraudAlert, Order, User, WalletTransaction } from '../database/entities';
import { recordingEmitter, testDb } from '../testing/test-db';
import { AuditService } from './audit.service';
import { CustomersService } from './customers.service';
import { FraudActor, FraudService } from './fraud.service';

let ds: DataSource;
let emitter: ReturnType<typeof recordingEmitter>;
let notices: { to: string; n: { title: string; body: string; type?: string } }[];
let svc: FraudService;
let customer: User;
let alert: FraudAlert;

const as = (over: Partial<FraudActor> = {}): FraudActor => ({ id: 'admin-1', name: 'Support Sam', role: 'admin_support', canSuspend: true, confirmed: true, ...over });

const addUser = (over: Partial<User>) =>
  ds.getRepository(User).save(ds.getRepository(User).create({ emailHash: `h-${Math.random()}`, email: 'x@y.z', passwordHash: 'x', name: 'Awa Diallo', role: 'customer', ...over }));

const addAlert = async (customerId: string, ref: string, over: Partial<FraudAlert> = {}) => {
  const order = await ds.getRepository(Order).save(
    ds.getRepository(Order).create({ reference: ref, customerId, customerName: 'Awa Diallo', status: 'pending', paymentMethod: 'cod', totalUsd: 500 }),
  );
  return ds.getRepository(FraudAlert).save(ds.getRepository(FraudAlert).create({ type: 'cod_risk', severity: 'high', customer: 'Awa Diallo', orderId: order.id, score: 90, status: 'open', ...over }));
};

const actions = async () => (await ds.getRepository(AuditLog).find({ order: { createdAt: 'ASC' } })).map((a) => `${a.action}:${a.entity}:${a.entityId}`);
const reload = (id: string) => ds.getRepository(User).findOneOrFail({ where: { id } });

beforeEach(async () => {
  ds = await testDb();
  emitter = recordingEmitter();
  notices = [];
  const notifications = {
    toAdmins: async (n: never) => void notices.push({ to: 'admins', n }),
    toUser: async (id: string, n: never) => void notices.push({ to: id, n }),
  };
  const audit = new AuditService(ds.getRepository(AuditLog), emitter as never);
  const customers = new CustomersService(ds.getRepository(User), ds.getRepository(Order), ds.getRepository(WalletTransaction), emitter as never);
  svc = new FraudService(ds.getRepository(FraudAlert), ds.getRepository(Order), ds.getRepository(User), emitter as never, customers, audit, notifications as never);
  customer = await addUser({});
  alert = await addAlert(customer.id, 'SOM-1');
});
afterEach(async () => ds.destroy());

describe('fraud alerts: Block really blocks', () => {
  it('blocking suspends the account, revokes its tokens, names the socket to drop, audits and notices', async () => {
    const before = await reload(customer.id);
    const res = await svc.setStatus(alert.id, 'blocked', as());
    expect(res.alert.status).toBe('blocked');
    expect(res.kickUserId).toBe(customer.id);
    const after = await reload(customer.id);
    expect(after.active).toBe(false);
    expect(after.tokenVersion).toBe((before.tokenVersion ?? 0) + 1); // every issued token stops working
    expect(await actions()).toEqual([`fraud.blocked:fraud:${alert.id}`, `user.suspend:user:${customer.id}`]);
    const log = await ds.getRepository(AuditLog).findOneOrFail({ where: { action: 'user.suspend' } });
    expect(log).toMatchObject({ actor: 'Support Sam', role: 'admin_support', detail: `Fraud alert ${alert.id}` });
    expect(notices.map((x) => [x.to, x.n.title])).toEqual([['admins', 'Account blocked'], [customer.id, 'Account suspended']]);
    expect(emitter.sent.some((s) => s.event === 'customer:updated' && s.payload.active === false)).toBe(true);
  });

  it('needs the confirmation: without it nothing changes', async () => {
    await expect(svc.setStatus(alert.id, 'blocked', as({ confirmed: false }))).rejects.toThrow('Confirm that blocking suspends');
    expect((await reload(customer.id)).active).toBe(true);
    expect((await ds.getRepository(FraudAlert).findOneOrFail({ where: { id: alert.id } })).status).toBe('open');
    expect(await actions()).toEqual([]);
  });

  it('is refused for a role that may not suspend accounts (finance, operations, moderation): nothing changes, but they can still review', async () => {
    await expect(svc.setStatus(alert.id, 'blocked', as({ role: 'admin_finance', canSuspend: false }))).rejects.toThrow('only a super admin or support admin');
    expect((await reload(customer.id)).active).toBe(true);
    expect(await actions()).toEqual([]);
    const reviewed = await svc.setStatus(alert.id, 'reviewed', as({ role: 'admin_finance', canSuspend: false }));
    expect(reviewed.alert.status).toBe('reviewed');
    expect(reviewed.kickUserId).toBeUndefined();
    expect((await reload(customer.id)).active).toBe(true);
    expect(await actions()).toEqual([`fraud.reviewed:fraud:${alert.id}`]);
  });

  it('unblocking reactivates the account, audited and noticed; a role that may not suspend cannot lift it', async () => {
    await svc.setStatus(alert.id, 'blocked', as());
    notices.length = 0;
    await expect(svc.setStatus(alert.id, 'reviewed', as({ role: 'admin_finance', canSuspend: false }))).rejects.toThrow('Only a super admin or support admin can lift');
    await expect(svc.setStatus(alert.id, 'open', as({ confirmed: false }))).rejects.toThrow('Confirm that this reactivates');
    expect((await reload(customer.id)).active).toBe(false);
    const res = await svc.setStatus(alert.id, 'open', as());
    expect(res).toMatchObject({ alert: { status: 'open' } });
    expect(res.kickUserId).toBeUndefined();
    expect((await reload(customer.id)).active).toBe(true);
    expect((await actions()).slice(-2)).toEqual([`fraud.open:fraud:${alert.id}`, `user.reactivate:user:${customer.id}`]);
    expect(notices.map((x) => x.n.title)).toEqual(['Account unblocked', 'Account reinstated']);
  });

  it('another alert still blocking the same customer keeps the account suspended', async () => {
    const second = await addAlert(customer.id, 'SOM-2');
    await svc.setStatus(alert.id, 'blocked', as());
    await svc.setStatus(second.id, 'blocked', as());
    await svc.setStatus(alert.id, 'reviewed', as());
    expect((await reload(customer.id)).active).toBe(false);
    await svc.setStatus(second.id, 'reviewed', as());
    expect((await reload(customer.id)).active).toBe(true);
  });

  it('blocking an alert that has no order, a missing alert, a staff account or yourself changes nothing', async () => {
    const orphan = await ds.getRepository(FraudAlert).save(ds.getRepository(FraudAlert).create({ type: 'velocity', customer: 'Nobody', orderId: null, status: 'open' }));
    await expect(svc.setStatus(orphan.id, 'blocked', as())).rejects.toThrow('not linked to an account');
    await expect(svc.setStatus('nope', 'blocked', as())).rejects.toThrow('Alert not found.');
    const staff = await addUser({ role: 'rider', name: 'Rider' });
    const staffAlert = await addAlert(staff.id, 'SOM-3');
    await expect(svc.setStatus(staffAlert.id, 'blocked', as())).rejects.toThrow('Staff accounts are managed in Roles.');
    await expect(svc.setStatus(alert.id, 'blocked', as({ id: customer.id }))).rejects.toThrow('Account not found.');
    for (const a of [orphan, staffAlert, alert]) expect((await ds.getRepository(FraudAlert).findOneOrFail({ where: { id: a.id } })).status).toBe('open');
    expect((await reload(customer.id)).active).toBe(true);
    expect(await actions()).toEqual([]);
  });

  it('blocking an already blocked alert is a no-op (no second suspension, audit entry or notice)', async () => {
    await svc.setStatus(alert.id, 'blocked', as());
    const logs = (await actions()).length;
    notices.length = 0;
    await svc.setStatus(alert.id, 'blocked', as());
    expect((await actions()).length).toBe(logs);
    expect(notices).toEqual([]);
  });
});
