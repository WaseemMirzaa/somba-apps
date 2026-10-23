import { DataSource } from 'typeorm';
import { ENTITIES, Order, OrderItem, Payout, PayoutStatementLine, Product } from '../database/entities';
import { PayoutsService } from './payouts.service';

/**
 * Real service on a real (in-memory SQLite) schema: balances use the commission STORED on each
 * order line, every payout request freezes a settlement statement, and refunds / returns after
 * a payout can leave a seller in the red (available < 0, owedUsd > 0, no withdrawals).
 */
describe('PayoutsService (stored commission, statements, batch approval)', () => {
  let ds: DataSource;
  let svc: PayoutsService;
  let setting: Record<string, string>;
  const wallet = { apply: jest.fn(async () => undefined) };
  const notifications = { toRole: jest.fn(async () => undefined), toUser: jest.fn(async () => undefined) };
  const emitter = { toUser: jest.fn(), toRoles: jest.fn() };
  const SELLER = { id: 'u1', name: 'Store One' };
  let seq = 0;

  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true });
    await ds.initialize();
    setting = { commissionPct: '10', payoutClearanceHours: '0', minPayoutUsd: '5' };
    svc = new PayoutsService(
      ds.getRepository(Payout),
      ds.getRepository(Order),
      ds.getRepository(Product),
      ds.getRepository('Seller') as never,
      { get: async (k: string) => setting[k] ?? null } as never,
      wallet as never,
      notifications as never,
      emitter as never,
      ds.getRepository(PayoutStatementLine),
    );
    await ds.getRepository(Product).insert({ id: 'p1', name: 'Phone', price: 100, category: 'tech', sellerId: SELLER.id });
    jest.clearAllMocks();
  });
  afterEach(async () => ds.destroy());

  /** A delivered order with one line of `price` x `qty` at the commission rate in force when it was placed. */
  const sell = async (price: number, opts: { pct?: number; qty?: number; status?: Order['status']; fulfilment?: OrderItem['fulfilment'] } = {}) => {
    const qty = opts.qty ?? 1;
    const pct = opts.pct ?? 10;
    const n = ++seq;
    const order = await ds.getRepository(Order).save(
      ds.getRepository(Order).create({
        reference: `SO-${n}`,
        customerId: 'c1',
        customerName: 'Cust',
        status: opts.status ?? 'delivered',
        items: [
          Object.assign(new OrderItem(), {
            productId: 'p1',
            productName: 'Phone',
            variant: 'Default',
            qty,
            priceUsd: price,
            sellerId: SELLER.id,
            fulfilment: opts.fulfilment ?? 'received',
            commissionPct: pct,
            commissionUsd: Number(((price * qty * pct) / 100).toFixed(2)),
          }),
        ],
      }),
    );
    return order;
  };
  const markReturned = (orderId: string) => ds.getRepository(Order).update({ id: orderId }, { status: 'returned' });
  const payoutOf = (id: string) => ds.getRepository(Payout).findOneByOrFail({ id });

  it('is positive while earnings exceed payouts', async () => {
    await sell(100);
    await ds.getRepository(Payout).insert({ reference: 'PO-X1', sellerId: SELLER.id, sellerName: 'S', amountUsd: 50, status: 'paid' });
    expect(await svc.available(SELLER.id)).toMatchObject({ earned: 90, committed: 50, available: 40, owedUsd: 0, commissionUsd: 10 });
  });

  it('goes negative (and reports what is owed) once a return erases earnings already paid out', async () => {
    await ds.getRepository(Payout).insert({ reference: 'PO-X1', sellerId: SELLER.id, sellerName: 'S', amountUsd: 60, status: 'paid' });
    expect(await svc.available(SELLER.id)).toMatchObject({ earned: 0, committed: 60, available: -60, owedUsd: 60 });
  });

  it('refuses a withdrawal while available is not positive', async () => {
    await ds.getRepository(Payout).insert({ reference: 'PO-X1', sellerId: SELLER.id, sellerName: 'S', amountUsd: 60, status: 'paid' });
    await expect(svc.request(SELLER, 10, 'wallet')).rejects.toThrow(/nothing can be withdrawn/);
    await sell(100); // earned 90, committed 60 -> 30 left
    await expect(svc.request(SELLER, 40, 'wallet')).rejects.toThrow(/withdraw up to \$30\.00/);
  });

  it('uses the commission stored on each line: changing the global rate never rewrites past orders', async () => {
    await sell(100, { pct: 10 });
    await sell(200, { pct: 25 });
    const before = await svc.available(SELLER.id);
    expect(before).toMatchObject({ earned: 90 + 150, commissionUsd: 10 + 50, commissionPct: 10 });
    setting.commissionPct = '40';
    const after = await svc.available(SELLER.id);
    expect(after.earned).toBe(before.earned);
    expect(after.commissionUsd).toBe(60);
    expect(after.commissionPct).toBe(40); // the rate for NEW orders
  });

  it('ignores cancelled lines', async () => {
    await sell(100, { fulfilment: 'cancelled' });
    await sell(50);
    expect(await svc.available(SELLER.id)).toMatchObject({ earned: 45 });
  });

  it('builds a statement of sale lines on request and does not settle the same line twice', async () => {
    const o1 = await sell(100, { qty: 2, pct: 10 }); // gross 200, commission 20, net 180
    await sell(50, { pct: 20 }); // gross 50, commission 10, net 40
    const p1 = await svc.request(SELLER, 100, 'wallet');
    expect(p1).toMatchObject({ statementGrossUsd: 250, statementCommissionUsd: 30, statementRefundsUsd: 0, statementNetUsd: 220, openingBalanceUsd: 0, closingBalanceUsd: 120 });

    const st = await svc.statement(p1.id, { id: SELLER.id, role: 'seller' });
    expect(st.legacy).toBe(false);
    expect(st.lines).toHaveLength(2);
    const big = st.lines.find((l) => l.orderId === o1.id)!;
    expect(big).toMatchObject({ kind: 'sale', qty: 2, grossUsd: 200, commissionPct: 10, commissionUsd: 20, netUsd: 180, refundUsd: 0 });
    expect(st.totals).toMatchObject({ grossUsd: 250, commissionUsd: 30, netUsd: 220, openingBalanceUsd: 0, closingBalanceUsd: 120, amountUsd: 100 });

    // 120 still available: the second statement has no lines but carries the balance.
    const p2 = await svc.request(SELLER, 120, 'wallet');
    expect(p2).toMatchObject({ statementNetUsd: 0, openingBalanceUsd: 120, closingBalanceUsd: 0 });
    expect(await ds.getRepository(PayoutStatementLine).count({ where: { payoutId: p2.id } })).toBe(0);
  });

  it('releases the lines of a rejected payout so they are settled again', async () => {
    await sell(100);
    const p1 = await svc.request(SELLER, 50, 'wallet');
    expect(await ds.getRepository(PayoutStatementLine).count({ where: { payoutId: p1.id } })).toBe(1);
    await svc.reject(p1.id, 'wrong account');
    // History is kept...
    expect(await ds.getRepository(PayoutStatementLine).count({ where: { payoutId: p1.id } })).toBe(1);
    // ...but the sale is available again and lands on the next statement.
    const p2 = await svc.request(SELLER, 90, 'wallet');
    expect(p2).toMatchObject({ statementGrossUsd: 100, statementNetUsd: 90, openingBalanceUsd: 0, closingBalanceUsd: 0 });
    expect(await ds.getRepository(PayoutStatementLine).count({ where: { payoutId: p2.id } })).toBe(1);
  });

  it('claws a settled sale back as a negative refund line once its order is returned', async () => {
    const o1 = await sell(100); // net 90
    const p1 = await svc.request(SELLER, 90, 'wallet');
    await svc.approve(p1.id);
    await markReturned(o1.id);
    expect(await svc.available(SELLER.id)).toMatchObject({ earned: 0, available: -90, owedUsd: 90 });

    await sell(200); // net 180 -> available 90
    const p2 = await svc.request(SELLER, 50, 'wallet');
    const st = await svc.statement(p2.id, { id: 'someone-admin', role: 'admin_finance' });
    const refund = st.lines.find((l) => l.kind === 'refund')!;
    expect(refund).toMatchObject({ orderId: o1.id, refundUsd: 90, netUsd: -90, grossUsd: 0 });
    expect(st.lines.find((l) => l.kind === 'sale')).toMatchObject({ grossUsd: 200, netUsd: 180 });
    expect(st.totals).toMatchObject({ grossUsd: 200, commissionUsd: 20, refundsUsd: 90, netUsd: 90, openingBalanceUsd: 0, closingBalanceUsd: 40 });

    // Not clawed back twice.
    const p3 = await svc.request(SELLER, 40, 'wallet');
    expect(p3.statementRefundsUsd).toBe(0);
    expect((await svc.statement(p3.id, { id: SELLER.id, role: 'seller' })).lines).toHaveLength(0);
  });

  it('shows who may read a statement', async () => {
    await sell(100);
    const p1 = await svc.request(SELLER, 50, 'wallet');
    await expect(svc.statement(p1.id, { id: 'u2', role: 'seller' })).rejects.toThrow(/not found/i);
    await expect(svc.statement(p1.id, { id: 'u1', role: 'customer' })).rejects.toThrow(/not found/i);
    await expect(svc.statement(p1.id, { id: 'a1', role: 'admin' })).resolves.toMatchObject({ legacy: false });
  });

  it('a payout issued before statements existed reports legacy and no lines', async () => {
    const old = await ds.getRepository(Payout).save(ds.getRepository(Payout).create({ reference: 'PO-OLD1', sellerId: SELLER.id, sellerName: 'S', amountUsd: 20, status: 'paid' }));
    const st = await svc.statement(old.id, { id: SELLER.id, role: 'seller' });
    expect(st).toMatchObject({ legacy: true, totals: null, lines: [] });
  });

  it('approveBatch: each payout succeeds or fails on its own (bank without a reference fails, wallet is paid)', async () => {
    await sell(1000);
    const bank = await svc.request(SELLER, 100, 'bank', 'Holder, IBAN CD00 1234');
    const w = await svc.request(SELLER, 100, 'wallet');
    const res = await svc.approveBatch([{ payoutId: bank.id }, { payoutId: w.id }, { payoutId: 'missing' }, { payoutId: w.id }]);
    expect(res.map((r) => r.ok)).toEqual([false, true, false, false]);
    expect(res[0].error).toMatch(/reference of the transfer/);
    expect(res[2].error).toMatch(/not found/i);
    expect(res[3].error).toMatch(/twice/i);
    expect((await payoutOf(bank.id)).status).toBe('requested');
    expect((await payoutOf(w.id)).status).toBe('paid');
    expect(wallet.apply).toHaveBeenCalledTimes(1);

    const again = await svc.approveBatch([{ payoutId: bank.id, providerRef: 'TRX-12345' }]);
    expect(again[0]).toMatchObject({ ok: true });
    expect((await payoutOf(bank.id)).providerRef).toBe('TRX-12345');
    await expect(svc.approveBatch([])).rejects.toThrow(/at least one/);
    await expect(svc.approveBatch(Array.from({ length: 101 }, (_, i) => ({ payoutId: `x${i}` })))).rejects.toThrow(/at most 100/i);
  });
});
