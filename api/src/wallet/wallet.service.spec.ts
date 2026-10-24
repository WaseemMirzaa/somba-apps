import { WalletService } from './wallet.service';

function make(history: { description: string }[] = []) {
  const events: [string, string, unknown][] = [];
  const emitter = { toUser: (id: string, ev: string, p: unknown) => events.push([id, ev, p]) };
  const txs = { find: async () => history };
  const manager = {
    createQueryBuilder: () => {
      const qb = { update: () => qb, set: () => qb, where: () => qb, execute: async () => ({ affected: 1 }) };
      return qb;
    },
    findOne: async () => ({ id: 'u1', walletBalance: 80 }),
    create: (_entity: unknown, x: object) => ({ ...x }),
    save: async (x: object) => ({ id: 't1', ...x }),
  };
  const users = { manager: { transaction: <T>(run: (m: typeof manager) => Promise<T>) => run(manager) } };
  const svc = new WalletService(users as never, txs as never, emitter as never);
  return { svc, events, manager };
}

describe('WalletService French', () => {
  it('adds descriptionFr to every line of the history', async () => {
    const { svc } = make([
      { description: 'Order SOM-1' },
      { description: 'Wallet top-up via airtel_money' },
      { description: 'Refund for cancelled order SOM-1' },
      { description: 'Payout PO-1' },
      { description: 'Manual adjustment' },
    ]);
    const list = await svc.list('u1');
    expect(list.map((t) => t.description)).toEqual([
      'Order SOM-1',
      'Wallet top-up via airtel_money',
      'Refund for cancelled order SOM-1',
      'Payout PO-1',
      'Manual adjustment',
    ]);
    expect(list.map((t) => t.descriptionFr)).toEqual([
      'Commande SOM-1',
      'Recharge du portefeuille via Airtel Money',
      'Remboursement de la commande annulée SOM-1',
      'Versement PO-1',
      'Manual adjustment',
    ]);
  });

  it('adds descriptionFr to the live transaction, and returns the stored row', async () => {
    const { svc, events, manager } = make();
    const tx = await svc.apply('u1', 'refund', 12.5, 'Refund for SOM-9', manager as never);
    const live = events.find(([, ev]) => ev === 'wallet:transaction')![2] as { description: string; descriptionFr: string; amount: number; balance: number };
    expect(live).toMatchObject({ description: 'Refund for SOM-9', descriptionFr: 'Remboursement de SOM-9', amount: 12.5, balance: 80 });
    expect(tx).toMatchObject({ description: 'Refund for SOM-9' });
    expect(tx).not.toHaveProperty('descriptionFr');
  });

  it('translates the line a top-up writes', async () => {
    const { svc, events } = make();
    await svc.topUp('u1', 5, 'orange_money');
    const live = events.find(([, ev]) => ev === 'wallet:transaction')![2] as { description: string; descriptionFr: string };
    expect(live.description).toBe('Wallet top-up via Orange Money');
    expect(live.descriptionFr).toBe('Recharge du portefeuille via Orange Money');
  });

  it.each([
    ['airtel_money', 'Wallet top-up via Airtel Money', 'Recharge du portefeuille via Airtel Money'],
    ['orange_money', 'Wallet top-up via Orange Money', 'Recharge du portefeuille via Orange Money'],
    ['vodacom_mpesa', 'Wallet top-up via Vodacom M-Pesa', 'Recharge du portefeuille via Vodacom M-Pesa'],
    ['card', 'Wallet top-up via Card', 'Recharge du portefeuille via carte bancaire'],
  ])('a %s top-up reads with the method\'s name, never its id', async (method, en, fr) => {
    const { svc, events } = make();
    await svc.topUp('u1', 5, method);
    const live = events.find(([, ev]) => ev === 'wallet:transaction')![2] as { description: string; descriptionFr: string };
    expect(live).toMatchObject({ description: en, descriptionFr: fr });
  });
});
