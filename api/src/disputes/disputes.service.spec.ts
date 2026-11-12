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
let refundCalls: { orderId: string; amountUsd: number; toWallet: boolean; memo?: string; lines?: { orderItemId: string; usd: number }[]; source?: { kind: string; disputeId: string; disputeReference: string } }[];
let outstanding: number;
let fullRefunds: { orderId: string; toWallet: boolean; source?: unknown }[];
let pickups: unknown[];
let pickupAnswer: { id: string } | null;
let replacementsMade: unknown[];
let svc: DisputesService;

const customer = { id: 'c1', name: 'Marie Dubois', role: 'customer' };
const sellerOne = { id: 'su1', role: 'seller', name: 'Seller One' };
const sellerTwo = { id: 'su2', role: 'seller', name: 'Seller Two' };
const agent = { id: 'a1', role: 'admin_support', name: 'Agent' };
const admin = { id: 'a0', role: 'admin', name: 'Admin' };
const warehouse = { id: 'w1', role: 'warehouse_staff', name: 'Desk', hubId: 'hub-k' };
const otherWarehouse = { id: 'w2', role: 'warehouse_staff', name: 'Other desk', hubId: 'hub-l' };
const unlinkedStaff = { id: 'w3', role: 'warehouse_staff', name: 'Nowhere', hubId: null };

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
      destinationHubId: 'hub-k',
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
    refund: async (orderId: string, toWallet: boolean, source?: unknown) => (fullRefunds.push({ orderId, toWallet, source }), { refund: { amountUsd: outstanding } }),
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
    await expect(svc.open(customer, { orderId: old.id, type: 'return', reason: 'Broken on arrival' })).resolves.toMatchObject({ type: 'return', stage: 'awaiting_support' });
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

  it('records the lines and quantities, the photos, and gives support 48 hours', async () => {
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
    // each store's goods are their own request (so they go back to the right store), and both wait for support
    const all = await svc.list(agent);
    expect(all.map((r) => r.sellerId).sort()).toEqual([s1.id, s2.id].sort());
    expect(all.every((r) => r.stage === 'awaiting_support')).toBe(true);
    // the stores take no part: they see nothing and are told nothing
    expect(await svc.list(sellerOne)).toEqual([]);
    expect(await svc.list(sellerTwo)).toEqual([]);
    expect(notices.filter((n) => n.to.startsWith('user:su'))).toEqual([]);
    expect(notices.filter((n) => n.to === 'role:admin_support' && n.title === 'Return requested')).toHaveLength(2);
  });

  it('tells admin support (never the seller) and the warehouse stays out until it is approved', async () => {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 1, price: 20 }]);
    await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Not what I expected' });
    expect(emitter.sent.some((e) => e.event === 'dispute:created' && e.to === 'user:su1')).toBe(false);
    expect(emitter.sent.some((e) => e.event === 'dispute:created' && e.to.includes('admin_support'))).toBe(true);
    // The return goes to the staff of the warehouse it belongs to, and to no other warehouse's.
    expect(emitter.sent.some((e) => e.event === 'dispute:created' && e.to === 'hub:hub-k')).toBe(true);
    expect(emitter.sent.some((e) => e.event === 'dispute:created' && e.to.includes('warehouse_staff'))).toBe(false);
    expect(emitter.sent.some((e) => e.event === 'dispute:created' && e.to === 'hub:hub-l')).toBe(false);
    expect(notices.some((n) => n.to === 'role:warehouse_staff')).toBe(false);
  });
});

