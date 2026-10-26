import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { UsersService } from '../users/users.service';
import { DEFAULT_NOTIFY, noticeCategory, parseNotify } from '../users/notify-prefs';
import { TeamDirectory } from './team-directory';
import { permissionForEvent, permissionForNotice, roleAllows } from './seller-permissions';
import { redactForStaff } from './staff-view';

/** Notices and live events addressed to a store owner also reach the staff whose role handles them. */
function makeNotifications(team: { recipientsForNotice: (owner: string, type?: string | null) => Promise<string[]> } | undefined, users: Record<string, { role: string; prefs: string | null; locale?: string }>) {
  const saved: { userId: string; title: string; type: string }[] = [];
  const pushes: { to: string; type: string }[] = [];
  const repo = {
    create: (x: object) => ({ ...x }),
    save: async (x: { userId: string; title: string; type: string }) => (saved.push(x), { id: `n${saved.length}`, ...x }),
    find: async () => [],
  };
  const emitter = { toUser: () => undefined, toRole: () => undefined, toRoles: () => undefined };
  const push = {
    enabled: false,
    sendToUser: jest.fn(async (id: string, p: { data: { type: string } }) => (pushes.push({ to: id, type: p.data.type }), 1)),
    sendToRole: jest.fn(),
    countForUser: jest.fn(),
  };
  const userRepo = {
    findOne: async ({ where }: { where: { id: string } }) => (users[where.id] ? { id: where.id, ...users[where.id] } : null),
    find: async () => [],
  };
  const svc = new NotificationsService(repo as never, emitter as never, push as never, userRepo as never, undefined, team as never);
  return { svc, saved, pushes };
}

const tick = () => new Promise((r) => setImmediate(r));

describe('notices reach the store staff whose role handles them', () => {
  const members = [
    { userId: 'm-fin', role: 'finance' as const },
    { userId: 'm-ord', role: 'orders' as const },
    { userId: 'm-mgr', role: 'manager' as const },
  ];
  const team = {
    recipientsForNotice: async (_owner: string, type?: string | null) => {
      return members.filter((m) => roleAllows(m.role, permissionForNotice(type))).map((m) => m.userId);
    },
  };
  const users = { owner: { role: 'seller', prefs: null }, 'm-fin': { role: 'seller', prefs: null }, 'm-ord': { role: 'seller', prefs: null }, 'm-mgr': { role: 'seller', prefs: null } };

  it('an order notice goes to the owner, the orders member and the manager, not finance', async () => {
    const { svc, saved } = makeNotifications(team, users);
    await svc.toUser('owner', { title: 'New order', body: 'SOM-1 · $1 from A', type: 'order' });
    expect(saved.map((n) => n.userId).sort()).toEqual(['m-mgr', 'm-ord', 'owner']);
  });

  it('a payout notice goes to finance and the manager, not orders staff', async () => {
    const { svc, saved } = makeNotifications(team, users);
    await svc.toUser('owner', { title: 'Payout paid', body: 'x', type: 'payout' });
    expect(saved.map((n) => n.userId).sort()).toEqual(['m-fin', 'm-mgr', 'owner']);
  });

  it('a team or security notice stays with the owner', async () => {
    const { svc, saved } = makeNotifications(team, users);
    await svc.toUser('owner', { title: 'Team member joined', body: 'x', type: 'team' });
    expect(saved.map((n) => n.userId)).toEqual(['owner']);
  });

  it('a notice to a staff member (not an owner) is not repeated to anyone', async () => {
    const { svc, saved } = makeNotifications({ recipientsForNotice: async () => [] }, users);
    await svc.toUser('m-ord', { title: 'Team role changed', body: 'x', type: 'team' });
    expect(saved).toHaveLength(1);
  });

  it('works without a team directory (tests, scripts)', async () => {
    const { svc, saved } = makeNotifications(undefined, users);
    await svc.toUser('owner', { title: 'New order', body: 'x', type: 'order' });
    expect(saved).toHaveLength(1);
  });

  it('a failing directory never loses the owner\'s own notice', async () => {
    const { svc, saved } = makeNotifications({ recipientsForNotice: async () => { throw new Error('db down'); } }, users);
    await expect(svc.toUser('owner', { title: 'New order', body: 'x', type: 'order' })).resolves.toBeDefined();
    expect(saved).toHaveLength(1);
  });
});

