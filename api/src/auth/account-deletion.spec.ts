import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { CartLine, DeliveryTask, Dispute, Exchange, Order, Payment, Payout, Product, Replacement, Review, StoreFollow, SupportTicket, User, WishlistItem } from '../database/entities';
import { testDb } from '../testing/test-db';
import { UsersService } from '../users/users.service';
import { AccountDeletionBlockedException, AccountDeletionService, DELETED_NAME, placeOnly } from './account-deletion.service';
import { AuthService } from './auth.service';

/**
 * Deleting a customer account (audit C-04). Before the fix a customer with $204 in the wallet and a paid order on the
 * road could delete the account with only a password: the money was stranded and the order kept the name and address.
 */
let ds: DataSource;
let users: UsersService;
let auth: AuthService;
let seq = 0;

const PASSWORD = 'Password-123';
const config = { get: (k: string) => (k === 'jwt.secret' ? 'access-secret' : k === 'jwt.refreshSecret' ? 'refresh-secret' : '15m') };
const ADDRESS = JSON.stringify({
  label: 'Home',
  line1: '12 avenue de la Paix',
  line2: 'Appartement 4',
  city: 'Kinshasa',
  commune: 'Gombe',
  region: 'Kinshasa',
  country: 'République démocratique du Congo',
  areaId: 'area-gombe',
  phone: '+243 81 222 3333',
  name: 'Marie Dubois',
  note: 'Ring twice',
  geo: { lat: -4.3, lng: 15.3, formatted: '12 avenue de la Paix, Gombe' },
  components: [{ long_name: 'Gombe' }],
});

async function customer(walletBalance = 0) {
  const u = await users.create({ email: `c${++seq}@x.test`, passwordHash: await bcrypt.hash(PASSWORD, 4), name: 'Marie Dubois', role: 'customer', phone: '+243 81 222 3333' });
  u.walletBalance = walletBalance;
  return users.save(u);
}
const order = (customerId: string, status: Order['status'], extra: Partial<Order> = {}) =>
  ds.getRepository(Order).save(ds.getRepository(Order).create({ reference: `SOM-${++seq}`, customerId, customerName: 'Marie Dubois', status, shippingAddress: ADDRESS, totalUsd: 40, ...extra }));
const row = (id: string) => ds.getRepository(User).findOneByOrFail({ id });

beforeEach(async () => {
  ds = await testDb();
  users = new UsersService(ds.getRepository(User));
  auth = new AuthService(users, new JwtService({}), config as never, new AccountDeletionService(ds));
});
afterEach(() => ds.destroy());

/** The refusal, as the app receives it: a message naming the reason, the code and the structured list. */
async function refusal(id: string, password = PASSWORD) {
  const err = await auth.deleteAccount(id, password).then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AccountDeletionBlockedException);
  return err as AccountDeletionBlockedException;
}
const stillThere = async (id: string) => expect(await row(id)).toMatchObject({ active: true, name: 'Marie Dubois' });