describe('support decides a return', () => {
  async function opened(over: Partial<Parameters<DisputesService['open']>[1]> = {}) {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 2, price: 20 }]);
    const d = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead', ...over });
    return { o, d };
  }

  it('every return starts with support, and support approving asks logistics to collect the goods and tells the customer', async () => {
    const { o, d } = await opened();
    expect(d.stage).toBe('awaiting_support');
    const done = await svc.adminDecideReturn(agent, d.id, true, 'Looks justified');
    expect(done.stage).toBe('pickup');
    expect(done.pickupTaskId).toBe('task-1');
    expect(pickups).toEqual([{ disputeId: d.id, orderId: o.id, items: [expect.objectContaining({ orderItemId: o.items[0].id, qty: 2 })] }]);
    expect(notices.find((n) => n.to === 'user:c1' && n.title === 'Return approved')?.body).toContain('Looks justified');
    // the seller is told nothing: the goods coming back reach them as a delivery leg
    expect(notices.filter((n) => n.to === 'user:su1')).toEqual([]);
  });

  it('every desk role and the super admin can approve (finance and operations too); other departments cannot', async () => {
    for (const who of [admin, agent, { id: 'f1', role: 'admin_finance', name: 'F' }, { id: 'o1', role: 'admin_operations', name: 'O' }]) {
      const { d } = await opened();
      await expect(svc.adminDecideReturn(who, d.id, true, '')).resolves.toMatchObject({ stage: 'pickup' });
      await ds.getRepository(Dispute).delete({ id: d.id }); // free the units for the next case
    }
    const { d } = await opened();
    for (const role of ['admin_marketing', 'admin_moderation']) await expect(svc.adminDecideReturn({ id: 'x', role, name: 'X' }, d.id, true, '')).rejects.toThrow('Not allowed.');
  });

  it('without a pickup task the request is approved and the warehouse is asked to collect by hand', async () => {
    pickupAnswer = null;
    const { d } = await opened();
    expect((await svc.adminDecideReturn(agent, d.id, true, '')).stage).toBe('approved');
    expect(titles('role:warehouse_staff')).toContain('Return approved');
  });

  it('refusing needs a reason, closes the request, frees the units and tells the customer why', async () => {
    const { d } = await opened();
    await expect(svc.adminDecideReturn(agent, d.id, false, '')).rejects.toThrow('reason');
    await expect(svc.adminDecideReturn(agent, d.id, false, 'no')).rejects.toThrow('reason');
    const closed = await svc.adminDecideReturn(agent, d.id, false, 'Hygiene items are final sale');
    expect(closed).toMatchObject({ status: 'rejected', stage: 'closed', resolution: 'Hygiene items are final sale' });
    expect(notices.find((n) => n.to === 'user:c1' && n.title === 'Return closed')?.body).toContain('Hygiene items');
    expect((await svc.eligibility(customer.id, d.orderId)).items[0].remaining).toBe(2);
    expect(notices.filter((n) => n.to === 'user:su1')).toEqual([]);
  });

  it('sellers and customers cannot decide; a request is decided once; two decisions at the same moment: one wins', async () => {
    const { d } = await opened();
    await expect(svc.adminDecideReturn(sellerOne, d.id, true, '')).rejects.toThrow('Admins only.');
    await expect(svc.adminDecideReturn({ id: 'c1', role: 'customer' }, d.id, true, '')).rejects.toThrow('Admins only.');
    const results = await Promise.allSettled([svc.adminDecideReturn(agent, d.id, true, ''), svc.adminDecideReturn(admin, d.id, false, 'second thoughts here')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(pickups.length).toBeLessThanOrEqual(1);
    await expect(svc.adminDecideReturn(agent, d.id, true, '')).rejects.toThrow('just updated');
  });

  it('only returns are decided here; a dispute is decided with decide', async () => {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 1, price: 20 }]);
    const d = await svc.open(customer, { orderId: o.id, type: 'dispute', reason: 'Missing the charger', category: 'missing' });
    await expect(svc.adminDecideReturn(agent, d.id, true, '')).rejects.toThrow('Use decide for disputes.');
  });

  it('a request still carrying an old seller stage (before the migration ran) is decided like any other', async () => {
    for (const stage of ['awaiting_seller', 'seller_rejected', 'seller_timeout', 'escalated'] as const) {
      const { d } = await opened();
      await ds.getRepository(Dispute).update({ id: d.id }, { stage });
      await expect(svc.adminDecideReturn(agent, d.id, true, '')).resolves.toMatchObject({ stage: 'pickup' });
      await ds.getRepository(Dispute).delete({ id: d.id });
    }
  });

  it('the seller is left out of everything: no list, no detail, no thread, no live push, no notice', async () => {
    const { d } = await opened();
    await svc.reply(agent, d.id, 'We are reviewing this');
    await svc.adminDecideReturn(agent, d.id, true, '');
    await svc.onReturnReceived(d.id);
    expect(await svc.list(sellerOne)).toEqual([]);
    await expect(svc.get(sellerOne, d.id)).rejects.toThrow('Dispute not found.');
    await expect(svc.reply(sellerOne, d.id, 'May I join?')).rejects.toThrow('Dispute not found.');
    expect(emitter.sent.filter((e) => e.to === 'user:su1')).toEqual([]);
    expect(notices.filter((n) => n.to === 'user:su1')).toEqual([]);
    // the two retired entry points are gone from the service
    expect((svc as unknown as Record<string, unknown>).sellerRespond).toBeUndefined();
    expect((svc as unknown as Record<string, unknown>).escalate).toBeUndefined();
  });
});

