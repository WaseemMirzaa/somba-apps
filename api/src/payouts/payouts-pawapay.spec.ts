import { PawapayRejectedError, PawapayUnavailableError } from '../payments/pawapay.provider';
import { PayoutsService } from './payouts.service';

/** PayoutsService over one in-memory payout, with the conditional updates the service relies on. */
function make(patch: Record<string, unknown> = {}, pawapayOn = true) {
  const row: Record<string, unknown> = {
    id: 'po1', reference: 'PO-1', sellerId: 's1', sellerName: 'Shop', amountUsd: 25, method: 'mobile_money',
    account: 'Airtel +243 97 123 4567', status: 'requested', providerRef: null, receiptRef: null, note: null,
    ...patch,
  };
  const matches = (where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => row[k] === v);
  const qb = () => {
    let set: Record<string, unknown> = {};
    let from = '';
    const b = {
      update: () => b,
      set: (v: Record<string, unknown>) => ((set = v), b),
      where: (sql: string) => ((from = /status = '(\w+)'/.exec(sql)?.[1] ?? ''), b),
      execute: async () => (row.status === from ? (Object.assign(row, set), { affected: 1 }) : { affected: 0 }),
    };
    return b;
  };
  const repo = {
    findOne: async ({ where }: { where: Record<string, unknown> }) => (matches(where) ? { ...row } : null),
    find: async () => (row.status === 'sending' ? [{ ...row }] : []),
    update: async (where: Record<string, unknown>, v: Record<string, unknown>) => {
      if (matches(where)) Object.assign(row, v);
    },
    createQueryBuilder: qb,
  };
  const sellerNotes: string[] = [];
  const financeNotes: string[] = [];
  const notifications = {
    toUser: async (_u: string, n: { title: string }) => sellerNotes.push(n.title),
    toRole: async (_r: string, n: { title: string }) => financeNotes.push(n.title),
  };
  const pawapay = {
    newId: () => 'pay-ref-1',
    predictProvider: jest.fn(async () => 'AIRTEL_COD'),
    payout: jest.fn(async () => undefined),
    check: jest.fn(async () => ({ found: true, final: false, succeeded: false }) as Record<string, unknown>),
  };
  const svc = new PayoutsService(
    repo as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    notifications as never, { toUser: () => undefined, toRoles: () => undefined } as never, {} as never,
    null, pawapayOn ? (pawapay as never) : null,
  );
  return { svc, row, pawapay, sellerNotes, financeNotes };
}

describe('PayoutsService with pawaPay', () => {
  it('sends a mobile-money payout to the number the seller gave, then marks it paid with the receipt', async () => {
    const t = make();
    const sent = await t.svc.sendWithPawapay('po1');
    expect(sent).toMatchObject({ status: 'sending', providerRef: 'pay-ref-1' });
    expect(t.pawapay.payout).toHaveBeenCalledWith({ payoutId: 'pay-ref-1', amountUsd: 25, phone: '+243971234567', provider: 'AIRTEL_COD', reference: 'PO-1' });
    expect(t.sellerNotes).toEqual(['Payout on its way']);
    t.pawapay.check.mockResolvedValue({ found: true, final: true, succeeded: true, providerTransactionId: 'RCPT-7' });
    await t.svc.reconcileSending();
    expect(t.row).toMatchObject({ status: 'paid', receiptRef: 'RCPT-7' });
    expect(t.sellerNotes.at(-1)).toBe('Payout paid');
  });

  it('a failed transfer goes back to the queue and finance is told', async () => {
    const t = make();
    await t.svc.sendWithPawapay('po1');
    t.pawapay.check.mockResolvedValue({ found: true, final: true, succeeded: false, failureMessage: 'Recipient not found' });
    await t.svc.reconcilePawapay('pay-ref-1');
    expect(t.row).toMatchObject({ status: 'requested', providerRef: null, note: 'pawaPay: Recipient not found' });
    expect(t.financeNotes).toEqual(['pawaPay payout failed']);
  });

  it('a refused transfer is undone; an unanswered one waits for the status check', async () => {
    const refused = make();
    refused.pawapay.payout.mockRejectedValue(new PawapayRejectedError('Amount out of bounds', 'AMOUNT_OUT_OF_BOUNDS'));
    await expect(refused.svc.sendWithPawapay('po1')).rejects.toThrow(/pawaPay refused the payout/);
    expect(refused.row).toMatchObject({ status: 'requested', providerRef: null });
    const silent = make();
    silent.pawapay.payout.mockRejectedValue(new PawapayUnavailableError('timeout'));
    await expect(silent.svc.sendWithPawapay('po1')).resolves.toMatchObject({ status: 'sending' });
  });

  it('only mobile-money payouts that are still requested, and only with pawaPay connected', async () => {
    await expect(make({ method: 'bank' }).svc.sendWithPawapay('po1')).rejects.toThrow(/Only mobile-money/);
    await expect(make({ status: 'paid' }).svc.sendWithPawapay('po1')).rejects.toThrow(/no longer awaiting/);
    await expect(make({ account: 'see email' }).svc.sendWithPawapay('po1')).rejects.toThrow(/no phone number/);
    await expect(make({}, false).svc.sendWithPawapay('po1')).rejects.toThrow(/not connected/);
  });
});