describe('deleting an account is refused while something is outstanding', () => {
  it('money in the wallet: names the amount and what to do; nothing is erased', async () => {
    const u = await customer(204);
    const e = await refusal(u.id);
    expect(e.code).toBe('account_blocked');
    expect(e.blockers).toEqual([{ kind: 'wallet_balance', count: 1, amountUsd: 204 }]);
    expect(e.message).toContain('Your wallet still holds $204.00: spend it or ask support to pay it out first.');
    await stillThere(u.id);
    expect((await row(u.id)).walletBalance).toBe(204);
  });

  it.each(['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery'] as const)('an order that is %s', async (status) => {
    const u = await customer();
    await order(u.id, status);
    const e = await refusal(u.id);
    expect(e.blockers).toEqual([{ kind: 'open_order', count: 1 }]);
    expect(e.message).toContain('1 order that is not finished yet');
    await stillThere(u.id);
  });

  it('the paid, in-transit order of the audit: wallet money AND the order are both named', async () => {
    const u = await customer(204.69);
    await order(u.id, 'confirmed', { paymentMethod: 'wallet' });
    const e = await refusal(u.id);
    expect(e.blockers.map((b) => b.kind)).toEqual(['wallet_balance', 'open_order']);
    expect(e.message).toContain('$204.69');
    await stillThere(u.id);
  });

  it('an open return, exchange or replacement request', async () => {
    const u = await customer();
    const o = await order(u.id, 'delivered');
    await ds.getRepository(Dispute).save(ds.getRepository(Dispute).create({ reference: 'RET-1', orderId: o.id, orderReference: o.reference, customerId: u.id, customerName: 'Marie Dubois', type: 'return', reason: 'Too small', status: 'open', stage: 'approved' }));
    let e = await refusal(u.id);
    expect(e.blockers).toEqual([{ kind: 'open_return', count: 1 }]);
    await stillThere(u.id);

    await ds.getRepository(Dispute).update({ reference: 'RET-1' }, { status: 'resolved', stage: 'closed' });
    await ds.getRepository(Exchange).save(
      ds.getRepository(Exchange).create({ reference: 'EXC-1', orderId: o.id, orderReference: o.reference, customerId: u.id, customerName: 'Marie Dubois', fromSku: 'a', fromName: 'A', toSku: 'b', toName: 'B', status: 'approved' } as never),
    );
    e = await refusal(u.id);
    expect(e.blockers).toEqual([{ kind: 'open_return', count: 1 }]);

    await ds.getRepository(Exchange).update({ reference: 'EXC-1' }, { status: 'delivered' });
    await ds.getRepository(Replacement).save(
      ds.getRepository(Replacement).create({ reference: 'REP-1', orderId: o.id, orderReference: o.reference, customerId: u.id, customerName: 'Marie Dubois', sku: 's', productName: 'P', status: 'dispatched' }),
    );
    e = await refusal(u.id);
    expect(e.blockers).toEqual([{ kind: 'open_return', count: 1 }]);
  });

  it('an open dispute about an order', async () => {
    const u = await customer();
    const o = await order(u.id, 'delivered');
    await ds.getRepository(Dispute).save(ds.getRepository(Dispute).create({ reference: 'DIS-1', orderId: o.id, orderReference: o.reference, customerId: u.id, customerName: 'Marie Dubois', type: 'dispute', category: 'damaged', reason: 'Broken', status: 'open', stage: 'awaiting_seller' }));
    const e = await refusal(u.id);
    expect(e.blockers).toEqual([{ kind: 'open_dispute', count: 1 }]);
    expect(e.message).toContain('1 open dispute about an order');
    await stillThere(u.id);
  });

  it('an open support ticket about an order (a general ticket does not block)', async () => {
    const u = await customer();
    const tickets = ds.getRepository(SupportTicket);
    await tickets.save(tickets.create({ reference: 'T-1', userId: u.id, userName: 'Marie Dubois', subject: 'How do I pay?', status: 'open' }));
    await expect(auth.deleteAccount(u.id, PASSWORD)).resolves.toBeUndefined();
    // a fresh account, this time with a ticket about the order
    const v = await customer();
    const o2 = await order(v.id, 'delivered');
    await tickets.save(tickets.create({ reference: 'T-2', userId: v.id, userName: 'Marie Dubois', subject: 'Where is it?', orderId: o2.id, status: 'pending' }));
    const e = await refusal(v.id);
    expect(e.blockers).toEqual([{ kind: 'open_ticket', count: 1 }]);
    await tickets.update({ reference: 'T-2' }, { status: 'resolved' });
    await expect(auth.deleteAccount(v.id, PASSWORD)).resolves.toBeUndefined();
  });

  it('a pending payout, a refund still on its way to the phone, a pending wallet top-up', async () => {
    const u = await customer();
    await ds.getRepository(Payout).save(ds.getRepository(Payout).create({ reference: 'PO-1', sellerId: u.id, sellerName: 'M', amountUsd: 5, status: 'requested' }));
    expect((await refusal(u.id)).blockers).toEqual([{ kind: 'pending_payout', count: 1 }]);
    await ds.getRepository(Payout).update({ reference: 'PO-1' }, { status: 'paid' });

    const pay = ds.getRepository(Payment);
    await pay.save(pay.create({ reference: 'PAY-1', purpose: 'order', userId: u.id, method: 'airtel_money', amountUsd: 9, status: 'refunded', refundTo: 'phone', refundStatus: 'sending' }));
    expect((await refusal(u.id)).blockers).toEqual([{ kind: 'pending_refund', count: 1 }]);
    await pay.update({ reference: 'PAY-1' }, { refundStatus: 'completed' });

    await pay.save(pay.create({ reference: 'PAY-2', purpose: 'topup', userId: u.id, method: 'airtel_money', amountUsd: 20, status: 'pending' }));
    const e = await refusal(u.id);
    expect(e.blockers).toEqual([{ kind: 'pending_topup', count: 1 }]);
    expect(e.message).toContain('A wallet top-up is still waiting for your approval');
    await stillThere(u.id);
  });

  it('a wrong password is still "Password is incorrect." (the reasons are shown to the signed-in owner only after the password)', async () => {
    const u = await customer(5);
    await expect(auth.deleteAccount(u.id, 'nope')).rejects.toThrow('Password is incorrect.');
  });

  it('the check is read-only and lists the same reasons', async () => {
    const u = await customer(12.5);
    await order(u.id, 'shipped');
    expect(await auth.deletionBlockers(u.id)).toEqual([
      { kind: 'wallet_balance', count: 1, amountUsd: 12.5 },
      { kind: 'open_order', count: 1 },
    ]);
    await stillThere(u.id);
  });
});