describe('cancelling and the support SLA alert', () => {
  it('the customer can cancel until the return is on its way, not after', async () => {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 1, price: 20 }]);
    const a = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead' });
    expect(await svc.cancel(customer, a.id)).toMatchObject({ status: 'rejected', stage: 'closed' });
    await expect(svc.cancel(customer, a.id)).rejects.toThrow();
    const b = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead' });
    await svc.adminDecideReturn(agent, b.id, true, '');
    await expect(svc.cancel(customer, b.id)).rejects.toThrow('too late');
  });

  it('the customer can no longer escalate: a request is with support from the start', async () => {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 1, price: 20 }]);
    const d = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead' });
    expect(d).toMatchObject({ stage: 'awaiting_support', canEscalate: false, canCancel: true });
  });

  it('sweep alerts support once for a request that waited past the response time, moves nothing and tells nobody else', async () => {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 2, price: 20 }, { sellerId: s1.id, productId: 'p2', qty: 1, price: 5 }]);
    const late = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead', items: [{ itemId: o.items[0].id, qty: 1 }] });
    const onTime = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Charger is dead', items: [{ itemId: o.items[1].id, qty: 1 }] });
    await ds.getRepository(Dispute).update({ id: late.id }, { sellerDueAt: new Date(Date.now() - 60_000) });
    notices.length = 0;
    expect(await svc.sweep()).toBe(1);
    expect(await svc.sweep()).toBe(0);
    expect((await svc.get(admin, late.id)).stage).toBe('awaiting_support'); // nothing moves
    expect((await svc.get(admin, onTime.id)).stage).toBe('awaiting_support');
    expect(notices).toEqual([expect.objectContaining({ to: 'role:admin_support', title: 'Return waiting for support', body: `${late.reference} · ${o.reference}`, type: 'return', entityId: late.id })]);
    expect((await ds.getRepository(Dispute).findOneByOrFail({ id: late.id })).sellerLapsedAt).not.toBeNull();
    // support can still decide it as usual
    await expect(svc.adminDecideReturn(agent, late.id, true, '')).resolves.toMatchObject({ stage: 'pickup' });
  });
});

