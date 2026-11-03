import { DataSource } from 'typeorm';
import { Exchange, Replacement, Seller } from '../database/entities';
import { testDb } from '../testing/test-db';
import { SellerLapseService } from './seller-lapse.service';

const ONLY_DATE = ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'performance', 'hrtime'] as const;
const T0 = new Date('2026-11-03T08:00:00Z');
const HOUR = 3_600_000;
const at = (ms: number) => jest.setSystemTime(new Date(T0.getTime() + ms));

let ds: DataSource;
let svc: SellerLapseService;
let store: Seller;
let notices: { to: string; title: string; body: string; type?: string; entityId?: string }[];

async function replacement(over: Partial<Replacement> = {}) {
  const repo = ds.getRepository(Replacement);
  return repo.save(repo.create({ reference: `REP-${Math.random()}`.slice(0, 20), orderId: 'o1', orderReference: 'SOM-1', customerId: 'c1', customerName: 'Marie', sellerId: store.id, sku: 'S1', productName: 'Cup', status: 'requested', sellerDueAt: new Date(T0.getTime() + 48 * HOUR), ...over }));
}
async function exchange(over: Partial<Exchange> = {}) {
  const repo = ds.getRepository(Exchange);
  return repo.save(repo.create({ reference: `EXC-${Math.random()}`.slice(0, 20), orderId: 'o1', orderReference: 'SOM-1', customerId: 'c1', customerName: 'Marie', sellerId: store.id, fromSku: 'S1', fromName: 'Polo M', toSku: 'S2', toName: 'Polo L', status: 'requested', sellerDueAt: new Date(T0.getTime() + 48 * HOUR), ...over }));
}

beforeEach(async () => {
  jest.useFakeTimers({ now: T0, doNotFake: [...ONLY_DATE] });
  ds = await testDb();
  notices = [];
  store = await ds.getRepository(Seller).save(ds.getRepository(Seller).create({ name: 'One', userId: 'su1', status: 'approved' }));
  const record = (to: string) => async (...args: unknown[]) => {
    const n = args[args.length - 1] as { title: string; body: string; type?: string; entityId?: string };
    notices.push({ to: `${to}${args.length === 2 ? args[0] : ''}`, ...n });
  };
  svc = new SellerLapseService(ds.getRepository(Replacement), ds.getRepository(Exchange), ds.getRepository(Seller), { toUser: record('user:'), toRole: record('role:') } as never);
});
afterEach(async () => {
  jest.useRealTimers();
  await ds.destroy();
});

describe('replacements and exchanges whose seller never answers', () => {
  it('nothing happens before the response time ends', async () => {
    await replacement();
    await exchange();
    at(48 * HOUR - 1000);
    expect(await svc.sweep()).toBe(0);
    expect(notices).toHaveLength(0);
  });

  it('past the deadline the customer, the seller and support are told, exactly once', async () => {
    const r = await replacement();
    const x = await exchange();
    at(48 * HOUR + 1000);
    expect(await svc.sweep()).toBe(2);
    expect(await svc.sweep()).toBe(0);
    expect(notices.filter((n) => n.to === 'user:c1').map((n) => [n.title, n.type, n.entityId])).toEqual(
      expect.arrayContaining([['Seller did not respond', 'replacement', r.id], ['Seller did not respond', 'exchange', x.id]]),
    );
    expect(notices.filter((n) => n.to === 'user:su1')).toHaveLength(2);
    expect(notices.filter((n) => n.to === 'role:admin_support')).toHaveLength(2);
    const row = await ds.getRepository(Replacement).findOneByOrFail({ id: r.id });
    expect(row.sellerLapsedAt!.getTime()).toBe(T0.getTime() + 48 * HOUR + 1000);
    // The request itself still waits for an answer: support or the seller can still decide it.
    expect(row.status).toBe('requested');
  });

  it('leaves alone a request the seller answered, one that is not waiting any more, and one with no deadline', async () => {
    await replacement({ status: 'approved' });
    await exchange({ status: 'rejected' });
    await replacement({ sellerDueAt: null });
    at(100 * HOUR);
    expect(await svc.sweep()).toBe(0);
    expect(notices).toHaveLength(0);
  });

  it('a request filed by staff for no store still tells the customer and support', async () => {
    await exchange({ sellerId: null });
    at(49 * HOUR);
    expect(await svc.sweep()).toBe(1);
    expect(notices.map((n) => n.to).sort()).toEqual(['role:admin_support', 'user:c1']);
  });

  it('runs on its own timer and stops with the module', async () => {
    jest.useRealTimers();
    jest.useFakeTimers();
    const sweep = jest.spyOn(svc, 'sweep').mockResolvedValue(0);
    svc.onModuleInit();
    await jest.advanceTimersByTimeAsync(120_000);
    expect(sweep).toHaveBeenCalledTimes(2);
    svc.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(120_000);
    expect(sweep).toHaveBeenCalledTimes(2);
  });
});
