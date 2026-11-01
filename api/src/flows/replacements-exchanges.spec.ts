import { DataSource } from 'typeorm';
import { Dispute, Exchange, Order, OrderItem, Product, Replacement, Seller } from '../database/entities';
import { addProduct, recordingEmitter, testDb } from '../testing/test-db';
import { ExchangesService } from './exchanges.service';
import { ReplacementsService } from './replacements.service';

let ds: DataSource;
let emitter: ReturnType<typeof recordingEmitter>;
let notices: { to: string; title: string; body: string }[];
let walletCalls: { userId: string; type: string; amount: number; description: string }[];
let walletBalance: number;
let taskAnswer: { id: string } | null;
let tasks: unknown[];
let stock: Map<string, number>;
let reserves: unknown[][];
let restocks: unknown[][];
let replacements: ReplacementsService;
let exchanges: ExchangesService;
let s1: Seller;
let s2: Seller;
let hat: Product;
let shoe: Product;
let pricey: Product;

const customer = { id: 'c1', name: 'Marie Dubois', role: 'customer' };
const sellerOne = { id: 'su1', role: 'seller' };
const sellerTwo = { id: 'su2', role: 'seller' };
const admin = { id: 'a0', name: 'Admin', role: 'admin' };

async function order(lines: { product: Product; qty?: number; price?: number; variant?: string; sellerId?: string }[], status: Order['status'] = 'delivered') {
  const repo = ds.getRepository(Order);
  return repo.save(
    repo.create({
      reference: `SOM-${Math.floor(Math.random() * 1e8)}`,
      customerId: customer.id,
      customerName: customer.name,
      status,
      totalUsd: 50,
      items: lines.map((l) => ({
        productId: l.product.id,
        productName: l.product.name,
        variant: l.variant ?? 'Default',
        qty: l.qty ?? 1,
        priceUsd: l.price ?? l.product.price,
        sellerId: l.sellerId ?? s1.id,
      })) as OrderItem[],
    }),
  );
}

beforeEach(async () => {
  ds = await testDb();
  emitter = recordingEmitter();
  notices = [];
  walletCalls = [];
  walletBalance = 100;
  taskAnswer = { id: 'task-1' };
  tasks = [];
  reserves = [];
  restocks = [];
  s1 = await ds.getRepository(Seller).save(ds.getRepository(Seller).create({ name: 'One', userId: sellerOne.id, status: 'approved' }));
  s2 = await ds.getRepository(Seller).save(ds.getRepository(Seller).create({ name: 'Two', userId: sellerTwo.id, status: 'approved' }));
  hat = await addProduct(ds, { name: 'Hat', price: 10, stock: 5, sellerId: s1.id });
  shoe = await addProduct(ds, {
    name: 'Shoe',
    price: 30,
    stock: 5,
    sellerId: s1.id,
    variants: JSON.stringify([{ name: 'Size', options: ['40', '41', '42'] }]),
  });
  pricey = await addProduct(ds, { name: 'Boot', price: 50, stock: 5, sellerId: s1.id });
  stock = new Map([hat, shoe, pricey].map((p) => [p.id, p.stock]));
  const notifications = {
    toUser: async (to: string, n: { title: string; body: string }) => void notices.push({ to, ...n }),
    toRole: async (to: string, n: { title: string; body: string }) => void notices.push({ to: `role:${to}`, ...n }),
  };
  const products = {
    getRaw: async (id: string) => ds.getRepository(Product).findOneBy({ id }),
    get: async (id: string) => ds.getRepository(Product).findOneBy({ id }),
    availableFor: async (id: string) => stock.get(id) ?? 0,
    reserve: async (...a: unknown[]) => {
      reserves.push(a);
      const [id, qty] = a as [string, number];
      if ((stock.get(id) ?? 0) < qty) return false;
      stock.set(id, (stock.get(id) ?? 0) - qty);
      return true;
    },
    restock: async (...a: unknown[]) => {
      restocks.push(a);
      const [id, qty] = a as [string, number];
      stock.set(id, (stock.get(id) ?? 0) + qty);
    },
    names: async () => new Map(),
  };
  const names = { frenchNames: async (refs: unknown[]) => refs.map(() => null) };
  const wallet = {
    apply: async (userId: string, type: string, amount: number, description: string) => {
      if (type === 'debit' && walletBalance < amount) throw new Error('Insufficient wallet balance.');
      walletBalance += type === 'debit' ? -amount : amount;
      walletCalls.push({ userId, type, amount, description });
    },
  };
  const settings = { get: async () => null };
  const logistics = { returnPickup: async () => null, replacementDelivery: async (i: unknown) => (tasks.push(i), taskAnswer) };
  replacements = new ReplacementsService(
    ds.getRepository(Replacement),
    ds.getRepository(Order),
    ds.getRepository(Seller),
    notifications as never,
    emitter as never,
    products as never,
    names as never,
    settings as never,
    logistics as never,
  );
  exchanges = new ExchangesService(
    ds.getRepository(Exchange),
    ds.getRepository(Order),
    ds.getRepository(Seller),
    notifications as never,
    emitter as never,
    products as never,
    names as never,
    wallet as never,
    settings as never,
    logistics as never,
  );
});
afterEach(async () => ds.destroy());

