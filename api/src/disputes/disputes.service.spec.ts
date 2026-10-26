import { DataSource } from 'typeorm';
import { DeliveryTask, Dispute, DisputeItem, DisputeMessage, Order, OrderItem, Seller } from '../database/entities';
import { recordingEmitter, testDb } from '../testing/test-db';
import { DisputesService } from './disputes.service';

const UP = 'http://x/uploads/00000000-0000-4000-8000-000000000001.png';

let ds: DataSource;
let emitter: ReturnType<typeof recordingEmitter>;
let notices: { to: string; title: string; body: string; type?: string; entityId?: string }[];
let settingsMap: Record<string, string | null>;
let restocks: { id: string; qty: number; opts: unknown }[];
let refundCalls: { orderId: string; amountUsd: number; toWallet: boolean; lines?: { orderItemId: string; usd: number }[] }[];
let outstanding: number;
let fullRefunds: { orderId: string; toWallet: boolean }[];
let pickups: unknown[];
let pickupAnswer: { id: string } | null;
let replacementsMade: unknown[];
let svc: DisputesService;

const customer = { id: 'c1', name: 'Marie Dubois', role: 'customer' };
const sellerOne = { id: 'su1', role: 'seller', name: 'Seller One' };
const sellerTwo = { id: 'su2', role: 'seller', name: 'Seller Two' };
const agent = { id: 'a1', role: 'admin_support', name: 'Agent' };
const admin = { id: 'a0', role: 'admin', name: 'Admin' };
const warehouse = { id: 'w1', role: 'warehouse_staff', name: 'Desk' };

let s1: Seller;
let s2: Seller;

async function makeOrder(lines: { sellerId: string; productId: string; qty: number; price: number; variant?: string }[], over: Partial<Order> = {}): Promise<Order> {
  const repo = ds.getRepository(Order);
  const subtotal = lines.reduce((t, l) => t + l.qty * l.price, 0);
  return repo.save(
    repo.create({
      reference: `SOM-${Math.floor(Math.random() * 1e8)}`,
      customerId: customer.id,
      customerName: customer.name,
      status: 'delivered',
      totalUsd: subtotal + 3,
      subtotalUsd: subtotal,
      deliveryFeeUsd: 3,
      items: lines.map((l) => ({ productId: l.productId, productName: l.productId.toUpperCase(), variant: l.variant ?? 'Default', qty: l.qty, priceUsd: l.price, sellerId: l.sellerId })) as OrderItem[],
      ...over,
    }),
  );
}

beforeEach(async () => {
  ds = await testDb();
  emitter = recordingEmitter();
  notices = [];
  settingsMap = {};
  restocks = [];
  refundCalls = [];
  fullRefunds = [];
  outstanding = 1000;
  pickups = [];
  pickupAnswer = { id: 'task-1' };
  replacementsMade = [];
  s1 = await ds.getRepository(Seller).save(ds.getRepository(Seller).create({ name: 'One', userId: sellerOne.id, status: 'approved' }));
  s2 = await ds.getRepository(Seller).save(ds.getRepository(Seller).create({ name: 'Two', userId: sellerTwo.id, status: 'approved' }));
  const record = (to: string) => async (...args: unknown[]) => {
    const n = args[args.length - 1] as { title: string; body: string; type?: string; entityId?: string };
    const target = args.length === 2 ? args[0] : '';
    for (const t of Array.isArray(target) ? target : [target]) notices.push({ to: `${to}${t}`, ...n });
  };
  const notifications = { toUser: record('user:'), toUsers: record('user:'), toRole: record('role:') };
  const payments = {
    refund: async (orderId: string, toWallet: boolean) => (fullRefunds.push({ orderId, toWallet }), { refundedUsd: outstanding }),
  };
  const refunds = {
    outstanding: async () => outstanding,
    refund: async (input: (typeof refundCalls)[number]) => (refundCalls.push(input), { refundedUsd: input.amountUsd, to: 'wallet' as const }),
  };
  const products = {
    getRaw: async () => null,
    idsBySeller: async () => [],
    restock: async (id: string, qty: number, opts: unknown) => void restocks.push({ id, qty, opts }),
  };
  const settings = { get: async (k: string) => settingsMap[k] ?? null };
  const logistics = { returnPickup: async (i: unknown) => (pickups.push(i), pickupAnswer) };
  const replacements = { createFromDispute: async (d: Dispute) => (replacementsMade.push(d.id), [{ reference: 'REP-1' }]) };
  svc = new DisputesService(
    ds.getRepository(Dispute),
    ds.getRepository(DisputeItem),
    ds.getRepository(DisputeMessage),
    ds.getRepository(Order),
    ds.getRepository(Seller),
    ds.getRepository(DeliveryTask),
    notifications as never,
    payments as never,
    refunds as never,
    products as never,
    settings as never,
    emitter as never,
    logistics as never,
    replacements as never,
  );
});
afterEach(async () => ds.destroy());