describe('goods back, grading and the refund', () => {
  async function approved(lines = [{ sellerId: 's', productId: 'p1', qty: 3, price: 20 }, { sellerId: 's', productId: 'p2', qty: 1, price: 10 }], pick: { index: number; qty: number }[] = [{ index: 0, qty: 2 }]) {
    const o = await makeOrder(lines.map((l) => ({ ...l, sellerId: s1.id })), { discountUsd: 0 });
    const d = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead', items: pick.map((p) => ({ itemId: o.items[p.index].id, qty: p.qty })) });
    await svc.adminDecideReturn(agent, d.id, true, '');
    return { o, d };
  }

  it('the returned items only are refunded, when the goods are scanned in', async () => {
    const { o, d } = await approved();
    const done = await svc.onReturnReceived(d.id);
    expect(refundCalls).toHaveLength(1);
    expect(refundCalls[0]).toMatchObject({ orderId: o.id, amountUsd: 40, toWallet: true });
    expect(refundCalls[0].lines).toEqual([{ orderItemId: o.items[0].id, usd: 40 }]);
    // the ledger row says WHICH return it paid (the admin Refunds page shows it)
    expect(refundCalls[0].source).toEqual({ kind: 'return', disputeId: d.id, disputeReference: d.reference });
    expect(done).toMatchObject({ status: 'resolved', outcome: 'return_refund', refundUsd: 40, stage: 'closed' });
    expect(done.receivedAt).toBeTruthy();
    expect(titles('user:c1')).toContain('Return received');
    expect(await ds.getRepository(Order).findOneBy({ id: o.id })).toMatchObject({ status: 'delivered' });
  });

  it('shares a promo discount across the lines, so a part-return never refunds more than was paid', async () => {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 2, price: 20 }, { sellerId: s1.id, productId: 'p2', qty: 1, price: 20 }], { discountUsd: 6 });
    const d = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead', items: [{ itemId: o.items.find((i) => i.productId === 'p1')!.id, qty: 2 }] });
    await svc.adminDecideReturn(agent, d.id, true, '');
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

  it('the returns desk: receiving and grading work on the return of the staff’s own warehouse only; support has no part in handling goods', async () => {
    const { d } = await approved();
    await expect(svc.markReceived(d.id, true, otherWarehouse)).rejects.toThrow('Dispute not found.');
    await expect(svc.markReceived(d.id, true, unlinkedStaff)).rejects.toThrow('Dispute not found.');
    expect((await ds.getRepository(Dispute).findOneByOrFail({ id: d.id })).receivedAt).toBeNull();
    expect(refundCalls).toHaveLength(0);
    const done = await svc.markReceived(d.id, false, warehouse);
    expect(done.receivedAt).toBeTruthy();
    const item = (await ds.getRepository(DisputeItem).find({ where: { disputeId: d.id } }))[0];
    await expect(svc.grade(otherWarehouse, d.id, [{ itemId: item.id, condition: 'resellable' }])).rejects.toThrow('Dispute not found.');
    await expect(svc.grade({ ...agent }, d.id, [{ itemId: item.id, condition: 'resellable' }])).rejects.toThrow('Warehouse staff only');
    await expect(svc.grade({ id: 'm', role: 'admin_marketing', name: 'M' }, d.id, [{ itemId: item.id, condition: 'resellable' }])).rejects.toThrow('Warehouse staff only');
    expect(restocks).toHaveLength(0);
    const graded = await svc.grade({ id: 'o1', role: 'admin_operations', name: 'Ops' }, d.id, [{ itemId: item.id, condition: 'resellable', restockQty: 1 }]);
    expect(graded.gradedAt).toBeTruthy();
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
    expect(d).toMatchObject({ type: 'dispute', category: 'missing', stage: 'awaiting_support' });
    expect(d.items).toHaveLength(1);
    await expect(svc.open(customer, { orderId: o.id, type: 'dispute', reason: 'Another problem entirely' })).rejects.toThrow('open request');
    expect(titles('user:su1')).toEqual([]); // the seller is told nothing
    expect(titles('role:admin_support')).toContain('Dispute opened');
    // A dispute is a matter for support alone: unlike a return, it is not sent to the warehouse.
    expect(emitter.sent.some((e) => e.event === 'dispute:created' && e.to.includes('warehouse_staff'))).toBe(false);
  });

  it('support replies in the thread; only the customer and the desk can join, and the stage does not move', async () => {
    const { d } = await dispute();
    const msg = await svc.reply(agent, d.id, 'Could you send a photo of the box?', [UP]);
    expect(msg).toMatchObject({ role: 'admin_support', attachments: [UP] });
    expect((await svc.get(agent, d.id)).stage).toBe('awaiting_support');
    await svc.reply({ ...customer, role: 'customer' }, d.id, 'The box was empty');
    expect(titles('user:c1')).toContain('Dispute reply');
    expect(titles('role:admin_support')).toContain('Dispute reply');
    await expect(svc.reply({ id: 'x', role: 'customer', name: 'X' }, d.id, 'Let me in')).rejects.toThrow('Dispute not found.');
    // sellers take no part: not the store of the order, not another store
    await expect(svc.reply({ ...sellerOne }, d.id, 'Shipped Monday, see the label')).rejects.toThrow('Dispute not found.');
    await expect(svc.reply({ ...sellerTwo }, d.id, 'Not my order at all')).rejects.toThrow('Dispute not found.');
    await expect(svc.reply(agent, d.id, '')).rejects.toThrow('Write a message first');
    const view = await svc.get(customer, d.id);
    expect(view.messages).toHaveLength(2);
    expect((await svc.get(agent, d.id)).messages![1].authorId).toBe('c1');
    expect(emitter.sent.filter((e) => e.to === 'user:su1')).toEqual([]);
  });

  it('a seller cannot read a dispute of their store; the customer and staff see the row whole', async () => {
    const { d } = await dispute();
    await expect(svc.get(sellerOne, d.id)).rejects.toThrow('Dispute not found.');
    expect(await svc.list(sellerOne)).toEqual([]);
    expect((await svc.get(agent, d.id)).customerId).toBe('c1');
    expect(emitter.sent.some((e) => e.to === 'user:c1' && 'customerId' in (e.payload as object))).toBe(true);
  });

  it('decide: a partial refund needs an amount, finance or admin, and never exceeds what is left', async () => {
    const { o, d } = await dispute();
    await expect(svc.decide(agent, d.id, { outcome: 'refund_partial', amountUsd: 5 }, false)).rejects.toThrow('Only admin or finance');
    await expect(svc.decide(admin, d.id, { outcome: 'refund_partial', amountUsd: 0 }, true)).rejects.toThrow('Enter the amount');
    await expect(svc.decide(admin, d.id, { outcome: 'banana' }, true)).rejects.toThrow('Outcome must be one of');
    const done = await svc.decide(admin, d.id, { outcome: 'refund_partial', amountUsd: 7.5, reason: 'The charger was missing' }, true);
    expect(refundCalls).toEqual([{ orderId: o.id, amountUsd: 7.5, toWallet: true, memo: `Refund for ${o.reference} (dispute)`, source: { kind: 'dispute', disputeId: d.id, disputeReference: d.reference } }]);
    expect(done).toMatchObject({ status: 'resolved', outcome: 'refund_partial', refundUsd: 7.5, resolution: 'The charger was missing', stage: 'closed' });
    expect(titles('user:c1')).toContain('Dispute resolved');
    expect(titles('user:su1')).toEqual([]); // the seller is told nothing about the outcome
    await expect(svc.decide(admin, d.id, { outcome: 'reject', reason: 'second thoughts' }, true)).rejects.toThrow('already handled');
  });

  it('decide: a full refund pays back what is outstanding; a replacement hands over to replacements; a refusal needs a reason', async () => {
    const a = await dispute();
    outstanding = 33;
    const full = await svc.decide(admin, a.d.id, { outcome: 'refund_full' }, true);
    expect(fullRefunds).toEqual([{ orderId: a.o.id, toWallet: true, source: { kind: 'dispute', disputeId: a.d.id, disputeReference: a.d.reference } }]);
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
  it('lists: customers their own, sellers none (but their own purchases), the warehouse the returns, admins all', async () => {
    const o1 = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 1, price: 20 }]);
    const o2 = await makeOrder([{ sellerId: s2.id, productId: 'p2', qty: 1, price: 20 }]);
    await svc.open(customer, { orderId: o1.id, type: 'return', reason: 'Left cup is dead' });
    await svc.open(customer, { orderId: o2.id, type: 'dispute', reason: 'Wrong colour was sent' });
    expect(await svc.list(customer)).toHaveLength(2);
    expect(await svc.list({ id: 'someone', role: 'customer' })).toHaveLength(0);
    expect(await svc.list(sellerOne)).toHaveLength(0);
    expect(await svc.list(sellerTwo)).toHaveLength(0);
    expect(await svc.list(warehouse)).toHaveLength(1);
    expect(await svc.list(agent)).toHaveLength(2);
    expect(await svc.list(agent, { type: 'dispute' })).toHaveLength(1);
    expect(await svc.list(agent, { status: 'resolved' })).toHaveLength(0);
  });

  it('warehouse staff see the returns of their own warehouse only: list, detail and the live push; staff linked to none see nothing', async () => {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 1, price: 20 }]);
    const d = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead' });
    const l = await makeOrder([{ sellerId: s1.id, productId: 'p2', qty: 1, price: 20 }], { destinationHubId: 'hub-l' });
    const dl = await svc.open(customer, { orderId: l.id, type: 'return', reason: 'Strap is torn' });
    expect((await svc.list(warehouse)).map((x) => x.id)).toEqual([d.id]);
    expect((await svc.list(otherWarehouse)).map((x) => x.id)).toEqual([dl.id]);
    expect(await svc.list(unlinkedStaff)).toEqual([]);
    expect(await svc.list({ id: 'w9', role: 'warehouse_staff' })).toEqual([]); // no hub on the viewer at all
    expect((await svc.get(warehouse, d.id)).id).toBe(d.id);
    await expect(svc.get(warehouse, dl.id)).rejects.toThrow('Dispute not found.');
    await expect(svc.get(otherWarehouse, d.id)).rejects.toThrow('Dispute not found.');
    await expect(svc.get(unlinkedStaff, d.id)).rejects.toThrow('Dispute not found.');
    expect(emitter.sent.filter((e) => e.event === 'dispute:created' && e.to === 'hub:hub-l').map((e) => e.payload.id)).toEqual([dl.id]);
    expect(emitter.sent.filter((e) => e.event === 'dispute:created' && e.to === 'hub:hub-k').map((e) => e.payload.id)).toEqual([d.id]);
  });

  it('a return belongs to the warehouse its pickup task brings the goods to, not only to the order’s destination', async () => {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 1, price: 20 }]);
    const task = await ds.getRepository(DeliveryTask).save(ds.getRepository(DeliveryTask).create({ orderId: o.id, orderReference: o.reference, kind: 'return_pickup', toHubId: 'hub-l', hubId: 'hub-l' }));
    pickupAnswer = { id: task.id };
    const d = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead' });
    await svc.adminDecideReturn(agent, d.id, true, '');
    expect((await svc.list(otherWarehouse)).map((x) => x.id)).toEqual([d.id]);
    expect(await svc.list(warehouse)).toEqual([]);
  });

  it('a dispute that names no lines on a two-store order belongs to no store and is visible to neither', async () => {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 1, price: 20 }, { sellerId: s2.id, productId: 'p2', qty: 1, price: 20 }]);
    const d = await svc.open(customer, { orderId: o.id, type: 'dispute', reason: 'Parcel arrived crushed' });
    expect(d.sellerId).toBeNull();
    expect(await svc.list(sellerOne)).toHaveLength(0);
    expect(await svc.list(sellerTwo)).toHaveLength(0);
    expect(notices.filter((n) => n.to.startsWith('user:su'))).toEqual([]);
  });

  it('a seller who also shops sees their own purchases like any customer', async () => {
    const o = await makeOrder([{ sellerId: s2.id, productId: 'p2', qty: 1, price: 20 }], { customerId: sellerOne.id, customerName: sellerOne.name });
    const d = await svc.open({ id: sellerOne.id, name: sellerOne.name }, { orderId: o.id, type: 'dispute', reason: 'Wrong colour was sent' });
    expect((await svc.list(sellerOne)).map((x) => x.id)).toEqual([d.id]);
    expect((await svc.get(sellerOne, d.id)).id).toBe(d.id);
  });

  it('eligibility shows the window, the lines and what is left', async () => {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 3, price: 20 }]);
    expect(await svc.eligibility(customer.id, o.id)).toMatchObject({ eligible: true, windowDays: 7, items: [{ qty: 3, remaining: 3, unitPriceUsd: 20 }] });
    await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead', items: [{ itemId: o.items[0].id, qty: 3 }] });
    expect(await svc.eligibility(customer.id, o.id)).toMatchObject({ eligible: false, reason: 'You already have an open request for this order.' });
    await expect(svc.eligibility('other', o.id)).rejects.toThrow('Order not found.');
  });
});