const titles = (to: string) => notices.filter((n) => n.to === to).map((n) => n.title);

describe('replacements', () => {
  it('a customer asks for their own delivered item, once, with quantity and photos', async () => {
    const o = await order([{ product: hat, qty: 2 }]);
    await expect(replacements.create({ id: 'x', name: 'X', role: 'customer' }, { orderId: o.id, sku: hat.id, productName: 'Hat' })).rejects.toThrow('not eligible');
    await expect(replacements.create(customer, { orderId: o.id, sku: 'other', productName: 'Hat' })).rejects.toThrow('not on this order');
    const pending = await order([{ product: hat }], 'confirmed');
    await expect(replacements.create(customer, { orderId: pending.id, sku: hat.id, productName: 'Hat' })).rejects.toThrow('not eligible');
    await expect(
      replacements.create(customer, { orderId: o.id, sku: hat.id, productName: 'Hat', attachments: ['https://evil.example/a.png'] }),
    ).rejects.toThrow('uploaded');
    const rep = await replacements.create(customer, { orderId: o.id, sku: hat.id, productName: 'Hat', reason: 'Cracked', qty: 5, attachments: ['http://x/uploads/00000000-0000-4000-8000-000000000001.png'] });
    expect(rep).toMatchObject({ status: 'requested', qty: 2, sellerId: s1.id, variant: 'Default' });
    expect(rep.attachments).toHaveLength(1);
    expect(rep.sellerDueAt).toBeTruthy();
    await expect(replacements.create(customer, { orderId: o.id, sku: hat.id, productName: 'Hat' })).rejects.toThrow('already asked');
    expect(titles('su1')).toContain('Replacement requested on your item');
  });

  it('accepts the order line id instead of the item code', async () => {
    const o = await order([{ product: hat, qty: 3 }, { product: shoe, variant: 'Size: 41' }]);
    const line = o.items.find((i) => i.productId === shoe.id)!;
    const rep = await replacements.create(customer, { orderId: o.id, itemId: line.id, reason: 'Sole came off' });
    expect(rep).toMatchObject({ sku: shoe.id, productName: 'Shoe', variant: 'Size: 41', qty: 1 });
    await expect(replacements.create(customer, { orderId: o.id, itemId: 'nope' })).rejects.toThrow('not on this order');
    await expect(replacements.create(customer, { orderId: o.id })).rejects.toThrow('Say which item');
    await expect(replacements.create(customer, { orderId: o.id, itemId: line.id })).rejects.toThrow('already asked');
  });

  it('the seller approves: stock comes from them, logistics is asked, the customer and warehouse are told', async () => {
    const o = await order([{ product: hat, qty: 2 }]);
    const rep = await replacements.create(customer, { orderId: o.id, sku: hat.id, productName: 'Hat', qty: 1 });
    const live = await replacements.respond(sellerOne, rep.id, true, '');
    expect(live).toMatchObject({ status: 'approved', stockTaken: 1, deliveryTaskId: 'task-1', dispatchStatus: 'ready' });
    expect(stock.get(hat.id)).toBe(4);
    expect(reserves[0]).toEqual([hat.id, 1, expect.objectContaining({ reason: 'replacement', orderId: o.id })]);
    expect(tasks).toEqual([{ replacementId: rep.id, orderId: o.id }]);
    expect(titles(customer.id)).toContain('Replacement approved');
    expect(titles('role:warehouse_staff')).toContain('Replacement approved');
    expect(emitter.sent.some((e) => e.event === 'replacement:updated' && e.to === `user:${customer.id}`)).toBe(true);
    await expect(replacements.respond(sellerOne, rep.id, false, 'changed my mind')).rejects.toThrow('already handled');
  });

  it('no stock: the request goes back to requested and the seller is told why', async () => {
    stock.set(hat.id, 0);
    const o = await order([{ product: hat }]);
    const rep = await replacements.create(customer, { orderId: o.id, sku: hat.id, productName: 'Hat' });
    await expect(replacements.respond(sellerOne, rep.id, true, '')).rejects.toThrow('Not enough stock');
    expect((await replacements.get(admin, rep.id)).status).toBe('requested');
    stock.set(hat.id, 3);
    expect((await replacements.respond(sellerOne, rep.id, true, '')).status).toBe('approved');
  });

  it('without a delivery task (logistics refused) it is still approved: staff dispatch by hand', async () => {
    taskAnswer = null;
    const o = await order([{ product: hat }]);
    const rep = await replacements.create(customer, { orderId: o.id, sku: hat.id, productName: 'Hat' });
    const done = await replacements.respond(sellerOne, rep.id, true, '');
    expect(done).toMatchObject({ status: 'approved', deliveryTaskId: null });
    expect((await replacements.setStatus(rep.id, 'dispatched')).status).toBe('dispatched');
  });

  it('only that store (or support) answers; rejecting needs a reason and gives the stock back', async () => {
    const o = await order([{ product: hat }]);
    const rep = await replacements.create(customer, { orderId: o.id, sku: hat.id, productName: 'Hat' });
    await expect(replacements.respond(sellerTwo, rep.id, true, '')).rejects.toThrow('Replacement not found.');
    await expect(replacements.respond(customer, rep.id, true, '')).rejects.toThrow('Replacement not found.');
    await expect(replacements.respond(sellerOne, rep.id, false, 'no')).rejects.toThrow('why you are rejecting');
    const rejected = await replacements.respond(sellerOne, rep.id, false, 'Worn through use, not a defect');
    expect(rejected.status).toBe('rejected');
    expect(notices.find((n) => n.to === customer.id && n.title === 'Replacement rejected')?.body).toContain('Worn through use');
    expect(stock.get(hat.id)).toBe(5);
    const o2 = await order([{ product: hat }]);
    const r2 = await replacements.create(customer, { orderId: o2.id, sku: hat.id, productName: 'Hat' });
    expect((await replacements.respond(admin, r2.id, true, '')).status).toBe('approved'); // support on the seller's behalf
  });

  it('approving then rejecting at the desk puts the unit back on the shelf, once', async () => {
    const o = await order([{ product: hat }]);
    const rep = await replacements.create(customer, { orderId: o.id, sku: hat.id, productName: 'Hat' });
    await replacements.respond(sellerOne, rep.id, true, '');
    expect(stock.get(hat.id)).toBe(4);
    await replacements.setStatus(rep.id, 'rejected');
    expect(stock.get(hat.id)).toBe(5);
    expect(restocks).toHaveLength(1);
  });

  it('follows the delivery task: picked up -> dispatched, delivered -> delivered, with a notice; never backwards', async () => {
    const o = await order([{ product: hat }]);
    const rep = await replacements.create(customer, { orderId: o.id, sku: hat.id, productName: 'Hat' });
    await replacements.respond(sellerOne, rep.id, true, '');
    expect((await replacements.syncFromDelivery(rep.id, 'picked_up'))!.status).toBe('dispatched');
    const done = await replacements.syncFromDelivery(rep.id, 'delivered');
    expect(done).toMatchObject({ status: 'delivered', dispatchStatus: 'delivered' });
    expect(done!.deliveredAt).toBeTruthy();
    expect(titles(customer.id)).toContain('Replacement delivered');
    expect((await replacements.syncFromDelivery(rep.id, 'picked_up'))!.status).toBe('delivered');
    expect(await replacements.syncFromDelivery('missing', 'delivered')).toBeNull();
    await expect(replacements.setStatus(rep.id, 'requested')).rejects.toThrow("Can't move from delivered to requested.");
  });

  it('the seller sees the customer by first name with no id, in the list, the detail and the live event', async () => {
    const o = await order([{ product: hat }]);
    const rep = await replacements.create(customer, { orderId: o.id, sku: hat.id, productName: 'Hat' });
    const [row] = await replacements.list(sellerOne);
    expect(row).not.toHaveProperty('customerId');
    expect(row.customerName).toBe('Marie');
    expect(await replacements.list(sellerTwo)).toEqual([]);
    expect(await replacements.get(sellerOne, rep.id)).not.toHaveProperty('customerId');
    await expect(replacements.get(sellerTwo, rep.id)).rejects.toThrow('Replacement not found.');
    expect((await replacements.get(admin, rep.id)).customerId).toBe('c1');
    expect(emitter.sent.filter((e) => e.to === 'user:su1' && e.event === 'replacement:updated').every((e) => !('customerId' in (e.payload as object)))).toBe(true);
    expect((await replacements.list(customer))[0].customerId).toBe('c1');
  });

  it('created from a dispute: one approved replacement per item, stock taken, delivery requested', async () => {
    const o = await order([{ product: hat, qty: 2 }, { product: pricey }]);
    const dispute = await ds.getRepository(Dispute).save(
      ds.getRepository(Dispute).create({ reference: 'DP-1', orderId: o.id, orderReference: o.reference, customerId: 'c1', customerName: 'Marie', type: 'dispute', reason: 'Wrong item in the box' }),
    );
    const made = await replacements.createFromDispute(dispute, [{ itemId: o.items.find((i) => i.productId === hat.id)!.id, qty: 1 }]);
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ status: 'approved', qty: 1, disputeId: dispute.id, stockTaken: 1 });
    expect(tasks).toHaveLength(1);
    await expect(replacements.createFromDispute(dispute, [{ itemId: 'nope' }])).rejects.toThrow('not on this order');
    const single = await order([{ product: pricey }]);
    const d2 = await ds.getRepository(Dispute).save(
      ds.getRepository(Dispute).create({ reference: 'DP-2', orderId: single.id, orderReference: single.reference, customerId: 'c1', customerName: 'Marie', type: 'dispute', reason: 'Wrong item in the box' }),
    );
    expect(await replacements.createFromDispute(d2)).toHaveLength(1); // the only line
    const many = await order([{ product: hat }, { product: pricey }]);
    const d3 = await ds.getRepository(Dispute).save(
      ds.getRepository(Dispute).create({ reference: 'DP-3', orderId: many.id, orderReference: many.reference, customerId: 'c1', customerName: 'Marie', type: 'dispute', reason: 'Wrong item in the box' }),
    );
    await expect(replacements.createFromDispute(d3)).rejects.toThrow('Pick the item to replace');
  });
});

