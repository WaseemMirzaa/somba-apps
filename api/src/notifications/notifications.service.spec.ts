import { NotificationsService } from './notifications.service';

const tick = () => new Promise((r) => setImmediate(r));

type Payload = { link?: string; title?: string; titleFr?: string | null; bodyFr?: string | null };

function make(users: Record<string, { role: string; prefs: string | null; locale?: string }> = {}) {
  const emits: [string, string, string][] = [];
  const payloads: Payload[] = [];
  const rows: object[] = [];
  const saved: object[] = [];
  const repo = {
    create: (x: object) => ({ ...x }),
    save: async (x: object) => (saved.push(x), { id: 'n1', ...x }),
    find: async () => rows,
  };
  const emitter = {
    toUser: (id: string, ev: string, p: Payload) => (emits.push(['user', id, ev]), payloads.push(p)),
    toRole: (role: string, ev: string, p: Payload) => (emits.push(['role', role, ev]), payloads.push(p)),
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
  // The translations table, as far as notifications use it: authored French rows keyed by notification id.
  const authored: Record<string, { field: string; locale: string; value: string }[]> = {};
  const translations = {
    saveAuthor: jest.fn(async (_type: string, id: string, rs: { field: string; locale: string; value: string }[]) => {
      authored[id] = [...(authored[id] ?? []), ...rs];
    }),
    rowsFor: jest.fn(async (_type: string, ids: string[]) => new Map(ids.filter((id) => authored[id]).map((id) => [id, authored[id]]))),
  };
  const svc = new NotificationsService(repo as never, emitter as never, push as never, userRepo as never, translations as never);
  return { svc, emits, push, payloads, rows, saved, authored, translations };
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

  describe('French', () => {
    const placed = { title: 'Order placed', body: "We received SOM-1. You'll get updates here in real time." };
    const placedFr = { title: 'Commande enregistrée', body: 'Nous avons reçu SOM-1. Vous recevrez les mises à jour ici en temps réel.' };

    it('adds titleFr / bodyFr to the live event, from the built-in translation', async () => {
      const { svc, payloads, saved } = make({ u1: { role: 'customer', prefs: null } });
      await svc.toUser('u1', { ...placed, type: 'order', entityId: 'o1' });
      expect(payloads[0]).toMatchObject({ title: placed.title, titleFr: placedFr.title, bodyFr: placedFr.body });
      // The stored row is the English one; nothing is stored for built-in translations.
      expect(saved[0]).toMatchObject({ title: placed.title });
      expect(saved[0]).not.toHaveProperty('titleFr');
    });

    it('sends null where the server text has no French', async () => {
      const { svc, payloads } = make({ u1: { role: 'customer', prefs: null } });
      await svc.toUser('u1', { title: 'Big sale', body: 'Everything 20% off', type: 'marketing' });
      expect(payloads[0]).toMatchObject({ titleFr: null, bodyFr: null });
    });

    it('lets an authored French version win over the patterns, and stores it for the list', async () => {
      const { svc, payloads, saved, rows, authored, translations } = make({ u1: { role: 'customer', prefs: null } });
      const fr = { title: 'Titre maison', body: 'Texte maison' };
      await svc.toUser('u1', { ...placed, type: 'order', fr });
      expect(payloads[0]).toMatchObject({ titleFr: 'Titre maison', bodyFr: 'Texte maison' });
      // Stored as translations rows (entityType notification, locale fr), never as columns on the notification.
      expect(saved[0]).not.toHaveProperty('titleFr');
      expect(translations.saveAuthor).toHaveBeenCalledWith('notification', 'n1', [
        { field: 'title', locale: 'fr', value: 'Titre maison' },
        { field: 'body', locale: 'fr', value: 'Texte maison' },
      ]);
      expect(authored.n1).toHaveLength(2);
      // The list serves the stored French (one batched lookup for the page), not a pattern match.
      rows.push({ id: 'n1', ...placed, type: 'order', entityId: 'o1' }, { id: 'z', ...placed, type: 'order', entityId: 'o2' });
      const list = await svc.listForUser('u1', 'customer');
      expect(list[0]).toMatchObject({ titleFr: 'Titre maison', bodyFr: 'Texte maison' });
      expect(list[1]).toMatchObject({ titleFr: placedFr.title });
      expect(translations.rowsFor).toHaveBeenCalledTimes(1);
    });

    it('adds the French text to every row of the list', async () => {
      const { svc, rows } = make({ u1: { role: 'customer', prefs: null } });
      rows.push(
        { id: 'a', ...placed, type: 'order', entityId: 'o1' },
        { id: 'b', title: 'Big sale', body: 'Hi', type: 'marketing', entityId: null },
      );
      const list = await svc.listForUser('u1', 'customer');
      expect(list.map((n) => n.titleFr)).toEqual([placedFr.title, null]);
      expect(list[0].bodyFr).toBe(placedFr.body);
    });

    it('pushes to a French user in French, and to everyone else in English', async () => {
      const { svc, push } = make({
        fr: { role: 'customer', prefs: null, locale: 'fr' },
        en: { role: 'customer', prefs: null, locale: 'en' },
        old: { role: 'customer', prefs: null },
      });
      for (const id of ['fr', 'en', 'old']) await svc.toUser(id, { ...placed, type: 'order', entityId: 'o1' });
      await tick();
      const sent = Object.fromEntries((push.sendToUser.mock.calls as unknown as [string, { title: string; body: string }][]).map(([id, p]) => [id, p]));
      expect(sent.fr).toMatchObject(placedFr);
      expect(sent.en).toMatchObject(placed);
      expect(sent.old).toMatchObject(placed);
    });

    it('pushes the authored French to a French user, and English text it cannot translate as is', async () => {
      const { svc, push } = make({ u1: { role: 'customer', prefs: null, locale: 'fr' } });
      await svc.toUser('u1', { title: 'Sale', body: 'All 20% off', type: 'marketing', fr: { title: 'Soldes', body: 'Tout à -20 %' } });
      await svc.toUser('u1', { title: 'Sale', body: 'All 20% off', type: 'marketing' });
      await tick();
      const calls = push.sendToUser.mock.calls as unknown as [string, { title: string; body: string }][];
      expect(calls[0][1]).toMatchObject({ title: 'Soldes', body: 'Tout à -20 %' });
      expect(calls[1][1]).toMatchObject({ title: 'Sale', body: 'All 20% off' });
    });

    it('hands a role broadcast to the push service with its French version, to be split by device language', async () => {
      const { svc, push, payloads } = make();
      await svc.toRole('admin_finance', { title: 'Payout requested', body: 'PO-1 · TechZone · $40.00', type: 'payout', entityId: 'p1' });
      await svc.toRole('customer', { title: 'Sale', body: 'All 20% off', type: 'marketing', fr: { title: 'Soldes', body: 'Tout à -20 %' } });
      await svc.toRole('customer', { title: 'Hello', body: 'World', type: 'marketing' });
      await tick();
      const calls = push.sendToRole.mock.calls as unknown as [string, { title: string; fr?: { title: string; body: string } }][];
      expect(calls[0][1].fr).toEqual({ title: 'Versement demandé', body: 'PO-1 · TechZone · $40.00' });
      expect(calls[1][1]).toMatchObject({ title: 'Sale', fr: { title: 'Soldes', body: 'Tout à -20 %' } });
      expect(calls[2][1].fr).toBeUndefined();
      expect(payloads.map((p) => p.titleFr)).toEqual(['Versement demandé', 'Soldes', null]);
    });

    it('passes an authored French version through toUsers and toAdmins', async () => {
      const { svc, payloads } = make({ a: { role: 'customer', prefs: null }, b: { role: 'customer', prefs: null } });
      const fr = { title: 'Soldes', body: 'Tout à -20 %' };
      await svc.toUsers(['a', 'b', 'a'], { title: 'Sale', body: 'All 20% off', type: 'marketing', fr });
      await svc.toAdmins({ title: 'Sale', body: 'All 20% off', type: 'marketing', fr });
      expect(payloads).toHaveLength(2 + 6);
      expect(payloads.every((p) => p.titleFr === 'Soldes')).toBe(true);
    });

    it('puts titleFr / bodyFr into the push data (strings only, short) when the French is known, and skips them when it is not', async () => {
      const { svc, push } = make({ u1: { role: 'customer', prefs: null, locale: 'en' } });
      await svc.toUser('u1', { ...placed, type: 'order', entityId: 'o1' });
      await svc.toUser('u1', { title: 'Sale', body: 'x'.repeat(500), type: 'marketing', fr: { title: 'Soldes', body: 'y'.repeat(500) } });
      await svc.toUser('u1', { title: 'Big sale', body: 'Everything 20% off', type: 'marketing' });
      await svc.toRole('customer', { title: 'Sale', body: 'All 20% off', type: 'marketing', fr: { title: 'Soldes', body: 'Tout à -20 %' } });
      await svc.toRole('customer', { title: 'Hello', body: 'World', type: 'marketing' });
      await tick();
      const user = push.sendToUser.mock.calls as unknown as [string, { title: string; data: Record<string, string> }][];
      expect(user[0][1].data).toMatchObject({ titleFr: placedFr.title, bodyFr: placedFr.body });
      expect(user[0][1].title).toBe(placed.title); // an English device is still shown English
      expect(user[1][1].data.titleFr).toBe('Soldes');
      expect(user[1][1].data.bodyFr).toHaveLength(180);
      expect(user[2][1].data).not.toHaveProperty('titleFr');
      expect(Object.values(user[1][1].data).every((v) => typeof v === 'string')).toBe(true);
      const role = push.sendToRole.mock.calls as unknown as [string, { data: Record<string, string> }][];
      expect(role[0][1].data).toMatchObject({ titleFr: 'Soldes', bodyFr: 'Tout à -20 %' });
      expect(role[1][1].data).not.toHaveProperty('bodyFr');
    });

    it('translates the Settings test notice', async () => {
      const { svc, payloads } = make({ u1: { role: 'customer', prefs: null } });
      await svc.test({ id: 'u1' });
      expect(payloads[0].titleFr).toBe('Notification de test');
    });
  });
});
