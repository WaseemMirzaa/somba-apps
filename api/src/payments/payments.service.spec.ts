import { DataSource } from 'typeorm';
import { DeliveryTask, Order, OrderItem, Payment, PaymentRefund, User, WalletTransaction } from '../database/entities';
import { recordingEmitter, testDb } from '../testing/test-db';
import { WalletService } from '../wallet/wallet.service';
import { PaymentsService } from './payments.service';
import { PawapayRejectedError } from './pawapay.provider';

let ds: DataSource | null = null;
afterEach(async () => {
  if (ds) await ds.destroy();
  ds = null;
});

/**
 * A PaymentsService over a real (in-memory SQLite) schema: one customer, one delivered order with two lines, and its
 * payment ($40 airtel_money, succeeded, pawaPay deposit `dep-1`) unless `patch` says otherwise. `refundedLine` is what
 * a seller already refunded on the first line.
 */
async function make(patch: Partial<Payment> = {}, opts: { pawapay?: null; refundedLine?: number; orderStatus?: Order['status'] } = {}) {
  ds = await testDb();
  const emitter = recordingEmitter();
  const user = await ds.getRepository(User).save(
    ds.getRepository(User).create({ emailHash: 'h1', email: 'a@b.c', passwordHash: 'x', name: 'Marie', role: 'customer', walletBalance: 0 }),
  );
  const order = await ds.getRepository(Order).save(
    ds.getRepository(Order).create({
      reference: 'SOM-1',
      customerId: user.id,
      customerName: 'Marie',
      status: opts.orderStatus ?? 'delivered',
      subtotalUsd: 36,
      deliveryFeeUsd: 4,
      totalUsd: 40,
      items: [
        { productId: 'x', productName: 'X', variant: 'Default', qty: 1, priceUsd: 20, refundedUsd: opts.refundedLine ?? 0 },
        { productId: 'y', productName: 'Y', variant: 'Default', qty: 1, priceUsd: 16 },
      ] as OrderItem[],
    }),
  );
  await ds.getRepository(Payment).save(
    ds.getRepository(Payment).create({
      reference: 'PAY-1', orderId: order.id, orderReference: 'SOM-1', userId: user.id, method: 'airtel_money', amountUsd: 40, status: 'succeeded', providerRef: 'dep-1',
      ...patch,
    }),
  );
  const wallet = new WalletService(ds.getRepository(User), ds.getRepository(WalletTransaction), emitter as never);
  const apply = jest.spyOn(wallet, 'apply');
  const notices: { title: string; body: string }[] = [];
  const roleNotices: { title: string; body: string }[] = [];
  const notifications = {
    toUser: async (_u: string, n: { title: string; body: string }) => notices.push(n),
    toRole: async (_r: string, n: { title: string; body: string }) => roleNotices.push(n),
  };
  const pawapay = {
    newId: () => 'ref-1',
    refund: jest.fn(async () => undefined),
    check: jest.fn(async () => ({ found: true, final: false, succeeded: false }) as Record<string, unknown>),
  };
  const svc = new PaymentsService(
    ds.getRepository(Payment), ds.getRepository(Order), wallet, notifications as never, emitter as never, {} as never,
    { name: 'pawapay' } as never, ds.getRepository(DeliveryTask), { restock: async () => undefined } as never,
    opts.pawapay === null ? null : (pawapay as never),
  );
  const row = async () => (await ds!.getRepository(Payment).findOneByOrFail({ id: (await ds!.getRepository(Payment).findOneByOrFail({ reference: 'PAY-1' })).id }));
  const ledger = () => ds!.getRepository(PaymentRefund).find({ order: { createdAt: 'ASC', id: 'ASC' } });
  const balance = async () => (await ds!.getRepository(User).findOneByOrFail({ id: user.id })).walletBalance;
  return { svc, ds, user, order, emitter, row, ledger, balance, wallet, apply, notices, roleNotices, pawapay };
}

describe('PaymentsService.normalisePhone', () => {
  it('accepts common formats', () => {
    expect(PaymentsService.normalisePhone('+243 81 234 5678')).toBe('+243812345678');
    expect(PaymentsService.normalisePhone('(081) 234-5678')).toBe('0812345678');
  });
  it('rejects junk', () => {
    for (const bad of ['', 'abc', '123', undefined, '+243 81 234 5678 99 99 99 99']) {
      expect(() => PaymentsService.normalisePhone(bad)).toThrow();
    }
  });
});