describe('deleting an account with nothing outstanding', () => {
  it('goes through: the login is destroyed and every session is revoked', async () => {
    const u = await customer(0);
    await order(u.id, 'delivered');
    await order(u.id, 'cancelled');
    await order(u.id, 'returned');
    const before = (await row(u.id)).tokenVersion;
    await expect(auth.deleteAccount(u.id, PASSWORD)).resolves.toBeUndefined();
    const after = await row(u.id);
    expect(after).toMatchObject({ active: false, name: DELETED_NAME, phone: null, address: null, emailVerified: false });
    expect(after.email).toBe(`deleted+${u.id}@deleted.invalid`);
    expect(after.tokenVersion).toBe(before + 1); // refresh and access tokens carry the old version
    await expect(auth.refresh(await tokenOf(u.id, before))).rejects.toThrow();
  });

  it('anonymises the personal data on the past orders and keeps them usable', async () => {
    const u = await customer();
    const other = await customer();
    const o = await order(u.id, 'delivered', { paymentMethod: 'wallet', totalUsd: 55.5 });
    const keep = await order(other.id, 'delivered');
    const tasks = ds.getRepository(DeliveryTask);
    const leg = await tasks.save(tasks.create({ orderId: o.id, orderReference: o.reference, kind: 'delivery', status: 'delivered', address: ADDRESS }));
    const ret = await tasks.save(tasks.create({ orderId: o.id, orderReference: o.reference, kind: 'return_pickup', status: 'delivered', address: ADDRESS, pickupAddress: ADDRESS }));
    const pickup = await tasks.save(tasks.create({ orderId: o.id, orderReference: o.reference, kind: 'pickup', status: 'delivered', pickupAddress: 'Seller depot, 5 rue du Commerce' }));
    const disputes = ds.getRepository(Dispute);
    await disputes.save(disputes.create({ reference: 'DIS-9', orderId: o.id, orderReference: o.reference, customerId: u.id, customerName: 'Marie Dubois', type: 'dispute', reason: 'x', status: 'resolved', stage: 'closed' }));
    const pay = ds.getRepository(Payment);
    await pay.save(pay.create({ reference: 'PAY-9', purpose: 'order', orderId: o.id, userId: u.id, method: 'airtel_money', amountUsd: 55.5, status: 'succeeded', phone: '+243 81 222 3333' }));
    await ds.getRepository(Review).save(ds.getRepository(Review).create({ productId: 'p1', userId: u.id, author: 'Marie Dubois', rating: 5, text: 'Great' } as never));
    await ds.getRepository(WishlistItem).save(ds.getRepository(WishlistItem).create({ userId: u.id, productId: 'p1' } as never));
    await ds.getRepository(StoreFollow).save(ds.getRepository(StoreFollow).create({ userId: u.id, sellerId: 's1' } as never));

    await auth.deleteAccount(u.id, PASSWORD);

    const o2 = await ds.getRepository(Order).findOneByOrFail({ id: o.id });
    expect(o2.customerName).toBe(DELETED_NAME);
    // the order itself stays whole for the seller, the rider and accounting
    expect(o2).toMatchObject({ reference: o.reference, customerId: u.id, status: 'delivered', paymentMethod: 'wallet', totalUsd: 55.5 });
    // only the place stays in the address
    expect(JSON.parse(o2.shippingAddress!)).toEqual({ areaId: 'area-gombe', commune: 'Gombe', city: 'Kinshasa', region: 'Kinshasa', country: 'République démocratique du Congo' });
    const raw = JSON.stringify(await ds.query('SELECT * FROM orders WHERE id = ?', [o.id]));
    expect(raw).not.toMatch(/Marie|Dubois|avenue|Appartement|222 3333|Ring twice|formatted/);
    // the legs to the customer's door lose the personal parts; the seller's pickup leg is untouched
    expect(JSON.parse((await tasks.findOneByOrFail({ id: leg.id })).address!)).toMatchObject({ city: 'Kinshasa' });
    expect((await tasks.findOneByOrFail({ id: leg.id })).address).not.toContain('Paix');
    const r = await tasks.findOneByOrFail({ id: ret.id });
    expect(`${r.address}${r.pickupAddress}`).not.toMatch(/Paix|222 3333|Marie/);
    expect((await tasks.findOneByOrFail({ id: pickup.id })).pickupAddress).toBe('Seller depot, 5 rue du Commerce');
    expect((await disputes.findOneByOrFail({ reference: 'DIS-9' })).customerName).toBe(DELETED_NAME);
    expect((await pay.findOneByOrFail({ reference: 'PAY-9' })).phone).toBeNull();
    expect((await ds.getRepository(Review).find())[0].author).toBe(DELETED_NAME);
    expect(await ds.getRepository(WishlistItem).count({ where: { userId: u.id } })).toBe(0);
    expect(await ds.getRepository(StoreFollow).count({ where: { userId: u.id } })).toBe(0);
    expect(await ds.getRepository(CartLine).count({ where: { userId: u.id } })).toBe(0);
    // somebody else's order is not touched
    expect(await ds.getRepository(Order).findOneByOrFail({ id: keep.id })).toMatchObject({ customerName: 'Marie Dubois', shippingAddress: ADDRESS });
  });

  it('an order that lands between the check and the write still stops it, and nothing is half done', async () => {
    const u = await customer();
    const svc = new AccountDeletionService(ds);
    const real = svc.blockers.bind(svc);
    let calls = 0;
    // the first look (assertCanDelete) finds nothing, then an order appears before the transaction re-checks
    jest.spyOn(svc, 'blockers').mockImplementation(async (id, m) => {
      if (calls++ === 0) return [];
      return real(id, m);
    });
    const racing = new AuthService(users, new JwtService({}), config as never, svc);
    await order(u.id, 'processing');
    await expect(racing.deleteAccount(u.id, PASSWORD)).rejects.toBeInstanceOf(AccountDeletionBlockedException);
    await stillThere(u.id);
  });
});

describe('placeOnly', () => {
  it('keeps the place, drops the person, tolerates free text and nothing', () => {
    expect(placeOnly(null)).toBeNull();
    expect(placeOnly('12 avenue de la Paix, Gombe')).toBeNull();
    expect(placeOnly(JSON.stringify({ line1: '1 rue', phone: '+243', name: 'Z' }))).toBeNull();
    expect(JSON.parse(placeOnly(JSON.stringify({ line1: '1 rue', city: 'Kinshasa' }))!)).toEqual({ city: 'Kinshasa' });
  });
});

async function tokenOf(id: string, tokenVersion: number) {
  const jwt = new JwtService({});
  return jwt.signAsync({ sub: id, role: 'customer', email: 'x', tokenVersion, typ: 'refresh' }, { secret: 'refresh-secret' });
}
