import { DataSource } from 'typeorm';
import { DeliveryTask, Order, Payment, User, WalletTransaction } from '../database/entities';
import { recordingEmitter, testDb } from '../testing/test-db';
import { WalletService } from '../wallet/wallet.service';
import { PawapayRejectedError } from './pawapay.provider';
import { PaymentsService } from './payments.service';

/**
 * One tap = one wallet top-up: a double tap, a retry or two requests at the same moment must not make two payments
 * (two approval prompts on the phone, two charges). Real PaymentsService over an in-memory database; the mobile-money
 * network is a stub that counts the prompts it was asked to send.
 */
let ds: DataSource | null = null;
afterEach(async () => {
  if (ds) await ds.destroy();
  ds = null;
});

const PHONE = '+243 81 234 5678';

async function make(opts: { initiate?: () => Promise<{ providerRef: string }> } = {}) {
  ds = await testDb();
  const user = await ds.getRepository(User).save(
    ds.getRepository(User).create({ emailHash: 'h1', email: 'a@b.c', passwordHash: 'x', name: 'Marie', role: 'customer', walletBalance: 0 }),
  );
  let n = 0;
  const initiate = jest.fn(opts.initiate ?? (async () => ({ providerRef: `dep-${++n}` })));
  const emitter = recordingEmitter();
  const wallet = new WalletService(ds.getRepository(User), ds.getRepository(WalletTransaction), emitter as never);
  const svc = new PaymentsService(
    ds.getRepository(Payment), ds.getRepository(Order), wallet, { toUser: async () => undefined, toRole: async () => undefined } as never,
    emitter as never, { get: async () => null } as never, { name: 'pawapay', initiate } as never, ds.getRepository(DeliveryTask), {} as never,
  );
  const rows = () => ds!.getRepository(Payment).find({ where: { purpose: 'topup' } });
  const topUp = (amount: number, over: { phone?: string; method?: string; key?: string } = {}) =>
    svc.startTopUp(user.id, amount, over.method ?? 'airtel_money', over.phone ?? PHONE, over.key);
  return { svc, user, initiate, rows, topUp };
}

describe('wallet top-up is idempotent', () => {
  it('the same key twice is one payment and one approval prompt', async () => {
    const t = await make();
    const a = await t.topUp(10, { key: 'tap-0000001' });
    const b = await t.topUp(10, { key: 'tap-0000001' });
    expect(b.id).toBe(a.id);
    expect(b.reference).toBe(a.reference);
    expect(await t.rows()).toHaveLength(1);
    expect(t.initiate).toHaveBeenCalledTimes(1);
  });

  it('two requests at the same moment with one key are one payment', async () => {
    const t = await make();
    const [a, b] = await Promise.all([t.topUp(10, { key: 'tap-0000002' }), t.topUp(10, { key: 'tap-0000002' })]);
    expect(b.id).toBe(a.id);
    expect(await t.rows()).toHaveLength(1);
    expect(t.initiate).toHaveBeenCalledTimes(1);
  });

  it('an older app (no key): an identical top-up while the first is pending is the same one, also at the same moment', async () => {
    const t = await make();
    const first = await t.topUp(10);
    expect((await t.topUp(10)).id).toBe(first.id);
    const second = await Promise.all([t.topUp(15), t.topUp(15)]);
    expect(second[1].id).toBe(second[0].id);
    expect(second[0].id).not.toBe(first.id);
    expect(await t.rows()).toHaveLength(2);
    expect(t.initiate).toHaveBeenCalledTimes(2);
  });

  it('a different amount, number or network is a new top-up', async () => {
    const t = await make();
    const base = await t.topUp(10);
    const ids = new Set([base.id, (await t.topUp(11)).id, (await t.topUp(10, { phone: '+243 99 111 2222' })).id]);
    expect(ids.size).toBe(3);
    await expect(t.topUp(10, { method: 'orange_money' })).rejects.toThrow(/pending top-ups/); // 3 open already
  });

  it('replays do not count against the three-pending limit', async () => {
    const t = await make();
    await t.topUp(10, { key: 'tap-0000003' });
    await t.topUp(11, { key: 'tap-0000004' });
    await t.topUp(12, { key: 'tap-0000005' });
    await expect(t.topUp(10, { key: 'tap-0000003' })).resolves.toMatchObject({ amountUsd: 10 });
    await expect(t.topUp(13, { key: 'tap-0000006' })).rejects.toThrow(/pending top-ups/);
  });

  it('a key reused for a different top-up is refused, and an invalid key too', async () => {
    const t = await make();
    await t.topUp(10, { key: 'tap-0000007' });
    await expect(t.topUp(25, { key: 'tap-0000007' })).rejects.toThrow('This top-up reference was already used for a different top-up.');
    await expect(t.topUp(10, { key: 'x' })).rejects.toThrow('Invalid top-up reference. Please try again.');
    expect(await t.rows()).toHaveLength(1);
  });

  it('a refused first request is answered the same way on replay, without a second prompt', async () => {
    const t = await make({ initiate: async () => { throw new PawapayRejectedError('REJECTED', 'amount too small'); } });
    await expect(t.topUp(10, { key: 'tap-0000008' })).rejects.toThrow(/refused the payment/);
    await expect(t.topUp(10, { key: 'tap-0000008' })).rejects.toThrow(/refused the payment/);
    expect(t.initiate).toHaveBeenCalledTimes(1);
  });

  it('with no key, a retry after a failed top-up is a new one, not an error', async () => {
    let fail = true;
    const t = await make({ initiate: async () => { if (fail) throw new PawapayRejectedError('REJECTED', 'try later'); return { providerRef: 'dep-ok' }; } });
    await expect(t.topUp(10)).rejects.toThrow(/refused the payment/);
    fail = false;
    const retry = await t.topUp(10);
    expect(retry.status).toBe('pending');
    expect(retry.providerRef).toBe('dep-ok');
    expect(await t.rows()).toHaveLength(2);
  });
});