describe('PaymentsService.assertMethodAllowed', () => {
  const make = (codEnabled: string | null, provider: unknown) =>
    new PaymentsService(
      {} as never, {} as never, {} as never, {} as never, {} as never,
      { get: async () => codEnabled } as never,
      provider as never,
      {} as never, {} as never,
    );
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it('COD is refused unless codEnabled is "true"', async () => {
    await expect(make(null, null).assertMethodAllowed('cod')).rejects.toThrow(/not available/);
    await expect(make('false', null).assertMethodAllowed('cod')).rejects.toThrow();
    await expect(make('true', null).assertMethodAllowed('cod')).resolves.toBeUndefined();
  });
  it('mobile money is refused with no provider, allowed with one', async () => {
    await expect(make('false', null).assertMethodAllowed('orange_money')).rejects.toThrow(/not available/);
    await expect(make('false', { name: 'x' }).assertMethodAllowed('orange_money')).resolves.toBeUndefined();
  });
  it('card is refused in production, mocked elsewhere', async () => {
    process.env.NODE_ENV = 'production';
    await expect(make(null, null).assertMethodAllowed('stripe_card')).rejects.toThrow();
    process.env.NODE_ENV = 'development';
    await expect(make(null, null).assertMethodAllowed('stripe_card')).resolves.toBeUndefined();
  });
  it('unknown methods are refused', async () => {
    await expect(make(null, null).assertMethodAllowed('bitcoin')).rejects.toThrow(/Unknown/);
  });
});

describe('PaymentsService.refund', () => {
  it('refuses a refund to the phone without pawaPay, and for a payment that was not mobile money', async () => {
    const card = await make({ method: 'stripe_card' });
    await expect(card.svc.refund(card.order.id, false)).rejects.toThrow(/Only mobile-money payments/);
    const noPawapay = await make({}, { pawapay: null });
    await expect(noPawapay.svc.refund(noPawapay.order.id, false)).rejects.toThrow(/need pawaPay/);
  });

  it('sends a phone refund through pawaPay, then completes it when pawaPay confirms', async () => {
    const t = await make();
    const out = await t.svc.refund(t.order.id, false);
    expect(out).toMatchObject({ status: 'refunded', refundTo: 'phone', refundStatus: 'sending', refundedUsd: 40 });
    expect(out.refund).toMatchObject({ amountUsd: 40, refundTo: 'phone', status: 'sending', kind: 'admin', refundRef: 'ref-1' });
    expect(t.pawapay.refund).toHaveBeenCalledWith(expect.objectContaining({ depositId: 'dep-1', amountUsd: 40 }));
    expect(t.apply).not.toHaveBeenCalled();
    expect(t.notices[0].body).toMatch(/\$40\.00 for SOM-1 is on its way back to your mobile-money number/);
    t.pawapay.check.mockResolvedValue({ found: true, final: true, succeeded: true });
    await t.svc.reconcileRefund(out.refundRef!);
    expect((await t.row()).refundStatus).toBe('completed');
    expect((await t.ledger())[0]).toMatchObject({ status: 'completed', refundTo: 'phone' });
    expect(t.notices.at(-1)!.title).toBe('Refund sent');
  });

  it('when pawaPay fails a phone refund, the money goes to the wallet (once) and finance is told', async () => {
    const t = await make();
    const out = await t.svc.refund(t.order.id, false);
    t.pawapay.check.mockResolvedValue({ found: true, final: true, succeeded: false, failureMessage: 'Wallet limit' });
    await t.svc.reconcileRefund(out.refundRef!);
    await t.svc.reconcileRefund(out.refundRef!);
    expect(await t.row()).toMatchObject({ refundStatus: 'failed', refundTo: 'wallet' });
    expect(t.apply).toHaveBeenCalledTimes(1);
    expect(t.apply).toHaveBeenCalledWith(t.user.id, 'refund', 40, expect.stringContaining('phone refund failed'), expect.anything());
    expect(await t.balance()).toBe(40);
    // the ledger says what really happened: the same $40, now a wallet refund
    expect(await t.ledger()).toEqual([expect.objectContaining({ amountUsd: 40, refundTo: 'wallet', status: 'failed' })]);
    expect(t.roleNotices.map((n) => n.title)).toContain('Phone refund failed');
  });

  it('when pawaPay refuses the refund outright, nothing is refunded and finance can use the wallet', async () => {
    const t = await make();
    t.pawapay.refund.mockRejectedValue(new PawapayRejectedError('Deposit not completed', 'INVALID_STATE'));
    await expect(t.svc.refund(t.order.id, false)).rejects.toThrow(/pawaPay refused the refund/);
    expect(await t.row()).toMatchObject({ status: 'succeeded', refundTo: null, refundStatus: null, refundedUsd: null });
    expect(await t.ledger()).toEqual([]); // the refund that never happened is not on the books
    const again = await t.svc.refund(t.order.id, true);
    expect(again.refund).toMatchObject({ amountUsd: 40, refundTo: 'wallet' });
  });

  it('a wallet refund says how much was refunded (lines a seller already refunded are left out)', async () => {
    const t = await make({}, { refundedLine: 10 });
    const out = await t.svc.refund(t.order.id, true);
    expect(t.apply).toHaveBeenCalledWith(t.user.id, 'refund', 30, 'Refund for SOM-1', expect.anything());
    expect(t.notices[0].body).toBe('$30.00 for SOM-1 → wallet.');
    expect(out.refund.amountUsd).toBe(30);
  });

  it('never refunds more than is outstanding after seller-cancelled lines were paid back', () => {
    expect(PaymentsService.outstanding(50, { items: [{ refundedUsd: 12.5 }, { refundedUsd: 0 }] } as never)).toBe(37.5);
    expect(PaymentsService.outstanding(10, { items: [{ refundedUsd: 12 }] } as never)).toBe(0);
  });
});
