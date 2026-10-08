import { PushService } from './push.service';

type Row = { token: string; userId: string; role: string; platform: string; app: string };

function make() {
  const rows: Row[] = [];
  const repo = {
    findOne: async ({ where }: { where: Partial<Row> }) => rows.find((r) => r.token === where.token) ?? null,
    find: async ({ where }: { where: Partial<Row> }) =>
      rows.filter((r) => Object.entries(where).every(([k, v]) => (r as never)[k] === v)),
    create: (x: Partial<Row>) => ({ ...x }) as Row,
    save: async (r: Row) => { if (!rows.includes(r)) rows.push(r); return r; },
    delete: async (w: { token?: string | { _value: string[] }; userId?: string }) => {
      const dead = typeof w.token === 'string' ? [w.token] : w.token?._value;
      for (let i = rows.length - 1; i >= 0; i--) {
        if ((dead && dead.includes(rows[i].token)) || (w.userId && rows[i].userId === w.userId)) rows.splice(i, 1);
      }
    },
  };
  return { svc: new PushService(repo as never), rows };
}

describe('PushService', () => {
  beforeEach(() => { delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON; delete process.env.GOOGLE_APPLICATION_CREDENTIALS; });

  it('is a safe no-op without credentials', async () => {
    const { svc } = make();
    expect(svc.enabled).toBe(false);
    expect(await svc.sendToUser('u1', { title: 't', body: 'b' })).toBe(0);
  });

  it('registers idempotently and moves a token to the current user', async () => {
    const { svc, rows } = make();
    await svc.register({ id: 'u1', role: 'customer' }, { token: 'T' });
    await svc.register({ id: 'u2', role: 'rider' }, { token: 'T', app: 'rider' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: 'u2', role: 'rider', app: 'rider' });
  });

  it('rejects empty and oversized tokens', async () => {
    const { svc } = make();
    await expect(svc.register({ id: 'u', role: 'customer' }, { token: '  ' })).rejects.toThrow();
    await expect(svc.register({ id: 'u', role: 'customer' }, { token: 'x'.repeat(300) })).rejects.toThrow();
  });

  it('unregisterUser removes every device of the user', async () => {
    const { svc, rows } = make();
    await svc.register({ id: 'u1', role: 'customer' }, { token: 'A' });
    await svc.register({ id: 'u1', role: 'customer' }, { token: 'B' });
    await svc.unregisterUser('u1');
    expect(rows).toHaveLength(0);
  });

  it('delivers, reports reach and swallows transport failures', async () => {
    const { svc } = make();
    await svc.register({ id: 'u1', role: 'customer' }, { token: 'A' });
    (svc as never as { messaging: unknown }).messaging = {
      sendEachForMulticast: async () => ({ successCount: 1, responses: [{ success: true }] }),
    };
    expect(await svc.sendToUser('u1', { title: 't', body: 'b' })).toBe(1);
    (svc as never as { messaging: unknown }).messaging = {
      sendEachForMulticast: async () => { throw new Error('boom'); },
    };
    expect(await svc.sendToUser('u1', { title: 't', body: 'b' })).toBe(0);
  });
});
