import { PushService } from './push.service';

type Row = { token: string; userId: string; role: string; app: string; locale?: string };

/** The device query: the where / andWhere parameters pick the rows; the owner's language comes with each one. */
function deviceQuery(rows: Row[]) {
  return () => {
    const params: Record<string, string | string[]> = {};
    const qb = {
      leftJoin: () => qb,
      select: () => qb,
      addSelect: () => qb,
      where: (_sql: string, p: typeof params) => (Object.assign(params, p), qb),
      andWhere: (_sql: string, p: typeof params) => (Object.assign(params, p), qb),
      getRawMany: async () =>
        rows
          .filter(
            (r) =>
              (!params.userIds || params.userIds.includes(r.userId)) &&
              (!params.role || r.role === params.role) &&
              (!params.apps || params.apps.includes(r.app)),
          )
          .map((r) => ({ token: r.token, userId: r.userId, locale: r.locale ?? null })),
    };
    return qb;
  };
}

function make(rows: Row[]) {
  const repo = { createQueryBuilder: deviceQuery(rows), delete: async () => undefined };
  const svc = new PushService(repo as never);
  const sent: { tokens: string[]; notification: { title: string; body: string }; data: Record<string, string>; android: unknown; webpush?: unknown }[] = [];
  (svc as never as { messaging: unknown }).messaging = {
    sendEachForMulticast: async (m: (typeof sent)[number]) => {
      sent.push(m);
      return { successCount: m.tokens.length, responses: m.tokens.map(() => ({ success: true })) };
    },
  };
  return { svc, sent };
}

describe('PushService scope and payload', () => {
  const rows: Row[] = [
    { token: 'W1', userId: 'a1', role: 'admin', app: 'web' },
    { token: 'M1', userId: 'a1', role: 'admin', app: 'customer' },
    { token: 'R1', userId: 'r1', role: 'rider', app: 'rider' },
    { token: 'R2', userId: 'r2', role: 'rider', app: 'rider' },
  ];

  afterEach(() => delete process.env.WEB_URL);

  it('limits a role push to the given apps', async () => {
    const { svc, sent } = make(rows);
    expect(await svc.sendToRole('admin', { title: 't', body: 'b' }, { apps: ['web'] })).toBe(1);
    expect(sent[0].tokens).toEqual(['W1']);
  });

  it('skips users who opted out', async () => {
    const { svc, sent } = make(rows);
    await svc.sendToRole('rider', { title: 't', body: 'b' }, { skipUserIds: new Set(['r2']) });
    expect(sent[0].tokens).toEqual(['R1']);
  });

  it('adds the link, the Android channel and a web click target on HTTPS', async () => {
    process.env.WEB_URL = 'https://shop.example.cd/';
    const { svc, sent } = make(rows);
    await svc.sendToUsers(['r1'], { title: 't', body: 'b', link: '/rider/tasks/k1', data: { type: 'task' } });
    expect(sent[0].data).toEqual({ type: 'task', link: '/rider/tasks/k1' });
    expect(sent[0].android).toEqual({ priority: 'high', notification: { channelId: 'somba_default' } });
    expect(sent[0].webpush).toEqual({ fcmOptions: { link: 'https://shop.example.cd/rider/tasks/k1' } });
  });

  it('leaves out the web click target without an HTTPS web address', async () => {
    const { svc, sent } = make(rows);
    await svc.sendToUser('r1', { title: 't', body: 'b', link: '/rider/tasks' });
    expect(sent[0].webpush).toBeUndefined();
  });
});

describe('PushService language', () => {
  const rows: Row[] = [
    { token: 'F1', userId: 'a1', role: 'admin', app: 'web', locale: 'fr' },
    { token: 'E1', userId: 'a2', role: 'admin', app: 'web', locale: 'en' },
    { token: 'F2', userId: 'a3', role: 'admin', app: 'customer', locale: 'fr' },
    { token: 'U1', userId: 'a4', role: 'admin', app: 'web' }, // owner not found: English
    { token: 'F3', userId: 'a5', role: 'rider', app: 'rider', locale: 'fr' },
  ];
  const en = { title: 'Order placed', body: 'We received SOM-1.' };
  const fr = { title: 'Commande enregistrée', body: 'Nous avons reçu SOM-1.' };

  it('sends each device of a role the text in its owner’s language, one multicast per language', async () => {
    const { svc, sent } = make(rows);
    expect(await svc.sendToRole('admin', { ...en, fr })).toBe(4);
    expect(sent).toHaveLength(2);
    expect(sent[0].tokens.sort()).toEqual(['E1', 'U1']);
    expect(sent[0].notification).toEqual(en);
    expect(sent[1].tokens.sort()).toEqual(['F1', 'F2']);
    expect(sent[1].notification).toEqual(fr);
  });

  it('keeps the scope rules in every language group', async () => {
    const { svc, sent } = make(rows);
    await svc.sendToRole('admin', { ...en, fr }, { apps: ['web'], skipUserIds: new Set(['a1']) });
    expect(sent.map((m) => m.tokens)).toEqual([['E1', 'U1']]);
  });

  it('keeps the same link and data for both languages', async () => {
    const { svc, sent } = make(rows);
    await svc.sendToUsers(['a1', 'a2'], { ...en, fr, link: '/admin/orders/o1', data: { type: 'order' } });
    expect(sent).toHaveLength(2);
    for (const m of sent) expect(m.data).toEqual({ type: 'order', link: '/admin/orders/o1' });
  });

  it('sends one multicast to everyone when the notice has no French version', async () => {
    const { svc, sent } = make(rows);
    expect(await svc.sendToRole('admin', en)).toBe(5 - 1);
    expect(sent).toHaveLength(1);
    expect(sent[0].tokens.sort()).toEqual(['E1', 'F1', 'F2', 'U1']);
    expect(sent[0].notification).toEqual(en);
  });

  it('sends a lone French device only the French text', async () => {
    const { svc, sent } = make(rows);
    await svc.sendToUser('a5', { ...en, fr });
    expect(sent).toHaveLength(1);
    expect(sent[0].notification).toEqual(fr);
  });
});
