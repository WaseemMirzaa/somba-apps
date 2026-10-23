import { NotificationsService } from './notifications.service';

const tick = () => new Promise((r) => setImmediate(r));

function make(users: Record<string, { role: string; prefs: string | null }> = {}) {
  const emits: [string, string, string][] = [];
  const payloads: { link?: string }[] = [];
  const rows: object[] = [];
  const repo = {
    create: (x: object) => ({ ...x }),
    save: async (x: object) => ({ id: 'n1', ...x }),
    find: async () => rows,
  };
  const emitter = {
    toUser: (id: string, ev: string, p: { link?: string }) => (emits.push(['user', id, ev]), payloads.push(p)),
    toRole: (role: string, ev: string, p: { link?: string }) => (emits.push(['role', role, ev]), payloads.push(p)),
  };
  const push = {
    enabled: false,
    sendToUser: jest.fn(async () => 1),
    sendToRole: jest.fn(async () => 1),
    countForUser: jest.fn(async () => 2),
  };
  const userRepo = {
    findOne: async ({ where }: { where: { id: string } }) => (users[where.id] ? { id: where.id, ...users[where.id] } : null),
    find: async ({ where }: { where: { role: string } }) =>
      Object.entries(users)
        .filter(([, u]) => u.role === where.role && (u.prefs ?? '').includes('"push":false'))
        .map(([id]) => ({ id })),
  };
  const svc = new NotificationsService(repo as never, emitter as never, push as never, userRepo as never);
  return { svc, emits, push, payloads, rows };
}

describe('NotificationsService', () => {
  it('gives the live copy and the list the page each notice opens', async () => {
    const { svc, payloads, rows } = make({ u1: { role: 'seller', prefs: null } });
    await svc.toUser('u1', { title: 'T', body: 'B', type: 'exchange', entityId: 'x1' });
    await svc.toRole('admin_support', { title: 'T', body: 'B', type: 'support', entityId: 't1' });
    expect(payloads.map((p) => p.link)).toEqual(['/seller/exchanges/x1', '/admin/support/t1']);
    rows.push({ id: 'a', type: 'order', entityId: 'o1' }, { id: 'b', type: 'marketing', entityId: null });
    expect((await svc.listForUser('u1', 'seller')).map((n) => n.link)).toEqual(['/seller/orders/o1', '/seller/notifications']);
  });

  it('saves, emits live and pushes with a deep link and extra data', async () => {
    const { svc, emits, push } = make({ u1: { role: 'seller', prefs: null } });
    await svc.toUser('u1', { title: 'T', body: 'B', type: 'return', entityId: 'd1', extra: { view: 'x' } });
    await tick();
    expect(emits).toContainEqual(['user', 'u1', 'notification:new']);
    expect(push.sendToUser).toHaveBeenCalledWith('u1', {
      title: 'T',
      body: 'B',
      link: '/seller/returns/d1',
      data: { type: 'return', entityId: 'd1', notificationId: 'n1', view: 'x' },
    });
  });

  it('respects a user who turned push off (still in-app)', async () => {
    const { svc, emits, push } = make({ u1: { role: 'customer', prefs: JSON.stringify({ push: false }) } });
    await svc.toUser('u1', { title: 'T', body: 'B', type: 'order', entityId: 'o1' });
    await tick();
    expect(emits).toContainEqual(['user', 'u1', 'notification:new']);
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('sends staff alerts to web devices only, and rider tasks to phones too', async () => {
    const { svc, push } = make({ r9: { role: 'rider', prefs: JSON.stringify({ push: false }) } });
    await svc.toRole('admin_support', { title: 'T', body: 'B', type: 'support', entityId: 't1' });
    await svc.toRole('rider', { title: 'New', body: 'B', type: 'task', entityId: 'k1', extra: { view: 'available' } });
    await tick();
    const [staff, rider] = push.sendToRole.mock.calls as unknown as [string, { link: string }, { apps?: string[]; skipUserIds: Set<string> }][];
    expect(staff[0]).toBe('admin_support');
    expect(staff[1].link).toBe('/admin/support/t1');
    expect(staff[2].apps).toEqual(['web']);
    expect(rider[0]).toBe('rider');
    expect(rider[2].apps).toBeUndefined();
    expect([...rider[2].skipUserIds]).toEqual(['r9']);
  });

  it('test() reports whether push is set up and how many devices it can reach', async () => {
    const { svc } = make({ u1: { role: 'customer', prefs: null } });
    expect(await svc.test({ id: 'u1' })).toEqual({ pushEnabled: false, devices: 2 });
  });
});