// ── Time limits on a fake clock ───────────────────────────────────────────────
// Only `Date` is faked (the in-memory database and the promise queue keep running); the sweeper's own timer is
// tested separately with every timer faked and `sweep` stubbed.
const ONLY_DATE = ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'performance', 'hrtime'] as const;
const T0 = new Date('2026-11-03T08:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (ms: number) => jest.setSystemTime(new Date(T0.getTime() + ms));

async function deliveredLeg(orderId: string, kind: 'delivery' | 'return_pickup' | 'pickup' | 'replacement_delivery', deliveredAt: Date) {
  const repo = ds.getRepository(DeliveryTask);
  return repo.save(repo.create({ orderId, orderReference: 'SOM-T', status: 'delivered', kind, deliveredAt }));
}

describe('time limits on a fake clock: the return deadline', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: T0, doNotFake: [...ONLY_DATE] });
  });
  afterEach(() => jest.useRealTimers());

  async function deliveredOrder() {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 2, price: 20 }, { sellerId: s1.id, productId: 'p2', qty: 1, price: 5 }]);
    await deliveredLeg(o.id, 'delivery', T0);
    return o;
  }

  it('the window is open until exactly the end of day 7 after delivery, then closed for good', async () => {
    const o = await deliveredOrder();
    at(7 * DAY - 1000);
    const open = await svc.eligibility(customer.id, o.id);
    expect(open).toMatchObject({ eligible: true, windowDays: 7 });
    expect(open.endsAt!.getTime()).toBe(T0.getTime() + 7 * DAY);
    at(7 * DAY + 1000);
    expect(await svc.eligibility(customer.id, o.id)).toMatchObject({ eligible: false, reason: 'Returns are accepted within 7 days of delivery, and that time has passed.' });
    await expect(svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead' })).rejects.toThrow('within 7 days');
  });

  it('follows the platform setting: a 3-day window, and a window changed while the clock runs', async () => {
    settingsMap.returnWindowDays = '3';
    const o = await deliveredOrder();
    at(3 * DAY - 1000);
    expect((await svc.eligibility(customer.id, o.id)).eligible).toBe(true);
    at(3 * DAY + 1000);
    expect((await svc.eligibility(customer.id, o.id)).eligible).toBe(false);
    settingsMap.returnWindowDays = '10';
    expect((await svc.eligibility(customer.id, o.id)).eligible).toBe(true);
  });

  it('a later leg (a return pickup, a replacement, the seller pickup) never pushes the end of the window out', async () => {
    const o = await deliveredOrder();
    // Day 1: the customer returns the first line; day 6: the warehouse collects it (that leg is "delivered" at the warehouse).
    at(DAY);
    const first = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead', items: [{ itemId: o.items[0].id, qty: 2 }] });
    expect(first.stage).toBe('awaiting_support');
    await deliveredLeg(o.id, 'return_pickup', new Date(T0.getTime() + 6 * DAY));
    await deliveredLeg(o.id, 'replacement_delivery', new Date(T0.getTime() + 6.5 * DAY));
    await deliveredLeg(o.id, 'pickup', new Date(T0.getTime() + 6.8 * DAY));
    at(8 * DAY);
    const e = await svc.eligibility(customer.id, o.id);
    expect(e.endsAt!.getTime()).toBe(T0.getTime() + 7 * DAY);
    expect(e.eligible).toBe(false);
    await expect(svc.open(customer, { orderId: o.id, type: 'return', reason: 'Charger is dead', items: [{ itemId: o.items[1].id, qty: 1 }] })).rejects.toThrow('within 7 days');
  });

  it('the window counts from the last delivery leg when an order was delivered in several parcels', async () => {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 1, price: 20 }]);
    await deliveredLeg(o.id, 'delivery', T0);
    await deliveredLeg(o.id, 'delivery', new Date(T0.getTime() + 2 * DAY));
    at(8 * DAY);
    expect((await svc.eligibility(customer.id, o.id)).eligible).toBe(true);
    at(9 * DAY + 1000);
    expect((await svc.eligibility(customer.id, o.id)).eligible).toBe(false);
  });
});