const titles = (to: string) => notices.filter((n) => n.to === to).map((n) => n.title);

describe('opening a return', () => {
  it('needs a delivered order, inside the return window', async () => {
    const pending = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 1, price: 10 }], { status: 'confirmed' });
    await expect(svc.open(customer, { orderId: pending.id, type: 'return', reason: 'Broken on arrival' })).rejects.toThrow('once the order has been delivered');
    const old = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 1, price: 10 }]);
    await ds.getRepository(Order).query('UPDATE orders SET updatedAt = ? WHERE id = ?', [new Date(Date.now() - 8 * 86_400_000).toISOString().replace('T', ' ').slice(0, 19), old.id]);
    await expect(svc.open(customer, { orderId: old.id, type: 'return', reason: 'Broken on arrival' })).rejects.toThrow('within 7 days');
    settingsMap.returnWindowDays = '30';
    await expect(svc.open(customer, { orderId: old.id, type: 'return', reason: 'Broken on arrival' })).resolves.toMatchObject({ type: 'return', stage: 'awaiting_seller' });
  });

  it('a window of 0 days closes returns', async () => {
    settingsMap.returnWindowDays = '0';
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 1, price: 10 }]);
    await expect(svc.open(customer, { orderId: o.id, type: 'return', reason: 'Broken on arrival' })).rejects.toThrow('not accepted');
  });

  it('is the order owner’s only, and wants a reason', async () => {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 1, price: 10 }]);
    await expect(svc.open({ id: 'x', name: 'X' }, { orderId: o.id, type: 'return', reason: 'Broken on arrival' })).rejects.toThrow('Order not found.');
    await expect(svc.open(customer, { orderId: o.id, type: 'return', reason: 'no' })).rejects.toThrow('Please describe');
  });

  it('records the lines and quantities, the photos, and gives the seller 48 hours', async () => {
    const o = await makeOrder([
      { sellerId: s1.id, productId: 'p1', qty: 3, price: 20 },
      { sellerId: s1.id, productId: 'p2', qty: 1, price: 5 },
    ]);
    const l1 = o.items.find((i) => i.productId === 'p1')!;
    const d = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead', category: 'defective', items: [{ itemId: l1.id, qty: 2 }], attachments: [UP] });
    expect(d.items).toHaveLength(1);
    expect(d.items[0]).toMatchObject({ orderItemId: l1.id, qty: 2, unitPriceUsd: 20 });
    expect(d.attachments).toEqual([UP]);
    expect(d.sellerId).toBe(s1.id);
    expect(Math.abs(d.sellerDueAt!.getTime() - Date.now() - 48 * 3_600_000)).toBeLessThan(5000);
    expect(d.canCancel).toBe(true);
    expect(d.canEscalate).toBe(false);
  });

  it('refuses photos that are not uploads, unknown categories and too many units', async () => {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 2, price: 20 }]);
    const l = o.items[0];
    await expect(svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead', attachments: ['https://evil.example/a.png'] })).rejects.toThrow('uploaded');
    await expect(svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead', category: 'nonsense' })).rejects.toThrow('from the list');
    await expect(svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead', items: [{ itemId: l.id, qty: 5 }] })).rejects.toThrow('at most 2');
    await expect(svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead', items: [{ itemId: 'nope', qty: 1 }] })).rejects.toThrow('not on this order');
  });

  it('never lets the same units be returned twice, and a refusal frees them', async () => {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 2, price: 20 }]);
    const l = o.items[0];
    const first = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead', items: [{ itemId: l.id, qty: 2 }] });
    await expect(svc.open(customer, { orderId: o.id, type: 'return', reason: 'Right cup is dead', items: [{ itemId: l.id, qty: 1 }] })).rejects.toThrow('open request');
    await expect(svc.open(customer, { orderId: o.id, type: 'return', reason: 'The whole thing please' })).rejects.toThrow('open request');
    await svc.cancel(customer, first.id);
    expect((await svc.eligibility(customer.id, o.id)).items[0].remaining).toBe(2);
    await expect(svc.open(customer, { orderId: o.id, type: 'return', reason: 'Right cup is dead', items: [{ itemId: l.id, qty: 1 }] })).resolves.toBeDefined();
  });

  it('with no lines named, returns everything that is left', async () => {
    const o = await makeOrder([
      { sellerId: s1.id, productId: 'p1', qty: 2, price: 20 },
      { sellerId: s1.id, productId: 'p2', qty: 1, price: 5 },
    ]);
    const d = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Not what I expected' });
    expect(d.items.map((i) => i.qty).sort()).toEqual([1, 2]);
  });

  it('makes one request per seller when the lines belong to two stores', async () => {
    const o = await makeOrder([
      { sellerId: s1.id, productId: 'p1', qty: 1, price: 20 },
      { sellerId: s2.id, productId: 'p9', qty: 1, price: 8 },
    ]);
    const d = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Not what I expected' });
    expect(d.siblings).toHaveLength(1);
    expect(await ds.getRepository(Dispute).count()).toBe(2);
    const mine = await svc.list(sellerOne);
    const theirs = await svc.list(sellerTwo);
    expect(mine).toHaveLength(1);
    expect(theirs).toHaveLength(1);
    expect(mine[0].id).not.toBe(theirs[0].id);
    expect(titles('user:su1')).toContain('Return requested on your order');
    expect(titles('user:su2')).toContain('Return requested on your order');
    expect(notices).toContainEqual(expect.objectContaining({ to: 'role:admin_support', title: 'Return requested' }));
  });

  it('tells the sellers, admin support and the warehouse stays out until it is approved', async () => {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 1, price: 20 }]);
    await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Not what I expected' });
    expect(emitter.sent.some((e) => e.event === 'dispute:created' && e.to === 'user:su1')).toBe(true);
    expect(emitter.sent.some((e) => e.event === 'dispute:created' && e.to.includes('warehouse_staff'))).toBe(true);
    expect(notices.some((n) => n.to === 'role:warehouse_staff')).toBe(false);
  });
});

