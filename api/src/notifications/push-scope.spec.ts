import { PushService } from './push.service';

type Row = { token: string; userId: string; role: string; app: string };

function make(rows: Row[]) {
  const matches = (r: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      const list = (v as { _value?: unknown })?._value;
      return Array.isArray(list) ? list.includes((r as never)[k]) : (r as never)[k] === v;
    });
  const repo = {
    find: async ({ where }: { where: Record<string, unknown> }) => rows.filter((r) => matches(r, where)),
    delete: async () => undefined,
  };
  const svc = new PushService(repo as never);
  const sent: { tokens: string[]; data: Record<string, string>; android: unknown; webpush?: unknown }[] = [];
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
