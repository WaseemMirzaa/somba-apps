import { PaymentsService } from './payments.service';
import { PawapayRejectedError } from './pawapay.provider';

/**
 * A PaymentsService over one in-memory payment row, with conditional updates that behave like the real ones.
 * The default payment: $40 airtel_money, succeeded, pawaPay deposit `dep-1`.
 */
function make(patch: Record<string, unknown> = {}, opts: { pawapay?: null; refundedLine?: number } = {}) {
  const row: Record<string, unknown> = {
    id: 'p1', reference: 'PAY-1', orderId: 'o1', orderReference: 'SOM-1', userId: 'u1', method: 'airtel_money',
    amountUsd: 40, status: 'succeeded', providerRef: 'dep-1', refundTo: null, refundRef: null, refundStatus: null, refundedUsd: null,
    ...patch,
  };
  const matches = (where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => row[k] === v);
  const qb = () => {
    let set: Record<string, unknown> = {};
    let cond: (r: Record<string, unknown>) => boolean = () => true;
    const b = {
      update: () => b,
      set: (v: Record<string, unknown>) => ((set = v), b),
      where: (sql: string, p: Record<string, unknown>) => {
        cond = sql.includes('status IN')
          ? (r) => r.id === p.id && (p.from as string[]).includes(r.status as string)
          : sql.includes("refundStatus = 'sending'")
            ? (r) => r.id === p.id && r.refundStatus === 'sending'
            : () => false;
        return b;
      },
      execute: async () => (cond(row) ? (Object.assign(row, set), { affected: 1 }) : { affected: 0 }),
    };
    return b;
  };
  const manager = {
    createQueryBuilder: qb,
    update: async (_e: unknown, where: Record<string, unknown>, v: Record<string, unknown>) => {
      if (matches(where)) Object.assign(row, v);
    },
    transaction: async <T,>(fn: (m: unknown) => Promise<T>) => fn(manager),
  };
  const payments = {
    findOne: async ({ where }: { where: Record<string, unknown> }) => (matches(where) ? { ...row } : null),
    update: async (where: Record<string, unknown>, v: Record<string, unknown>) => {
      if (matches(where)) Object.assign(row, v);
    },
    manager,
  };
  const order = { id: 'o1', reference: 'SOM-1', customerId: 'u1', status: 'delivered', items: [{ productId: 'x', qty: 1, refundedUsd: opts.refundedLine ?? 0 }] };
  const orders = { findOne: async () => ({ ...order }), save: async (o: unknown) => o };
  const wallet = { apply: jest.fn(async () => undefined) };
  const notices: { title: string; body: string }[] = [];
  const roleNotices: { title: string; body: string }[] = [];
  const notifications = {
    toUser: async (_u: string, n: { title: string; body: string }) => notices.push(n),
    toRole: async (_r: string, n: { title: string; body: string }) => roleNotices.push(n),
  };
  const emitter = { toUser: () => undefined, toRoles: () => undefined };
  const pawapay = {
    newId: () => 'ref-1',
    refund: jest.fn(async () => undefined),
    check: jest.fn(async () => ({ found: true, final: false, succeeded: false }) as Record<string, unknown>),
  };
  const svc = new PaymentsService(
    payments as never, orders as never, wallet as never, notifications as never, emitter as never, {} as never,
    { name: 'pawapay' } as never, { find: async () => [] } as never, { restock: async () => undefined } as never,
    opts.pawapay === null ? null : (pawapay as never),
  );
  return { svc, row, wallet, notices, roleNotices, pawapay };
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
    const card = make({ method: 'stripe_card' });
    await expect(card.svc.refund('o1', false)).rejects.toThrow(/Only mobile-money payments/);
    const noPawapay = make({}, { pawapay: null });
    await expect(noPawapay.svc.refund('o1', false)).rejects.toThrow(/need pawaPay/);
  });

  it('sends a phone refund through pawaPay, then completes it when pawaPay confirms', async () => {
    const t = make();
    const out = await t.svc.refund('o1', false);
    expect(out).toMatchObject({ status: 'refunded', refundTo: 'phone', refundStatus: 'sending', refundedUsd: 40 });
    expect(t.pawapay.refund).toHaveBeenCalledWith(expect.objectContaining({ depositId: 'dep-1', amountUsd: 40 }));
    expect(t.wallet.apply).not.toHaveBeenCalled();
    expect(t.notices[0].body).toMatch(/\$40\.00 for SOM-1 is on its way back to your mobile-money number/);
    t.pawapay.check.mockResolvedValue({ found: true, final: true, succeeded: true });
    await t.svc.reconcileRefund(out.refundRef!);
    expect(t.row.refundStatus).toBe('completed');
    expect(t.notices.at(-1)!.title).toBe('Refund sent');
  });

  it('when pawaPay fails a phone refund, the money goes to the wallet (once) and finance is told', async () => {
    const t = make();
    const out = await t.svc.refund('o1', false);
    t.pawapay.check.mockResolvedValue({ found: true, final: true, succeeded: false, failureMessage: 'Wallet limit' });
    await t.svc.reconcileRefund(out.refundRef!);
    await t.svc.reconcileRefund(out.refundRef!);
    expect(t.row).toMatchObject({ refundStatus: 'failed', refundTo: 'wallet' });
    expect(t.wallet.apply).toHaveBeenCalledTimes(1);
    expect(t.wallet.apply).toHaveBeenCalledWith('u1', 'refund', 40, expect.stringContaining('phone refund failed'), expect.anything());
    expect(t.roleNotices.map((n) => n.title)).toContain('Phone refund failed');
  });

  it('when pawaPay refuses the refund outright, nothing is refunded and finance can use the wallet', async () => {
    const t = make();
    t.pawapay.refund.mockRejectedValue(new PawapayRejectedError('Deposit not completed', 'INVALID_STATE'));
    await expect(t.svc.refund('o1', false)).rejects.toThrow(/pawaPay refused the refund/);
    expect(t.row).toMatchObject({ status: 'succeeded', refundTo: null, refundStatus: null });
  });

  it('a wallet refund says how much was refunded (lines a seller already refunded are left out)', async () => {
    const t = make({}, { refundedLine: 10 });
    await t.svc.refund('o1', true);
    expect(t.wallet.apply).toHaveBeenCalledWith('u1', 'refund', 30, 'Refund for SOM-1', expect.anything());
    expect(t.notices[0].body).toBe('$30.00 for SOM-1 → wallet.');
  });

  it('never refunds more than is outstanding after seller-cancelled lines were paid back', () => {
    expect(PaymentsService.outstanding(50, { items: [{ refundedUsd: 12.5 }, { refundedUsd: 0 }] } as never)).toBe(37.5);
    expect(PaymentsService.outstanding(10, { items: [{ refundedUsd: 12 }] } as never)).toBe(0);
  });
});