describe('the seller’s answer', () => {
  async function opened(over: Partial<Parameters<DisputesService['open']>[1]> = {}) {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 2, price: 20 }]);
    const d = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead', ...over });
    return { o, d };
  }

  it('accepting asks logistics to collect the goods and tells the customer', async () => {
    const { o, d } = await opened();
    const done = await svc.sellerRespond(sellerOne, d.id, true, 'Sorry');
    expect(done.stage).toBe('pickup');
    expect(done.pickupTaskId).toBe('task-1');
    expect(pickups).toEqual([{ disputeId: d.id, orderId: o.id, items: [expect.objectContaining({ orderItemId: o.items[0].id, qty: 2 })] }]);
    expect(titles('user:c1')).toContain('Return accepted');
  });

  it('without a pickup task the request is approved and the warehouse is asked to collect by hand', async () => {
    pickupAnswer = null;
    const { d } = await opened();
    expect((await svc.sellerRespond(sellerOne, d.id, true, '')).stage).toBe('approved');
    expect(titles('role:warehouse_staff')).toContain('Return approved');
  });

  it('rejecting needs a reason and tells the customer why', async () => {
    const { d } = await opened();
    await expect(svc.sellerRespond(sellerOne, d.id, false, 'no')).rejects.toThrow('why you are rejecting');
    const done = await svc.sellerRespond(sellerOne, d.id, false, 'Used and dirty, cannot take it back');
    expect(done).toMatchObject({ stage: 'seller_rejected', canEscalate: true });
    expect(notices.find((n) => n.title === 'Return rejected')?.body).toContain('Used and dirty');
  });

  it('is for that store only, once', async () => {
    const { d } = await opened();
    await expect(svc.sellerRespond(sellerTwo, d.id, true, '')).rejects.toThrow('Dispute not found.');
    await expect(svc.sellerRespond({ id: 'c1', role: 'customer' }, d.id, true, '')).rejects.toThrow('Dispute not found.');
    await svc.sellerRespond(sellerOne, d.id, true, '');
    await expect(svc.sellerRespond(sellerOne, d.id, false, 'changed my mind')).rejects.toThrow('already handled');
  });

  it('two answers at the same moment: one wins', async () => {
    const { d } = await opened();
    const results = await Promise.allSettled([svc.sellerRespond(sellerOne, d.id, true, ''), svc.sellerRespond(sellerOne, d.id, false, 'second thoughts here')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(pickups.length).toBeLessThanOrEqual(1);
  });

  it('only returns have an accept / reject', async () => {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 1, price: 20 }]);
    const d = await svc.open(customer, { orderId: o.id, type: 'dispute', reason: 'Missing the charger', category: 'missing' });
    await expect(svc.sellerRespond(sellerOne, d.id, true, '')).rejects.toThrow('Only returns');
  });
});

