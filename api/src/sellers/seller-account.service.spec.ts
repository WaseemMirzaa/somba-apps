import { DataSource, DeepPartial } from 'typeorm';
import { Order, OrderItem, Payout, Seller, SellerTeamMember, User } from '../database/entities';
import { addProduct, recordingEmitter, testDb } from '../testing/test-db';
import { UsersService } from '../users/users.service';
import { DELETED_REASON, SellerAccountService } from './seller-account.service';
import { SellerContextService } from './seller-context';
import { TeamDirectory } from './team-directory';
import { TeamService } from './team.service';

let ds: DataSource;
let svc: SellerAccountService;
let ctxSvc: SellerContextService;
let team: TeamService;
let available: number;
let closed: { id: string; status: string; reason?: string }[];

async function user(name: string): Promise<User> {
  return new UsersService(ds.getRepository(User)).create({ email: `${name}@x.test`, passwordHash: 'x', name, role: 'seller' });
}
async function store(owner: User) {
  const repo = ds.getRepository(Seller);
  return repo.save(repo.create({ name: `${owner.name} store`, userId: owner.id, status: 'approved' }));
}
const ownerCtx = (o: User) => ctxSvc.resolve({ id: o.id, role: 'seller', name: o.name }, 'team');
async function sale(seller: Seller, orderStatus: Order['status'], fulfilment: OrderItem['fulfilment'] = 'open') {
  const p = await addProduct(ds, { sellerId: seller.id });
  const orders = ds.getRepository(Order);
  const o = await orders.save(orders.create({ reference: `R${Math.random().toString(36).slice(2, 8)}`, customerId: 'c', customerName: 'c', status: orderStatus, paymentMethod: 'cod', subtotalUsd: 1, totalUsd: 1 } as DeepPartial<Order>));
  const items = ds.getRepository(OrderItem);
  await items.save(items.create({ orderId: o.id, productId: p.id, productName: 'P', qty: 1, priceUsd: 1, sellerId: seller.id, fulfilment } as DeepPartial<OrderItem>));
  return o;
}

beforeEach(async () => {
  ds = await testDb();
  available = 0;
  closed = [];
  const dir = new TeamDirectory(ds.getRepository(SellerTeamMember), ds.getRepository(Seller));
  ctxSvc = new SellerContextService(ds.getRepository(Seller), ds.getRepository(SellerTeamMember), ds.getRepository(User), { get: async () => null } as never);
  team = new TeamService(
    ds.getRepository(SellerTeamMember),
    ds.getRepository(Seller),
    ds.getRepository(User),
    new UsersService(ds.getRepository(User)),
    { toUser: async () => undefined } as never,
    { sendEmail: async () => true } as never,
    recordingEmitter() as never,
    dir,
    { planOf: async () => ({ id: 'free', name: 'Free' }) } as never,
  );
  svc = new SellerAccountService(
    ds.getRepository(OrderItem),
    ds.getRepository(Payout),
    ds.getRepository(Seller),
    ctxSvc,
    team,
    { setStatus: async (id: string, status: string, reason?: string) => (closed.push({ id, status, reason }), ds.getRepository(Seller).update({ id }, { status: status as never })) } as never,
    { available: async () => ({ available }) } as never,
  );
});
afterEach(() => ds.destroy());

describe('deleting a seller account', () => {
  it('an owner with nothing pending may delete; finishing closes the store and ends the staff seats', async () => {
    const owner = await user('owner');
    const s = await store(owner);
    await expect(svc.check(owner)).resolves.toBeUndefined();
    await svc.finish(owner);
    expect(closed).toEqual([{ id: s.id, status: 'suspended', reason: DELETED_REASON }]);
  });

  it('is refused while orders are in flight (counted per order), but cancelled lines and finished orders do not count', async () => {
    const owner = await user('owner');
    const s = await store(owner);
    await sale(s, 'delivered');
    await sale(s, 'cancelled');
    await sale(s, 'confirmed', 'cancelled');
    await expect(svc.check(owner)).resolves.toBeUndefined();
    await sale(s, 'processing');
    await sale(s, 'out_for_delivery');
    await expect(svc.check(owner)).rejects.toThrow('You still have 2 orders in progress. Finish or cancel them before deleting your account.');
  });

  it('says "order" and "it" for exactly one', async () => {
    const owner = await user('owner');
    const s = await store(owner);
    await sale(s, 'shipped');
    await expect(svc.check(owner)).rejects.toThrow('You still have 1 order in progress. Finish or cancel it before deleting your account.');
  });

  it('is refused while a payout is being processed', async () => {
    const owner = await user('owner');
    await store(owner);
    const payouts = ds.getRepository(Payout);
    await payouts.save(payouts.create({ reference: 'PO-1', sellerId: owner.id, sellerName: 'x', amountUsd: 20, method: 'wallet', status: 'approved' } as never));
    await expect(svc.check(owner)).rejects.toThrow(/payout is still being processed/);
    await payouts.update({ reference: 'PO-1' }, { status: 'paid' });
    await expect(svc.check(owner)).resolves.toBeUndefined();
  });

  it('is refused while earnings are unpaid', async () => {
    const owner = await user('owner');
    await store(owner);
    available = 12.5;
    await expect(svc.check(owner)).rejects.toThrow('You still have $12.50 to withdraw. Request a payout first, then delete your account.');
    available = 0.004;
    await expect(svc.check(owner)).resolves.toBeUndefined();
  });

  it('a team member is never blocked, and simply leaves the team', async () => {
    const owner = await user('owner');
    const s = await store(owner);
    await sale(s, 'processing');
    available = 99;
    const w = await user('worker');
    const invite = await team.invite(await ownerCtx(owner), { email: w.email, role: 'orders' });
    await team.accept({ id: w.id, role: 'seller', name: w.name }, invite.devToken);
    await expect(svc.check(w)).resolves.toBeUndefined();
    await svc.finish(w);
    expect((await ds.getRepository(SellerTeamMember).findOneByOrFail({ userId: w.id })).status).toBe('removed');
    expect(closed).toEqual([]); // the store stays open
  });

  it('closing the owner\'s store ends every seat, invited or active', async () => {
    const owner = await user('owner');
    const s = await store(owner);
    const w = await user('worker');
    const a = await team.invite(await ownerCtx(owner), { email: w.email, role: 'orders' });
    await team.accept({ id: w.id, role: 'seller', name: w.name }, a.devToken);
    await team.invite(await ownerCtx(owner), { email: 'later@x.test', role: 'support' });
    await svc.finish(owner);
    const rows = await ds.getRepository(SellerTeamMember).find();
    expect(rows.map((r) => r.status)).toEqual(['removed', 'removed']);
  });

  it('an account with no store has nothing to close', async () => {
    const lone = await user('lone');
    await expect(svc.check(lone)).resolves.toBeUndefined();
    await expect(svc.finish(lone)).resolves.toBeUndefined();
    expect(closed).toEqual([]);
  });

  it('an already suspended store is not suspended again', async () => {
    const owner = await user('owner');
    const s = await store(owner);
    await ds.getRepository(Seller).update({ id: s.id }, { status: 'suspended' });
    await svc.finish(owner);
    expect(closed).toEqual([]);
  });
});