describe('time limits on a fake clock: the support response time', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: T0, doNotFake: [...ONLY_DATE] });
  });
  afterEach(() => jest.useRealTimers());

  async function openReturn(over: { qty?: number } = {}) {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: over.qty ?? 1, price: 20 }]);
    return svc.open(customer, { orderId: o.id, type: 'return', reason: 'Left cup is dead' });
  }

  it('gives support 48 hours by default and alerts nobody before then', async () => {
    const r = await openReturn();
    expect(r.sellerDueAt!.getTime()).toBe(T0.getTime() + 48 * HOUR);
    at(48 * HOUR - 1000);
    expect(await svc.sweep()).toBe(0);
    expect((await svc.get(customer, r.id)).stage).toBe('awaiting_support');
    // support can still decide right up to the deadline
    expect((await svc.adminDecideReturn(agent, r.id, true, '')).stage).not.toBe('awaiting_support');
  });

  it('one second past the deadline support is alerted once; the request does not move and the customer and the seller are not told', async () => {
    const r = await openReturn();
    at(48 * HOUR + 1000);
    expect(await svc.sweep()).toBe(1);
    expect(await svc.sweep()).toBe(0); // idempotent: a second pass finds nothing
    const seen = await svc.get(customer, r.id);
    expect(seen).toMatchObject({ stage: 'awaiting_support', canEscalate: false, canCancel: true });
    expect(titles('role:admin_support').filter((t) => t === 'Return waiting for support')).toHaveLength(1);
    expect(titles('user:c1')).toEqual([]);
    expect(titles('user:su1')).toEqual([]);
    expect(emitter.sent.some((e) => e.event === 'dispute:updated' && e.to === 'user:su1')).toBe(false);
    expect((await svc.adminDecideReturn(agent, r.id, true, '')).stage).toBe('pickup'); // a late decision works
    expect(await svc.sweep()).toBe(0);
  });

  it('follows the platform setting (2 hours) and ignores a request support already decided', async () => {
    settingsMap.sellerResponseHours = '2';
    const a = await openReturn();
    const b = await openReturn({ qty: 2 });
    expect(a.sellerDueAt!.getTime()).toBe(T0.getTime() + 2 * HOUR);
    await svc.adminDecideReturn(agent, b.id, false, 'Not covered by the policy');
    at(2 * HOUR + 1000);
    expect(await svc.sweep()).toBe(1);
    expect((await svc.get(admin, a.id)).stage).toBe('awaiting_support');
    expect((await svc.get(admin, b.id)).stage).toBe('closed');
  });

  it('a request the customer cancelled never alerts', async () => {
    const r = await openReturn();
    await svc.cancel(customer, r.id);
    at(60 * HOUR);
    expect(await svc.sweep()).toBe(0);
    expect((await svc.get(admin, r.id)).stage).toBe('closed');
  });

  it('a dispute alerts support once past its response time and does not move', async () => {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 1, price: 20 }]);
    const d = await svc.open(customer, { orderId: o.id, type: 'dispute', reason: 'The charger never arrived', category: 'missing' });
    at(47 * HOUR);
    expect(await svc.sweep()).toBe(0);
    at(49 * HOUR);
    expect(await svc.sweep()).toBe(1);
    expect(await svc.sweep()).toBe(0);
    expect(titles('role:admin_support').filter((t) => t === 'Dispute waiting for support')).toHaveLength(1);
    expect(titles('user:c1')).toEqual([]);
    expect(titles('user:su1')).toEqual([]);
    const row = await ds.getRepository(Dispute).findOneByOrFail({ id: d.id });
    expect(row.sellerLapsedAt!.getTime()).toBe(T0.getTime() + 49 * HOUR);
    expect(row.stage).toBe('awaiting_support');
  });

  it('a dispute support answered in time is not reported late', async () => {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 1, price: 20 }]);
    const d = await svc.open(customer, { orderId: o.id, type: 'dispute', reason: 'The charger never arrived', category: 'missing' });
    at(10 * HOUR);
    await svc.decide(agent, d.id, { outcome: 'reject', reason: 'Tracking shows it was signed for' }, false);
    at(60 * HOUR);
    expect(await svc.sweep()).toBe(0);
    expect(titles('role:admin_support').filter((t) => t.endsWith('waiting for support'))).toHaveLength(0);
  });
});