describe('escalation, cancelling and the time limit', () => {
  async function rejected() {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 1, price: 20 }]);
    const d = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead' });
    await svc.sellerRespond(sellerOne, d.id, false, 'Cannot take it back, sorry');
    return d;
  }

  it('the customer escalates only after a rejection or a timeout, and support decides', async () => {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 1, price: 20 }]);
    const fresh = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead' });
    await expect(svc.escalate(customer, fresh.id)).rejects.toThrow('Wait for the seller');
    await svc.sellerRespond(sellerOne, fresh.id, false, 'Cannot take it back, sorry');
    await expect(svc.escalate({ id: 'other', role: 'customer' }, fresh.id)).rejects.toThrow('Dispute not found.');
    const esc = await svc.escalate(customer, fresh.id, 'Please look again');
    expect(esc.stage).toBe('escalated');
    expect((await svc.get(agent, fresh.id)).messages).toHaveLength(1);
    expect(titles('role:admin_support')).toContain('Return escalated');
    expect(titles('user:su1')).toContain('Return escalated');
    await expect(svc.escalate(customer, fresh.id)).rejects.toThrow();
  });

  it('support can approve or refuse; refusing needs a reason; sellers and customers cannot', async () => {
    const d = await rejected();
    await svc.escalate(customer, d.id);
    await expect(svc.adminDecideReturn(sellerOne, d.id, true, '')).rejects.toThrow('Admins only.');
    await expect(svc.adminDecideReturn(agent, d.id, false, '')).rejects.toThrow('reason');
    const approved = await svc.adminDecideReturn(agent, d.id, true, 'The seller was wrong');
    expect(approved.stage).toBe('pickup');
    expect(titles('user:c1')).toContain('Return approved');
    expect(titles('user:su1')).toContain('Return approved');
  });

  it('refusing closes the request and frees the units', async () => {
    const d = await rejected();
    await svc.escalate(customer, d.id);
    const closed = await svc.adminDecideReturn(agent, d.id, false, 'Hygiene items are final sale');
    expect(closed).toMatchObject({ status: 'rejected', stage: 'closed', resolution: 'Hygiene items are final sale' });
    expect(titles('user:c1')).toContain('Return closed');
    expect((await svc.eligibility(customer.id, d.orderId)).items[0].remaining).toBe(1);
  });

  it('the customer can cancel until the return is on its way, not after', async () => {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 1, price: 20 }]);
    const a = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead' });
    expect(await svc.cancel(customer, a.id)).toMatchObject({ status: 'rejected', stage: 'closed' });
    await expect(svc.cancel(customer, a.id)).rejects.toThrow();
    const b = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead' });
    await svc.sellerRespond(sellerOne, b.id, true, '');
    await expect(svc.cancel(customer, b.id)).rejects.toThrow('too late');
  });

  it('sweep moves overdue returns to seller_timeout and tells everyone, leaving the rest', async () => {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 2, price: 20 }, { sellerId: s1.id, productId: 'p2', qty: 1, price: 5 }]);
    const late = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead', items: [{ itemId: o.items[0].id, qty: 1 }] });
    const onTime = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Charger is dead', items: [{ itemId: o.items[1].id, qty: 1 }] });
    await ds.getRepository(Dispute).update({ id: late.id }, { sellerDueAt: new Date(Date.now() - 60_000) });
    expect(await svc.sweep()).toBe(1);
    expect(await svc.sweep()).toBe(0);
    expect((await svc.get(admin, late.id)).stage).toBe('seller_timeout');
    expect((await svc.get(admin, onTime.id)).stage).toBe('awaiting_seller');
    expect(titles('user:c1')).toContain('Seller did not respond');
    expect(titles('user:su1')).toContain('Seller did not respond');
    expect(titles('role:admin_support')).toContain('Seller did not respond');
    await expect(svc.sellerRespond(sellerOne, late.id, true, '')).rejects.toThrow('response time has passed');
    expect((await svc.get(customer, late.id)).canEscalate).toBe(true);
  });
});

