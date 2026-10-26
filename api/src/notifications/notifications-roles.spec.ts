import { DataSource } from 'typeorm';
import { Notification, NotificationRead, User } from '../database/entities';
import { recordingEmitter, testDb } from '../testing/test-db';
import { ADMIN_ROLES, ALL_ADMINS, NotificationsService } from './notifications.service';

let ds: DataSource;
let emitter: ReturnType<typeof recordingEmitter>;
let pushes: { role?: string; user?: string; scope?: { skipUserIds?: Set<string> } }[];
let svc: NotificationsService;

const tick = () => new Promise((r) => setImmediate(r));

async function user(id: string, role: User['role'], prefs: object | null = null) {
  await ds.getRepository(User).save(ds.getRepository(User).create({ id, emailHash: id, email: `${id}@x.y`, passwordHash: 'x', name: id, role, prefs: prefs ? JSON.stringify(prefs) : null }));
}

beforeEach(async () => {
  ds = await testDb();
  emitter = recordingEmitter();
  (emitter as unknown as { toRoles: unknown }).toRoles = (roles: string[], event: string, payload: unknown) => void emitter.sent.push({ to: roles.join(','), event, payload });
  pushes = [];
  const push = {
    enabled: false,
    sendToUser: async (u: string) => void pushes.push({ user: u }),
    sendToRole: async (role: string, _p: unknown, scope: { skipUserIds?: Set<string> }) => void pushes.push({ role, scope }),
    countForUser: async () => 0,
  };
  svc = new NotificationsService(ds.getRepository(Notification), emitter as never, push as never, ds.getRepository(User), undefined, undefined, ds.getRepository(NotificationRead));
  await user('sa', 'admin');
  await user('ag1', 'admin_support');
  await user('ag2', 'admin_support');
  await user('fin', 'admin_finance');
  await user('c1', 'customer');
});
afterEach(async () => ds.destroy());

const note = { title: 'New reply on a ticket', body: 'TKT-1', type: 'support', entityId: 't1' };

describe('the super admin hears what every admin role hears', () => {
  it('a role notice also reaches the super admin live and by push', async () => {
    await svc.toRole('admin_support', note);
    await tick();
    expect(emitter.sent.filter((e) => e.event === 'notification:new').map((e) => e.to)).toEqual(['admin_support', 'admin']);
    expect(pushes.map((p) => p.role)).toEqual(['admin_support', 'admin']);
  });

  it('but the super admin’s own role notice is not sent twice, and other roles do not leak', async () => {
    await svc.toRole('admin', note);
    await svc.toRole('customer', { ...note, type: 'order' });
    expect(emitter.sent.filter((e) => e.event === 'notification:new').map((e) => e.to)).toEqual(['admin', 'customer']);
  });

  it('the list: the super admin sees every admin role’s rows, an admin role its own and the shared ones, others only theirs', async () => {
    await svc.toRole('admin_support', { ...note, entityId: 'support-row' });
    await svc.toRole('admin_finance', { ...note, entityId: 'finance-row', type: 'payout' });
    await svc.toAdmins({ ...note, entityId: 'all-row' });
    await svc.toRole('customer', { ...note, entityId: 'cust-row', type: 'order' });
    await svc.toUser('ag1', { ...note, entityId: 'mine' });
    const ids = async (id: string, role: string) => (await svc.listForUser(id, role)).map((n) => n.entityId).sort();
    expect(await ids('sa', 'admin')).toEqual(['all-row', 'finance-row', 'support-row']);
    expect(await ids('ag1', 'admin_support')).toEqual(['all-row', 'mine', 'support-row']);
    expect(await ids('fin', 'admin_finance')).toEqual(['all-row', 'finance-row']);
    expect(await ids('c1', 'customer')).toEqual(['cust-row']);
  });

  it('toAdmins is ONE saved row for every admin role, emitted to all of them', async () => {
    await svc.toAdmins({ ...note, title: 'Seller cancelled items', type: 'order' });
    await tick();
    const rows = await ds.getRepository(Notification).find();
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe(ALL_ADMINS);
    const live = emitter.sent.find((e) => e.event === 'notification:new')!;
    expect(live.to).toBe(ADMIN_ROLES.join(','));
    expect(pushes.map((p) => p.role)).toEqual(ADMIN_ROLES);
  });
});

describe('read state kept on the server, per person', () => {
  it('a role notice read by one agent stays unread for the others and for the super admin', async () => {
    const n = await svc.toRole('admin_support', note);
    const unread = async (id: string, role: string) => (await svc.listForUser(id, role)).find((x) => x.id === n.id)?.read;
    expect([await unread('ag1', 'admin_support'), await unread('ag2', 'admin_support'), await unread('sa', 'admin')]).toEqual([false, false, false]);
    await svc.markRead(n.id, 'ag1', 'admin_support');
    await svc.markRead(n.id, 'ag1', 'admin_support'); // twice is fine
    expect([await unread('ag1', 'admin_support'), await unread('ag2', 'admin_support'), await unread('sa', 'admin')]).toEqual([true, false, false]);
    expect(await ds.getRepository(NotificationRead).count()).toBe(1);
  });

  it('nobody can mark a notice they cannot see', async () => {
    const n = await svc.toRole('admin_finance', note);
    await svc.markRead(n.id, 'ag1', 'admin_support');
    await svc.markRead(n.id, 'c1', 'customer');
    expect(await ds.getRepository(NotificationRead).count()).toBe(0);
    await svc.markRead(n.id, 'sa', 'admin');
    expect(await ds.getRepository(NotificationRead).count()).toBe(1);
  });

  it('a user’s own notice keeps its own flag, and only the owner can change it', async () => {
    const n = await svc.toUser('c1', { ...note, type: 'order' });
    await svc.markRead(n.id, 'ag1', 'admin_support');
    expect((await svc.listForUser('c1', 'customer'))[0].read).toBe(false);
    await svc.markRead(n.id, 'c1', 'customer');
    expect((await svc.listForUser('c1', 'customer'))[0].read).toBe(true);
  });

  it('mark all read covers own and role-wide notices, for that person only, and counts them', async () => {
    await svc.toUser('ag1', note);
    await svc.toRole('admin_support', note);
    await svc.toAdmins(note);
    await svc.toRole('admin_finance', note);
    expect(await svc.markAllRead('ag1', 'admin_support')).toBe(3);
    expect(await svc.markAllRead('ag1', 'admin_support')).toBe(0);
    expect((await svc.listForUser('ag1', 'admin_support')).every((n) => n.read)).toBe(true);
    expect((await svc.listForUser('ag2', 'admin_support')).filter((n) => n.read)).toHaveLength(0);
    expect(await svc.markAllRead('sa', 'admin')).toBe(3); // support row, admins row, finance row
    expect((await svc.listForUser('sa', 'admin')).every((n) => n.read)).toBe(true);
    // without a role it still marks the person's own (the old call)
    await svc.toUser('c1', { ...note, type: 'order' });
    expect(await svc.markAllRead('c1')).toBe(1);
  });
});

describe('staff pushes honour the switches in Settings', () => {
  it('a staff member who switched a kind off is skipped for that kind only', async () => {
    await user('ag3', 'admin_support', { notify: { message: false } });
    await user('ag4', 'admin_support', { push: false });
    await user('ag5', 'admin_support', { notify: { order: false } });
    await svc.toRole('admin_support', note); // support -> "message"
    await tick();
    const skipped = pushes.find((p) => p.role === 'admin_support')!.scope!.skipUserIds!;
    expect([...skipped].sort()).toEqual(['ag3', 'ag4']);
  });
});
