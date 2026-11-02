import { DataSource } from 'typeorm';
import { Order, User, WalletTransaction } from '../database/entities';
import { recordingEmitter, testDb } from '../testing/test-db';
import { CustomersService } from './customers.service';

let ds: DataSource;
let svc: CustomersService;

beforeEach(async () => {
  ds = await testDb();
  svc = new CustomersService(ds.getRepository(User), ds.getRepository(Order), ds.getRepository(WalletTransaction), recordingEmitter() as never);
});
afterEach(async () => ds.destroy());

const addUser = (over: Partial<User>) =>
  ds.getRepository(User).save(ds.getRepository(User).create({ emailHash: `h-${Math.random()}`, email: 'x@y.z', passwordHash: 'x', name: 'Awa', role: 'customer', ...over }));

describe('customers:wallet (read-only)', () => {
  it('returns the balance and the newest transactions first, with the French text', async () => {
    const c = await addUser({ walletBalance: 42.5 });
    const txs = ds.getRepository(WalletTransaction);
    for (let i = 1; i <= 3; i++) {
      const row = await txs.save(txs.create({ userId: c.id, type: i === 3 ? 'debit' : 'topup', amount: 10 * i, balance: 10 * i, description: i === 3 ? 'Order SOM-1001' : 'Top-up' }));
      await txs.update({ id: row.id }, { createdAt: new Date(Date.UTC(2026, 0, i)) });
    }
    await txs.save(txs.create({ userId: 'someone-else', type: 'topup', amount: 99, balance: 99, description: 'Top-up' }));
    const w = await svc.wallet(c.id);
    expect(w.balance).toBe(42.5);
    expect(w.transactions.map((t) => t.amount)).toEqual([30, 20, 10]); // newest first, only this customer
    expect(w.transactions[0]).toMatchObject({ type: 'debit', description: 'Order SOM-1001', descriptionFr: 'Commande SOM-1001' });
  });

  it('pages with limit and offset (20 by default, 100 at most)', async () => {
    const c = await addUser({});
    const txs = ds.getRepository(WalletTransaction);
    await txs.save(Array.from({ length: 25 }, (_, i) => txs.create({ userId: c.id, type: 'topup', amount: i + 1, balance: i + 1, description: 'Top-up' })));
    expect((await svc.wallet(c.id)).transactions).toHaveLength(20);
    expect((await svc.wallet(c.id, { limit: 10, offset: 20 })).transactions).toHaveLength(5);
    expect((await svc.wallet(c.id, { limit: 5000 })).transactions).toHaveLength(25);
  });

  it('is for customers only and changes nothing', async () => {
    const c = await addUser({ walletBalance: 5 });
    const seller = await addUser({ role: 'seller', walletBalance: 9 });
    await expect(svc.wallet(seller.id)).rejects.toThrow('Customer not found.');
    await expect(svc.wallet('missing')).rejects.toThrow('Customer not found.');
    await svc.wallet(c.id);
    expect((await ds.getRepository(User).findOneOrFail({ where: { id: c.id } })).walletBalance).toBe(5);
    expect(await ds.getRepository(WalletTransaction).count()).toBe(0);
  });
});