describe('goods back, grading and the refund', () => {
  async function approved(lines = [{ sellerId: 's', productId: 'p1', qty: 3, price: 20 }, { sellerId: 's', productId: 'p2', qty: 1, price: 10 }], pick: { index: number; qty: number }[] = [{ index: 0, qty: 2 }]) {
    const o = await makeOrder(lines.map((l) => ({ ...l, sellerId: s1.id })), { discountUsd: 0 });
    const d = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead', items: pick.map((p) => ({ itemId: o.items[p.index].id, qty: p.qty })) });
    await svc.sellerRespond(sellerOne, d.id, true, '');
    return { o, d };
  }

  it('the returned items only are refunded, when the goods are scanned in', async () => {
    const { o, d } = await approved();
    const done = await svc.onReturnReceived(d.id);
    expect(refundCalls).toHaveLength(1);
    expect(refundCalls[0]).toMatchObject({ orderId: o.id, amountUsd: 40, toWallet: true });
    expect(refundCalls[0].lines).toEqual([{ orderItemId: o.items[0].id, usd: 40 }]);
    expect(done).toMatchObject({ status: 'resolved', outcome: 'return_refund', refundUsd: 40, stage: 'closed' });
    expect(done.receivedAt).toBeTruthy();
    expect(titles('user:c1')).toContain('Return received');
    expect(await ds.getRepository(Order).findOneBy({ id: o.id })).toMatchObject({ status: 'delivered' });
  });

  it('shares a promo discount across the lines, so a part-return never refunds more than was paid', async () => {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 2, price: 20 }, { sellerId: s1.id, productId: 'p2', qty: 1, price: 20 }], { discountUsd: 6 });
    const d = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead', items: [{ itemId: o.items.find((i) => i.productId === 'p1')!.id, qty: 2 }] });
    await svc.sellerRespond(sellerOne, d.id, true, '');
    await svc.onReturnReceived(d.id);
    // 40 of 60 subtotal: pays back 40 - 6 * 40/60 = 36
    expect(refundCalls[0].amountUsd).toBe(36);
  });

  it('never refunds more than is left on the payment', async () => {
    outstanding = 25;
    const { d } = await approved();
    await svc.onReturnReceived(d.id);
    expect(refundCalls[0].amountUsd).toBe(25);
    expect(refundCalls[0].lines![0].usd).toBe(25);
  });

  it('returning every unit makes the order returned', async () => {
    const { o, d } = await approved([{ sellerId: 's', productId: 'p1', qty: 2, price: 20 }], [{ index: 0, qty: 2 }]);
    await svc.onReturnReceived(d.id);
    expect((await ds.getRepository(Order).findOneBy({ id: o.id }))!.status).toBe('returned');
  });

  it('a refund that fails leaves the return received and tells finance', async () => {
    const { d } = await approved();
    const real = (svc as unknown as { refunds: { refund: unknown } }).refunds;
    real.refund = async () => {
      throw new Error('pawaPay is down');
    };
    const out = await svc.onReturnReceived(d.id);
    expect(out.status).toBe('open');
    expect(out.stage).toBe('received');
    expect(titles('role:admin_finance')).toContain('Return refund failed');
    // finance resolves it later, by hand
    real.refund = async (i: (typeof refundCalls)[number]) => (refundCalls.push(i), { refundedUsd: i.amountUsd, to: 'wallet' });
    expect((await svc.resolve(d.id, { refund: true }, true)).status).toBe('resolved');
  });

  it('the old desk button (restock) puts everything back as resellable and leaves the refund to finance', async () => {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 2, price: 20 }]);
    const d = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Not as described at all' });
    await expect(svc.resolve(d.id, { refund: true }, true)).rejects.toThrow('Mark the returned goods as received');
    await svc.markReceived(d.id, true);
    expect(restocks).toEqual([{ id: 'p1', qty: 2, opts: expect.objectContaining({ reason: 'return_restock' }) }]);
    expect(refundCalls).toHaveLength(0);
    await expect(svc.markReceived(d.id, true)).rejects.toThrow('already marked as received');
    await expect(svc.resolve(d.id, { refund: true }, false)).rejects.toThrow('Only admin or finance');
    expect(await svc.resolve(d.id, { refund: true }, true)).toMatchObject({ status: 'resolved', refundUsd: 40 });
  });

  it('grades the goods: only resellable units go back on the shelf, once', async () => {
    const { d } = await approved();
    await svc.onReturnReceived(d.id);
    const item = (await ds.getRepository(DisputeItem).find({ where: { disputeId: d.id } }))[0];
    await expect(svc.grade({ id: 'c1', role: 'customer' }, d.id, [{ itemId: item.id, condition: 'resellable' }])).rejects.toThrow('Warehouse staff only');
    await expect(svc.grade(warehouse, d.id, [{ itemId: item.id, condition: 'damaged', restockQty: 1 }])).rejects.toThrow('Only resellable');
    await expect(svc.grade(warehouse, d.id, [{ itemId: item.id, condition: 'resellable', restockQty: 5 }])).rejects.toThrow('between 0 and 2');
    await expect(svc.grade(warehouse, d.id, [{ itemId: 'zzz', condition: 'resellable' }])).rejects.toThrow('not part of this return');
    expect(restocks).toHaveLength(0);
    const out = await svc.grade(warehouse, d.id, [{ itemId: item.id, condition: 'resellable', restockQty: 1 }]);
    expect(out.items[0]).toMatchObject({ condition: 'resellable', restockedQty: 1 });
    expect(out.gradedAt).toBeTruthy();
    expect(restocks).toEqual([{ id: 'p1', qty: 1, opts: expect.objectContaining({ reason: 'return_restock', orderId: d.orderId }) }]);
    await expect(svc.grade(warehouse, d.id, [{ itemId: item.id, condition: 'resellable' }])).rejects.toThrow('already graded');
    expect(restocks).toHaveLength(1);
  });

  it('cannot be graded before the goods arrive', async () => {
    const { d } = await approved();
    await expect(svc.grade(warehouse, d.id, [{ itemId: 'x', condition: 'resellable' }])).rejects.toThrow('Receive the returned goods first');
  });
});

