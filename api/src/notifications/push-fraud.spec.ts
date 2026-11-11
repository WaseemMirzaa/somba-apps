import { PushService } from './push.service';

/** Registering a push token tells the fraud rules which account used which device (customers only, token hashed). */
describe('PushService.register feeds the device signal', () => {
  const rows: { token: string; userId: string; role: string; platform: string; app: string }[] = [];
  const repo = {
    findOne: async ({ where }: { where: { token: string } }) => rows.find((r) => r.token === where.token) ?? null,
    find: async () => [],
    create: (x: object) => ({ ...x }) as never,
    save: async (r: never) => {
      if (!rows.includes(r)) rows.push(r);
      return r;
    },
    update: async () => undefined,
    delete: async () => undefined,
  };
  const noted: [string, string][] = [];
  const signals = { noteDevice: async (u: string, t: string) => void noted.push([u, t]) };
  beforeEach(() => {
    rows.length = 0;
    noted.length = 0;
  });

  it('notes a customer device, again for the next account on the same token', async () => {
    const svc = new PushService(repo as never, signals as never);
    await svc.register({ id: 'u1', role: 'customer' }, { token: 'T' });
    await svc.register({ id: 'u2', role: 'customer' }, { token: 'T' });
    expect(noted).toEqual([['u1', 'T'], ['u2', 'T']]);
  });

  it('does not note riders, staff or sellers', async () => {
    const svc = new PushService(repo as never, signals as never);
    await svc.register({ id: 'r1', role: 'rider' }, { token: 'R', app: 'rider' });
    await svc.register({ id: 'a1', role: 'admin' }, { token: 'A', app: 'web' });
    expect(noted).toEqual([]);
  });

  it('registers fine with no recorder', async () => {
    const svc = new PushService(repo as never);
    expect(await svc.register({ id: 'u1', role: 'customer' }, { token: 'X' })).toMatchObject({ token: 'X', userId: 'u1' });
  });
});