describe('time limits: the sweeper timer', () => {
  afterEach(() => jest.useRealTimers());

  it('runs a sweep every AFTER_SALE_SWEEP_MS (60 s by default), survives a failing sweep and stops on shutdown', async () => {
    jest.useFakeTimers();
    const sweep = jest.spyOn(svc, 'sweep').mockResolvedValueOnce(0).mockRejectedValueOnce(new Error('db down')).mockResolvedValue(0);
    svc.onModuleInit();
    await jest.advanceTimersByTimeAsync(59_999);
    expect(sweep).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(sweep).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(60_000); // the rejected sweep is swallowed (logged), the next one still runs
    await jest.advanceTimersByTimeAsync(60_000);
    expect(sweep).toHaveBeenCalledTimes(3);
    svc.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(5 * 60_000);
    expect(sweep).toHaveBeenCalledTimes(3);
  });
});

describe('who reads and decides: the returns and disputes desk only', () => {
  const marketing = { id: 'm1', role: 'admin_marketing', name: 'Mia Marketing' };
  const moderation = { id: 'm2', role: 'admin_moderation', name: 'Moe Moderation' };
  const finance = { id: 'f1', role: 'admin_finance', name: 'Fay Finance' };
  const operations = { id: 'o1', role: 'admin_operations', name: 'Ola Ops' };
  const OUT = [marketing, moderation];
  const DESK = [admin, agent, finance, operations];

  async function openCase(type: 'return' | 'dispute' = 'return') {
    const o = await makeOrder([{ sellerId: s1.id, productId: 'p1', qty: 1, price: 20 }]);
    return svc.open(customer, { orderId: o.id, type, reason: 'The charger never arrived', ...(type === 'dispute' ? { category: 'missing' } : {}) });
  }

  it('marketing and moderation cannot list the queue, open a case, reply or decide; the desk and the Super Admin can read', async () => {
    const d = await openCase();
    for (const who of OUT) {
      await expect(svc.list(who)).rejects.toThrow('Not allowed.');
      await expect(svc.get(who, d.id)).rejects.toThrow('Dispute not found.'); // the same answer as for a case that is not theirs
      await expect(svc.reply(who, d.id, 'Hello')).rejects.toThrow('Dispute not found.');
      await expect(svc.adminDecideReturn(who, d.id, true, '')).rejects.toThrow('Not allowed.');
    }
    for (const who of DESK) {
      expect(await svc.list(who)).toHaveLength(1);
      expect((await svc.get(who, d.id)).id).toBe(d.id);
    }
    expect(await ds.getRepository(DisputeMessage).count()).toBe(0);
  });

  it('a dispute is decided by the desk (refunds by the super admin and finance); marketing and moderation are refused and the case stays open', async () => {
    const d = await openCase('dispute');
    for (const who of OUT) await expect(svc.decide(who, d.id, { outcome: 'reject', reason: 'Not credible enough' }, false)).rejects.toThrow('Not allowed.');
    expect((await ds.getRepository(Dispute).findOneByOrFail({ id: d.id })).status).toBe('open');
    await expect(svc.decide(agent, d.id, { outcome: 'reject', reason: 'Not credible enough' }, false)).resolves.toMatchObject({ status: 'rejected' });
  });

  it('live updates and thread messages go to the desk roles, not to every admin department', async () => {
    const d = await openCase();
    const desk = ['admin', 'admin_operations', 'admin_support', 'admin_finance'].join(',');
    expect(emitter.sent.filter((e) => e.event === 'dispute:created' && e.to.startsWith('admin')).map((e) => e.to)).toEqual([desk]);
    await svc.reply(agent, d.id, 'We are looking into it');
    expect(emitter.sent.filter((e) => e.event === 'dispute:message' && e.to.startsWith('admin')).map((e) => e.to)).toEqual([desk]);
    expect(emitter.sent.filter((e) => e.to.includes('admin_marketing') || e.to.includes('admin_moderation'))).toEqual([]);
  });
});