describe('disputes: the thread and support’s decision', () => {
  async function dispute(type: 'dispute' = 'dispute') {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 1, price: 20 }, { sellerId: s1.id, productId: 'p2', qty: 1, price: 10 }]);
    const d = await svc.open(customer, { orderId: o.id, type, reason: 'The charger never arrived', category: 'missing', items: [{ itemId: o.items[1].id, qty: 1 }], attachments: [UP] });
    return { o, d };
  }

  it('opens against the items, one open dispute per order', async () => {
    const { o, d } = await dispute();
    expect(d).toMatchObject({ type: 'dispute', category: 'missing', stage: 'awaiting_seller' });
    expect(d.items).toHaveLength(1);
    await expect(svc.open(customer, { orderId: o.id, type: 'dispute', reason: 'Another problem entirely' })).rejects.toThrow('open request');
    expect(titles('user:su1')).toContain('Dispute opened on your order');
    // A dispute is a matter for the seller and support: unlike a return, it is not sent to the warehouse.
    expect(emitter.sent.some((e) => e.event === 'dispute:created' && e.to.includes('warehouse_staff'))).toBe(false);
  });

  it('the seller replies with evidence; the stage moves; only parties can join', async () => {
    const { d } = await dispute();
    const msg = await svc.reply({ ...sellerOne }, d.id, 'Shipped Monday, see the label', [UP]);
    expect(msg).toMatchObject({ role: 'seller', attachments: [UP] });
    expect((await svc.get(sellerOne, d.id)).stage).toBe('seller_replied');
    await svc.reply({ ...customer, role: 'customer' }, d.id, 'The box was empty');
    expect(titles('user:c1')).toContain('Dispute reply');
    expect(titles('role:admin_support')).toContain('Dispute reply');
    await expect(svc.reply({ id: 'x', role: 'customer', name: 'X' }, d.id, 'Let me in')).rejects.toThrow('Dispute not found.');
    await expect(svc.reply({ ...sellerTwo }, d.id, 'Not my order at all')).rejects.toThrow('Dispute not found.');
    await expect(svc.reply({ ...sellerOne }, d.id, '')).rejects.toThrow('Write a message first');
    const view = await svc.get(sellerOne, d.id);
    expect(view.messages).toHaveLength(2);
    expect(view.messages![1].authorName).toBe('Marie'); // the customer shows by first name
    expect(view.messages![1].authorId).toBeNull(); // and without their account id
    expect(emitter.sent.filter((e) => e.to === 'user:su1' && e.event === 'dispute:message').every((e) => !JSON.stringify(e.payload).includes('"c1"'))).toBe(true);
    expect((await svc.get(agent, d.id)).messages![1].authorId).toBe('c1');
  });

  it('a seller sees the customer by first name, without the id; staff see the row whole', async () => {
    const { d } = await dispute();
    const seen = await svc.get(sellerOne, d.id);
    expect(seen).not.toHaveProperty('customerId');
    expect(seen.customerName).toBe('Marie');
    const [row] = await svc.list(sellerOne);
    expect(row).not.toHaveProperty('customerId');
    expect((await svc.get(agent, d.id)).customerId).toBe('c1');
    expect(emitter.sent.filter((e) => e.to === 'user:su1' && e.event === 'dispute:created').every((e) => !('customerId' in (e.payload as object)))).toBe(true);
    expect(emitter.sent.some((e) => e.to === 'user:c1' && 'customerId' in (e.payload as object))).toBe(true);
  });

  it('decide: a partial refund needs an amount, finance or admin, and never exceeds what is left', async () => {
    const { o, d } = await dispute();
    await expect(svc.decide(agent, d.id, { outcome: 'refund_partial', amountUsd: 5 }, false)).rejects.toThrow('Only admin or finance');
    await expect(svc.decide(admin, d.id, { outcome: 'refund_partial', amountUsd: 0 }, true)).rejects.toThrow('Enter the amount');
    await expect(svc.decide(admin, d.id, { outcome: 'banana' }, true)).rejects.toThrow('Outcome must be one of');
    const done = await svc.decide(admin, d.id, { outcome: 'refund_partial', amountUsd: 7.5, reason: 'The charger was missing' }, true);
    expect(refundCalls).toEqual([{ orderId: o.id, amountUsd: 7.5, toWallet: true, memo: `Refund for ${o.reference} (dispute)` }]);
    expect(done).toMatchObject({ status: 'resolved', outcome: 'refund_partial', refundUsd: 7.5, resolution: 'The charger was missing', stage: 'closed' });
    expect(titles('user:c1')).toContain('Dispute resolved');
    expect(titles('user:su1')).toContain('Dispute resolved');
    await expect(svc.decide(admin, d.id, { outcome: 'reject', reason: 'second thoughts' }, true)).rejects.toThrow('already handled');
  });

  it('decide: a full refund pays back what is outstanding; a replacement hands over to replacements; a refusal needs a reason', async () => {
    const a = await dispute();
    outstanding = 33;
    const full = await svc.decide(admin, a.d.id, { outcome: 'refund_full' }, true);
    expect(fullRefunds).toEqual([{ orderId: a.o.id, toWallet: true }]);
    expect(full).toMatchObject({ outcome: 'refund_full', refundUsd: 33, resolution: 'Refunded to wallet' });

    const b = await dispute();
    const rep = await svc.decide(agent, b.d.id, { outcome: 'replacement', reason: 'We send the right one' }, false);
    expect(replacementsMade).toEqual([b.d.id]);
    expect(rep).toMatchObject({ status: 'resolved', outcome: 'replacement' });

    const c = await dispute();
    await expect(svc.decide(agent, c.d.id, { outcome: 'reject', reason: '' }, false)).rejects.toThrow('reason');
    const rej = await svc.decide(agent, c.d.id, { outcome: 'reject', reason: 'Tracking shows it was signed for' }, false);
    expect(rej).toMatchObject({ status: 'rejected', outcome: 'reject' });
    expect(notices.find((n) => n.to === 'user:c1' && n.title === 'Dispute closed')?.body).toContain('Tracking shows');
  });

  it('returns are decided with returns:decide, not decide', async () => {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 1, price: 20 }]);
    const r = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead' });
    await expect(svc.decide(admin, r.id, { outcome: 'reject', reason: 'because' }, true)).rejects.toThrow('returns:decide');
  });
});