describe('exchanges', () => {
  const base = (o: Order, over: Record<string, unknown> = {}) => ({
    orderId: o.id,
    fromSku: shoe.id,
    fromName: 'Shoe',
    toSku: shoe.id,
    toName: 'Shoe',
    reason: 'Too small',
    ...over,
  });

  it('chooses another option of the same product: no price difference, nothing charged, and the customer cannot set a price', async () => {
    const o = await order([{ product: shoe, variant: 'Size: 40' }]);
    const ex = await exchanges.create(customer, base(o, { toVariant: 'Size: 42', priceDiffUsd: 500 }));
    expect(ex).toMatchObject({ fromVariant: 'Size: 40', toVariant: 'Size: 42', priceDiffUsd: 0, heldUsd: 0, qty: 1, status: 'requested', sellerId: s1.id });
    expect(walletCalls).toEqual([]);
    expect(titles('su1')).toContain('Exchange requested on your item');
  });

  const UP = 'http://x/uploads/00000000-0000-4000-8000-000000000002.png';

  it('takes photos (upload links only, at most 6) and serves them as a list', async () => {
    const o = await order([{ product: shoe, variant: 'Size: 40' }]);
    await expect(exchanges.create(customer, base(o, { toVariant: 'Size: 42', attachments: ['https://evil.example/a.png'] }))).rejects.toThrow('uploaded');
    const ex = await exchanges.create(customer, base(o, { toVariant: 'Size: 42', attachments: [UP] }));
    expect(ex.attachments).toEqual([UP]);
    expect((await exchanges.get(customer, ex.id)).attachments).toEqual([UP]);
    expect((await exchanges.list(customer))[0].attachments).toEqual([UP]);
    const none = await exchanges.create(customer, { orderId: (await order([{ product: hat }])).id, fromSku: hat.id, fromName: 'Hat', toSku: 'ext:x', toName: 'Other hat' });
    expect(none.attachments).toEqual([]);
  });

  it('accepts the order line id instead of the item code, and tells two options of one product apart', async () => {
    const o = await order([{ product: shoe, variant: 'Size: 40' }, { product: shoe, variant: 'Size: 41' }]);
    const second = o.items.find((i) => i.variant === 'Size: 41')!;
    const ex = await exchanges.create(customer, { orderId: o.id, itemId: second.id, toSku: shoe.id, toName: 'Shoe', toVariant: 'Size: 42' });
    expect(ex).toMatchObject({ fromSku: shoe.id, fromName: 'Shoe', fromVariant: 'Size: 41', toVariant: 'Size: 42' });
    await expect(exchanges.create(customer, { orderId: o.id, itemId: 'nope', toSku: shoe.id, toName: 'Shoe' })).rejects.toThrow('not on this order');
    // The old way (item code) still works.
    const o2 = await order([{ product: hat }]);
    expect((await exchanges.create(customer, { orderId: o2.id, fromSku: hat.id, fromName: 'Hat', toSku: 'ext:1', toName: 'Hat 2' })).fromSku).toBe(hat.id);
  });

  it('refuses the same option, an option that does not exist, an item that is not on the order, and a second open exchange', async () => {
    const o = await order([{ product: shoe, variant: 'Size: 40' }]);
    await expect(exchanges.create(customer, base(o, { toVariant: 'Size: 40' }))).rejects.toThrow('different option');
    await expect(exchanges.create(customer, base(o, { toVariant: 'Size: 99' }))).rejects.toThrow();
    await expect(exchanges.create(customer, base(o, { fromSku: hat.id, toVariant: 'Size: 41' }))).rejects.toThrow('not on this order');
    await expect(exchanges.create({ ...customer, id: 'x' }, base(o, { toVariant: 'Size: 41' }))).rejects.toThrow('not eligible');
    await exchanges.create(customer, base(o, { toVariant: 'Size: 41' }));
    await expect(exchanges.create(customer, base(o, { toVariant: 'Size: 42' }))).rejects.toThrow('already asked');
  });

  it('a dearer product: the difference is worked out on the server and held from the wallet', async () => {
    const o = await order([{ product: hat, price: 10 }]);
    const ex = await exchanges.create(customer, { orderId: o.id, fromSku: hat.id, fromName: 'Hat', toSku: pricey.id, toName: 'Boot' });
    expect(ex).toMatchObject({ priceDiffUsd: 40, heldUsd: 40 });
    expect(walletCalls).toEqual([{ userId: 'c1', type: 'debit', amount: 40, description: `Exchange ${ex.reference}: price difference` }]);
    expect(walletBalance).toBe(60);
  });

  it('too little in the wallet: refused with a way forward, and nothing is saved', async () => {
    walletBalance = 10;
    const o = await order([{ product: hat, price: 10 }]);
    await expect(exchanges.create(customer, { orderId: o.id, fromSku: hat.id, fromName: 'Hat', toSku: pricey.id, toName: 'Boot' })).rejects.toThrow('Top up your wallet');
    expect(await ds.getRepository(Exchange).count()).toBe(0);
    expect(walletBalance).toBe(10);
  });

  it('rejecting gives the held difference back exactly once and frees the stock', async () => {
    const o = await order([{ product: hat, price: 10 }]);
    const ex = await exchanges.create(customer, { orderId: o.id, fromSku: hat.id, fromName: 'Hat', toSku: pricey.id, toName: 'Boot' });
    await expect(exchanges.respond(sellerOne, ex.id, false, 'no')).rejects.toThrow('why you are rejecting');
    const out = await exchanges.respond(sellerOne, ex.id, false, 'No boots left in that size');
    expect(out).toMatchObject({ status: 'rejected', heldUsd: 0 });
    expect(walletBalance).toBe(100);
    expect(walletCalls.map((c) => c.type)).toEqual(['debit', 'refund']);
    expect(walletCalls[1].description).toBe(`Exchange ${ex.reference} rejected: price difference returned`);
    expect(titles(customer.id)).toContain('Exchange rejected');
  });

  it('approving takes the new unit from the seller (the chosen option), asks logistics and tells everyone', async () => {
    const o = await order([{ product: shoe, variant: 'Size: 40' }]);
    const ex = await exchanges.create(customer, base(o, { toVariant: 'Size: 42' }));
    await expect(exchanges.respond(sellerTwo, ex.id, true, '')).rejects.toThrow('Exchange not found.');
    const out = await exchanges.respond(sellerOne, ex.id, true, '');
    expect(out).toMatchObject({ status: 'approved', stockTaken: 1, deliveryTaskId: 'task-1' });
    expect(reserves[0]).toEqual([shoe.id, 1, expect.objectContaining({ variant: 'Size: 42', reason: 'replacement' })]);
    expect(tasks).toEqual([{ exchangeId: ex.id, orderId: o.id }]);
    expect(titles(customer.id)).toContain('Exchange approved');
    expect(titles('role:warehouse_staff')).toContain('Exchange approved');
  });

  it('no stock to approve with: the request stays open', async () => {
    const o = await order([{ product: hat, price: 10 }]);
    const ex = await exchanges.create(customer, { orderId: o.id, fromSku: hat.id, fromName: 'Hat', toSku: pricey.id, toName: 'Boot' });
    stock.set(pricey.id, 0);
    await expect(exchanges.respond(sellerOne, ex.id, true, '')).rejects.toThrow('Not enough stock');
    expect((await exchanges.get(admin, ex.id)).status).toBe('requested');
  });

  it('a cheaper item pays the difference back when it is delivered, not before', async () => {
    const o = await order([{ product: pricey, price: 50 }]);
    const ex = await exchanges.create(customer, { orderId: o.id, fromSku: pricey.id, fromName: 'Boot', toSku: hat.id, toName: 'Hat' });
    expect(ex.priceDiffUsd).toBe(-40);
    expect(walletCalls).toEqual([]);
    await exchanges.respond(sellerOne, ex.id, true, '');
    expect(walletCalls).toEqual([]);
    expect((await exchanges.syncFromDelivery(ex.id, 'in_transit'))!.status).toBe('dispatched');
    const done = await exchanges.syncFromDelivery(ex.id, 'delivered');
    expect(done!.status).toBe('delivered');
    expect(walletCalls).toEqual([{ userId: 'c1', type: 'refund', amount: 40, description: `Exchange ${ex.reference}: price difference refunded` }]);
    await exchanges.syncFromDelivery(ex.id, 'delivered');
    expect(walletCalls).toHaveLength(1); // once
  });

  it('ops can settle an item outside the catalogue by hand; a customer’s is free text', async () => {
    const o = await order([{ product: hat }]);
    // a customer's request for an item outside the catalogue is free text: no price, no hold, no stock
    const free = await exchanges.create(customer, { orderId: o.id, fromSku: hat.id, fromName: 'Hat', toSku: 'B', toName: 'Bigger one', priceDiffUsd: 99 });
    expect(free).toMatchObject({ priceDiffUsd: 0, heldUsd: 0 });
    expect((await exchanges.respond(sellerOne, free.id, true, '')).status).toBe('approved');
    expect(reserves).toHaveLength(0);
    await ds.getRepository(Exchange).update({ id: free.id }, { status: 'rejected' });
    const ex = await exchanges.create(admin, { orderId: o.id, fromSku: hat.id, fromName: 'Hat', toSku: 'ext:1', toName: 'Special', priceDiffUsd: 12.5 });
    expect(ex.priceDiffUsd).toBe(12.5);
    // staff filing for a customer move no money: finance settles it
    const o2 = await order([{ product: hat, price: 10 }]);
    const byStaff = await exchanges.create(admin, { orderId: o2.id, fromSku: hat.id, fromName: 'Hat', toSku: pricey.id, toName: 'Boot' });
    expect(byStaff).toMatchObject({ priceDiffUsd: 40, heldUsd: 0 });
    expect(walletCalls).toEqual([]);
  });

  it('the seller sees a first name and no customer id; the customer and staff see the whole row', async () => {
    const o = await order([{ product: shoe, variant: 'Size: 40' }]);
    const ex = await exchanges.create(customer, base(o, { toVariant: 'Size: 41' }));
    expect(await exchanges.list(sellerOne)).toEqual([expect.not.objectContaining({ customerId: expect.anything() })]);
    expect((await exchanges.list(sellerOne))[0].customerName).toBe('Marie');
    expect(await exchanges.list(sellerTwo)).toEqual([]);
    expect((await exchanges.list(customer))[0].customerId).toBe('c1');
    expect(emitter.sent.filter((e) => e.to === 'user:su1' && e.event === 'exchange:updated').every((e) => !('customerId' in (e.payload as object)))).toBe(true);
    expect((await exchanges.get(admin, ex.id)).customerId).toBe('c1');
  });
});
