import { PushService } from './push.service';

type Row = { token: string; userId: string; role: string; platform: string; app: string; updatedAt?: Date };

function make() {
  const rows: Row[] = [];
  let clock = 0; // a deterministic "now": each write moves it on by one
  const repo = {
    findOne: async ({ where }: { where: Partial<Row> }) => rows.find((r) => r.token === where.token) ?? null,
    find: async ({ where, order }: { where: Partial<Row>; order?: { updatedAt?: 'ASC' | 'DESC' } }) => {
      const found = rows.filter((r) => Object.entries(where).every(([k, v]) => (r as never)[k] === v));
      if (order?.updatedAt) found.sort((a, b) => (a.updatedAt!.getTime() - b.updatedAt!.getTime()) * (order.updatedAt === 'ASC' ? 1 : -1));
      return found;
    },
    create: (x: Partial<Row>) => ({ ...x }) as Row,
    // Like TypeORM: a new row is stamped, a saved row that is already there is only re-stamped by an UPDATE (see `update`).
    save: async (r: Row) => { if (!rows.includes(r)) { r.updatedAt = new Date(++clock); rows.push(r); } return r; },
    update: async (w: { token: string }, p: Partial<Row>) => {
      const r = rows.find((x) => x.token === w.token);
      if (r) Object.assign(r, p, { updatedAt: new Date(++clock) });
    },
    createQueryBuilder: () => {
      const params: { userIds?: string[]; role?: string } = {};
      const qb = {
        leftJoin: () => qb,
        select: () => qb,
        addSelect: () => qb,
        where: (_sql: string, p: typeof params) => (Object.assign(params, p), qb),
        andWhere: () => qb,
        orderBy: () => qb,
        getRawMany: async () =>
          rows
            .filter((r) => (!params.userIds || params.userIds.includes(r.userId)) && (!params.role || r.role === params.role))
            .map((r) => ({ token: r.token, userId: r.userId, locale: null })),
      };
      return qb;
    },
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

  it('a device that registers again is stamped as seen now, so the registry forgets the stalest one, not the active one', async () => {
    const { svc, rows } = make();
    for (let i = 1; i <= 10; i++) await svc.register({ id: 'u1', role: 'customer' }, { token: `D${i}` });
    await svc.register({ id: 'u1', role: 'customer' }, { token: 'D1' }); // the oldest device is used again
    await svc.register({ id: 'u1', role: 'customer' }, { token: 'D11' }); // an eleventh device signs in
    const tokens = rows.map((r) => r.token);
    expect(tokens).toHaveLength(10);
    expect(tokens).toContain('D1');
    expect(tokens).not.toContain('D2');
  });

  it('pushes every device of a user in one go', async () => {
    const { svc } = make();
    for (const t of ['A', 'B', 'C']) await svc.register({ id: 'u1', role: 'customer' }, { token: t });
    const sent: string[][] = [];
    (svc as never as { messaging: unknown }).messaging = {
      sendEachForMulticast: async (m: { tokens: string[] }) => { sent.push(m.tokens); return { successCount: m.tokens.length, responses: m.tokens.map(() => ({ success: true })) }; },
    };
    expect(await svc.sendToUser('u1', { title: 't', body: 'b' })).toBe(3);
    expect(sent).toHaveLength(1);
    expect([...sent[0]].sort()).toEqual(['A', 'B', 'C']);
  });
});