describe('who sees what', () => {
  it('lists: customers their own, sellers their store’s, the warehouse the returns, admins all', async () => {
    const o1 = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 1, price: 20 }]);
    const o2 = await makeOrder([{ sellerId: s2.id, productId: 'p2', qty: 1, price: 20 }]);
    await svc.open(customer, { orderId: o1.id, type: 'return', reason: 'Left cup is dead' });
    await svc.open(customer, { orderId: o2.id, type: 'dispute', reason: 'Wrong colour was sent' });
    expect(await svc.list(customer)).toHaveLength(2);
    expect(await svc.list({ id: 'someone', role: 'customer' })).toHaveLength(0);
    expect(await svc.list(sellerOne)).toHaveLength(1);
    expect(await svc.list(sellerTwo)).toHaveLength(1);
    expect(await svc.list(warehouse)).toHaveLength(1);
    expect(await svc.list(agent)).toHaveLength(2);
    expect(await svc.list(agent, { type: 'dispute' })).toHaveLength(1);
    expect(await svc.list(agent, { status: 'resolved' })).toHaveLength(0);
  });

  it('a dispute that names no lines on a two-store order is visible to both stores', async () => {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 1, price: 20 }, { sellerId: s2.id, productId: 'p2', qty: 1, price: 20 }]);
    const d = await svc.open(customer, { orderId: o.id, type: 'dispute', reason: 'Parcel arrived crushed' });
    expect(d.sellerId).toBeNull();
    expect(await svc.list(sellerOne)).toHaveLength(1);
    expect(await svc.list(sellerTwo)).toHaveLength(1);
    expect(titles('user:su1')).toContain('Dispute opened on your order');
    expect(titles('user:su2')).toContain('Dispute opened on your order');
  });

  it('eligibility shows the window, the lines and what is left', async () => {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 3, price: 20 }]);
    expect(await svc.eligibility(customer.id, o.id)).toMatchObject({ eligible: true, windowDays: 7, items: [{ qty: 3, remaining: 3, unitPriceUsd: 20 }] });
    await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead', items: [{ itemId: o.items[0].id, qty: 3 }] });
    expect(await svc.eligibility(customer.id, o.id)).toMatchObject({ eligible: false, reason: 'You already have an open request for this order.' });
    await expect(svc.eligibility('other', o.id)).rejects.toThrow('Order not found.');
  });
});