describe('notification switches (Settings > Notifications)', () => {
  it('a switched-off kind is still saved in the bell but not pushed', async () => {
    const prefs = JSON.stringify({ push: true, notify: { order: false } });
    const { svc, saved, pushes } = makeNotifications(undefined, { u: { role: 'seller', prefs } });
    await svc.toUser('u', { title: 'New order', body: 'x', type: 'order' });
    await svc.toUser('u', { title: 'Payout paid', body: 'x', type: 'payout' });
    await tick();
    expect(saved).toHaveLength(2);
    expect(pushes.map((p) => p.type)).toEqual(['payout']);
  });

  it('security and system notices cannot be switched off', async () => {
    const prefs = JSON.stringify({ notify: Object.fromEntries(Object.keys(DEFAULT_NOTIFY).map((k) => [k, false])) });
    const { svc, pushes } = makeNotifications(undefined, { u: { role: 'seller', prefs } });
    await svc.toUser('u', { title: 'Two-factor authentication enabled', body: 'x', type: 'security' });
    await svc.toUser('u', { title: 'Test notification', body: 'x', type: 'system' });
    await tick();
    expect(pushes).toHaveLength(2);
  });

  it('push off for the account wins over everything', async () => {
    const { svc, pushes } = makeNotifications(undefined, { u: { role: 'seller', prefs: JSON.stringify({ push: false }) } });
    await svc.toUser('u', { title: 'New order', body: 'x', type: 'order' });
    await tick();
    expect(pushes).toHaveLength(0);
  });

  it('maps notice types to switches', () => {
    expect(noticeCategory('order')).toBe('order');
    expect(noticeCategory('delivery')).toBe('order');
    expect(noticeCategory('payout')).toBe('payout');
    expect(noticeCategory('stock')).toBe('stock');
    expect(noticeCategory('review')).toBe('review');
    expect(noticeCategory('chat')).toBe('message');
    expect(noticeCategory('moderation')).toBe('product');
    expect(noticeCategory('campaign')).toBe('promo');
    expect(noticeCategory('security')).toBeNull();
    expect(noticeCategory(undefined)).toBeNull();
  });

  it('reads stored prefs with defaults, ignoring junk', () => {
    expect(parseNotify(undefined)).toEqual(DEFAULT_NOTIFY);
    expect(parseNotify({ order: false, payout: 'no', nonsense: false })).toEqual({ ...DEFAULT_NOTIFY, order: false });
    expect(UsersService.parsePrefs(null).notify).toEqual(DEFAULT_NOTIFY);
    expect(UsersService.parsePrefs('{"push":false}').notify).toEqual(DEFAULT_NOTIFY);
    expect(UsersService.parsePrefs('{"notify":{"stock":false}}').notify.stock).toBe(false);
    expect(UsersService.parsePrefs('not json').notify).toEqual(DEFAULT_NOTIFY);
  });
});

describe('live events reach the store staff', () => {
  it('the emitter repeats an event for the owner to the accounts the mirror names', async () => {
    const sent: { room: string; event: string }[] = [];
    const emitter = new RealtimeEmitter();
    emitter.register({ to: (room: string) => ({ emit: (event: string) => void sent.push({ room, event }) }) } as never);
    emitter.registerMirror(async (userId, event) => {
      const p = permissionForEvent(event);
      return userId === 'owner' && p === 'orders' ? ['m-ord', 'm-mgr'].map((to) => ({ to, payload: {} })) : [];
    });
    emitter.toUser('owner', 'order:created', {});
    emitter.toUser('owner', 'notification:new', {});
    emitter.toUser('someone', 'order:created', {});
    await tick();
    await tick();
    expect(sent.map((s) => `${s.room}|${s.event}`).sort()).toEqual([
      'user:m-mgr|order:created',
      'user:m-ord|order:created',
      'user:owner|order:created',
      'user:owner|notification:new',
      'user:someone|order:created',
    ].sort());
  });

  it('events still flow when no mirror is registered or it fails', async () => {
    const sent: string[] = [];
    const emitter = new RealtimeEmitter();
    emitter.register({ to: (room: string) => ({ emit: () => void sent.push(room) }) } as never);
    emitter.toUser('a', 'order:created', {});
    emitter.registerMirror(async () => { throw new Error('boom'); });
    emitter.toUser('b', 'order:created', {});
    await tick();
    expect(sent).toEqual(['user:a', 'user:b']);
  });
});

describe('the staff copy of a store object', () => {
  it('drops the owner\'s KYC papers, payout destination and account id, keeps the rest', () => {
    const store = {
      id: 's1',
      name: 'Shop',
      status: 'approved',
      userId: 'owner',
      legalName: 'Shop SARL',
      phone: '+243',
      idNumber: 'ID',
      rccm: 'R',
      taxNumber: 'T',
      documentUrls: ['x'],
      payoutMethod: 'bank',
      payoutAccountMasked: 'FR •••• 1',
      goals: '{}',
      vacationUntil: null,
      handlingDays: 2,
    };
    expect(redactForStaff(store)).toEqual({ id: 's1', name: 'Shop', status: 'approved', vacationUntil: null, handlingDays: 2 });
    expect(store.legalName).toBe('Shop SARL'); // the original is untouched
    expect(redactForStaff(null)).toBeNull();
    expect(redactForStaff('x')).toBe('x');
    expect(redactForStaff([1])).toEqual([1]);
  });
});

describe('TeamDirectory', () => {
  it('knows nobody for a user who owns no store', async () => {
    const dir = new TeamDirectory({ find: async () => [] } as never, { findOne: async () => null } as never);
    expect(await dir.membersOfOwner('nobody')).toEqual([]);
    expect(await dir.recipientsForNotice('nobody', 'order')).toEqual([]);
  });

  it('answers from a short-lived cache until a team change invalidates it', async () => {
    let finds = 0;
    let rows = [{ userId: 'm1', role: 'orders' }];
    const dir = new TeamDirectory({ find: async () => (finds++, rows) } as never, { findOne: async () => ({ id: 's1' }) } as never);
    expect(await dir.recipientsFor('owner', 'orders')).toEqual(['m1']);
    rows = [{ userId: 'm1', role: 'orders' }, { userId: 'm2', role: 'manager' }];
    expect(await dir.recipientsFor('owner', 'orders')).toEqual(['m1']);
    expect(finds).toBe(1);
    dir.invalidate();
    expect(await dir.recipientsFor('owner', 'orders')).toEqual(['m1', 'm2']);
    expect(await dir.recipientsFor('owner', 'finance')).toEqual(['m2']);
  });
});
