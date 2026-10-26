import { Order, Payout } from '../database/entities';
import { commerceWorld } from '../testing/commerce-db';
import type { World } from '../testing/commerce-db';
import { FinanceChangeSubscriber } from './finance-change.subscriber';
import { financeVersion } from './finance-version';

let w: World;
let sub: FinanceChangeSubscriber;
beforeEach(async () => {
  process.env.FINANCE_CHANGED_DEBOUNCE_MS = '30';
  w = await commerceWorld();
  sub = new FinanceChangeSubscriber(w.ds, w.emitter as never);
});
afterEach(async () => {
  sub.onModuleDestroy();
  delete process.env.FINANCE_CHANGED_DEBOUNCE_MS;
  await w.ds.destroy();
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const events = () => w.emitter.sent.filter((e) => e.event === 'finance:changed');

describe('financeVersion', () => {
  it('changes when an order, a payment or a payout does, and not otherwise', async () => {
    const a = await financeVersion(w.ds.manager);
    expect(await financeVersion(w.ds.manager)).toEqual(a);
    const o = await w.ds.getRepository(Order).save(w.ds.getRepository(Order).create({ reference: 'SOM-1', customerId: 'c', customerName: 'C', status: 'pending' }));
    const b = await financeVersion(w.ds.manager);
    expect(b.version).not.toBe(a.version);
    await w.ds.getRepository(Order).update({ id: o.id }, { status: 'confirmed' });
    const c = await financeVersion(w.ds.manager);
    expect(c.version).not.toBe(b.version);
    await w.ds.getRepository(Payout).save(w.ds.getRepository(Payout).create({ reference: 'PO-1', sellerId: 'u', sellerName: 'S', amountUsd: 1, method: 'wallet' }));
    expect((await financeVersion(w.ds.manager)).version).not.toBe(c.version);
    expect(c.version).toMatch(/^[0-9a-f]{12}$/);
    expect(new Date(c.updatedAt).getTime()).toBeGreaterThan(0);
  });
});

describe('finance:changed', () => {
  it('goes to admin and admin_finance when an order, payment or payout is saved or updated — once for a burst', async () => {
    const orders = w.ds.getRepository(Order);
    const o = await orders.save(orders.create({ reference: 'SOM-1', customerId: 'c', customerName: 'C', status: 'pending' }));
    await orders.update({ id: o.id }, { status: 'confirmed' });
    await orders.createQueryBuilder().update(Order).set({ status: 'delivered' }).where('id = :id', { id: o.id }).execute(); // a conditional UPDATE, as the services use
    await wait(120);
    expect(events()).toHaveLength(1);
    expect(events()[0].to).toBe('admin,admin_finance');
    expect(events()[0].payload).toEqual(await financeVersion(w.ds.manager));
    await orders.update({ id: o.id }, { status: 'returned' });
    await wait(120);
    expect(events()).toHaveLength(2);
  });

  it('is silent for tables the finance figures do not depend on', async () => {
    await w.store('Shop', 'u1');
    await w.product((await w.ds.getRepository('Seller').find())[0] as never);
    await wait(120);
    expect(events()).toHaveLength(0);
  });
});
