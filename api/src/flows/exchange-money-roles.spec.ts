import { DataSource } from 'typeorm';
import { Exchange, Order, OrderItem, Product, Seller } from '../database/entities';
import { addProduct, recordingEmitter, testDb } from '../testing/test-db';
import { ExchangesService } from './exchanges.service';

/**
 * A-03: an exchange is a money path (a cheaper item refunds the difference to the customer's wallet when it is
 * delivered). Only the customer, the seller and the exchange desk may move one, the amount is always the server's own
 * price arithmetic, and a refund-bearing exchange is never filed or approved by a department that does not own it.
 */
let ds: DataSource;
let walletCalls: { userId: string; type: string; amount: number }[];
let exchanges: ExchangesService;
let hat: Product;
let pricey: Product;
let s1: Seller;

const customer = { id: 'c1', name: 'Marie Dubois', role: 'customer' };
const sellerOne = { id: 'su1', name: 'Seller', role: 'seller' };
const staff = (role: string) => ({ id: `${role}-1`, name: `${role} name`, role });

async function order(lines: { product: Product; price?: number }[], status: Order['status'] = 'delivered') {
  const repo = ds.getRepository(Order);
  return repo.save(
    repo.create({
      reference: `SOM-${Math.floor(Math.random() * 1e8)}`,
      customerId: customer.id,
      customerName: customer.name,
      status,
      totalUsd: 50,
      items: lines.map((l) => ({ productId: l.product.id, productName: l.product.name, variant: 'Default', qty: 1, priceUsd: l.price ?? l.product.price, sellerId: s1.id })) as OrderItem[],
    }),
  );
}

beforeEach(async () => {
  ds = await testDb();
  walletCalls = [];
  s1 = await ds.getRepository(Seller).save(ds.getRepository(Seller).create({ name: 'One', userId: sellerOne.id, status: 'approved' }));
  hat = await addProduct(ds, { name: 'Hat', price: 10, stock: 5, sellerId: s1.id });
  pricey = await addProduct(ds, { name: 'Boot', price: 50, stock: 5, sellerId: s1.id });
  const products = {
    getRaw: async (id: string) => ds.getRepository(Product).findOneBy({ id }),
    get: async (id: string) => ds.getRepository(Product).findOneBy({ id }),
    availableFor: async () => 99,
    reserve: async () => true,
    restock: async () => undefined,
    names: async () => new Map(),
  };
  const wallet = {
    apply: async (userId: string, type: string, amount: number) => void walletCalls.push({ userId, type, amount }),
  };
  const notifications = { toUser: async () => undefined, toRole: async () => undefined };
  exchanges = new ExchangesService(
    ds.getRepository(Exchange),
    ds.getRepository(Order),
    ds.getRepository(Seller),
    notifications as never,
    recordingEmitter() as never,
    products as never,
    { frenchNames: async (refs: unknown[]) => refs.map(() => null) } as never,
    wallet as never,
    { get: async () => null } as never,
    { replacementDelivery: async () => ({ id: 'task-1' }) } as never,
  );
});
afterEach(async () => ds.destroy());

/** Walk an approved exchange to delivered the way the warehouse desk does. */
async function deliver(id: string, by = staff('admin_operations')) {
  for (const s of ['received', 'ready', 'dispatched', 'delivered'] as const) await exchanges.setStatus(id, s, by);
}

const credits = () => walletCalls.filter((c) => c.type === 'refund').map((c) => c.amount);

describe('filing an exchange for someone else (A-03)', () => {
  it.each(['admin_marketing', 'admin_moderation', 'admin_support', 'admin_finance', 'warehouse_staff'])(
    '%s cannot file an exchange on a customer’s order, whatever price difference it sends',
    async (role) => {
      const o = await order([{ product: hat }]);
      await expect(
        exchanges.create(staff(role), { orderId: o.id, fromSku: hat.id, fromName: 'Hat', toSku: 'ext:gift', toName: 'Anything', priceDiffUsd: -100000 }),
      ).rejects.toThrow('Order not found or not eligible for an exchange.');
      expect(await ds.getRepository(Exchange).count()).toBe(0);
    },
  );

  it('the desk can file one, but a client-sent price difference is ignored: an item outside the catalogue moves no money', async () => {
    const o = await order([{ product: hat }]);
    for (const priceDiffUsd of [-100000, -0.01, 12.5, 1e12, Number.NaN]) {
      await ds.getRepository(Exchange).clear();
      const ex = await exchanges.create(staff('admin'), { orderId: o.id, fromSku: hat.id, fromName: 'Hat', toSku: 'ext:1', toName: 'Special', priceDiffUsd });
      expect(ex.priceDiffUsd).toBe(0);
    }
    const ex = (await ds.getRepository(Exchange).findOneByOrFail({ orderId: o.id }))!;
    await exchanges.setStatus(ex.id, 'approved', staff('admin_operations'));
    await deliver(ex.id);
    expect(walletCalls).toEqual([]);
  });

  it('the credited amount is the server’s price difference, never the one the client sent (customer and desk alike)', async () => {
    const o = await order([{ product: pricey, price: 50 }]);
    const ex = await exchanges.create(customer, { orderId: o.id, fromSku: pricey.id, fromName: 'Boot', toSku: hat.id, toName: 'Hat', priceDiffUsd: -100000 });
    expect(ex.priceDiffUsd).toBe(-40);
    await exchanges.respond(sellerOne, ex.id, true, '');
    await deliver(ex.id);
    expect(credits()).toEqual([40]);

    walletCalls = [];
    const o2 = await order([{ product: pricey, price: 50 }]);
    const byAdmin = await exchanges.create(staff('admin'), { orderId: o2.id, fromSku: pricey.id, fromName: 'Boot', toSku: hat.id, toName: 'Hat', priceDiffUsd: 1e9 });
    expect(byAdmin.priceDiffUsd).toBe(-40);
    await exchanges.respond(staff('admin'), byAdmin.id, true, '');
    await deliver(byAdmin.id);
    expect(credits()).toEqual([40]);
  });

  it('operations may file for a customer, but not one that refunds money to the wallet (that is finance’s call)', async () => {
    const o = await order([{ product: pricey, price: 50 }]);
    await expect(
      exchanges.create(staff('admin_operations'), { orderId: o.id, fromSku: pricey.id, fromName: 'Boot', toSku: hat.id, toName: 'Hat' }),
    ).rejects.toThrow("Only finance can file an exchange that refunds money to the customer's wallet.");
    // The same desk can still file a swap that moves no money back.
    const same = await exchanges.create(staff('admin_operations'), { orderId: o.id, fromSku: pricey.id, fromName: 'Boot', toSku: pricey.id, toName: 'Boot' });
    expect(same.priceDiffUsd).toBe(0);
  });

  it('the desk too must name a line that is on the order, and the order must have been delivered', async () => {
    const o = await order([{ product: hat }]);
    await expect(exchanges.create(staff('admin'), { orderId: o.id, fromSku: pricey.id, fromName: 'Boot', toSku: hat.id, toName: 'Hat' })).rejects.toThrow(
      'That item is not on this order.',
    );
    const cancelled = await order([{ product: pricey }], 'cancelled');
    await expect(
      exchanges.create(staff('admin'), { orderId: cancelled.id, fromSku: pricey.id, fromName: 'Boot', toSku: hat.id, toName: 'Hat' }),
    ).rejects.toThrow('Order not found or not eligible for an exchange.');
  });
});

describe('approving and moving an exchange (A-03)', () => {
  async function cheaperSwap() {
    const o = await order([{ product: pricey, price: 50 }]);
    return exchanges.create(customer, { orderId: o.id, fromSku: pricey.id, fromName: 'Boot', toSku: hat.id, toName: 'Hat' });
  }

  it.each(['admin_marketing', 'admin_moderation', 'admin_finance', 'warehouse_staff', 'customer'])('%s cannot approve an exchange', async (role) => {
    const ex = await cheaperSwap();
    await expect(exchanges.respond(staff(role), ex.id, true, '')).rejects.toThrow('Exchange not found.');
    expect((await ds.getRepository(Exchange).findOneByOrFail({ id: ex.id })).status).toBe('requested');
  });

  it('support may decide for a silent seller, but not approve one that refunds money; operations may', async () => {
    const ex = await cheaperSwap();
    await expect(exchanges.respond(staff('admin_support'), ex.id, true, '')).rejects.toThrow(
      "Only operations can approve an exchange that refunds money to the customer's wallet.",
    );
    expect((await exchanges.respond(staff('admin_operations'), ex.id, true, '')).status).toBe('approved');
    // Support can still reject it, and approve one that moves no money back.
    const other = await cheaperSwap();
    expect((await exchanges.respond(staff('admin_support'), other.id, false, 'Customer changed their mind')).status).toBe('rejected');
    const o = await order([{ product: hat }]);
    const free = await exchanges.create(customer, { orderId: o.id, fromSku: hat.id, fromName: 'Hat', toSku: 'ext:x', toName: 'Other hat' });
    expect((await exchanges.respond(staff('admin_support'), free.id, true, '')).status).toBe('approved');
  });

  it.each(['admin_marketing', 'admin_moderation', 'admin_support', 'admin_finance', 'customer', 'seller'])(
    '%s cannot move an exchange to delivered (no wallet credit)',
    async (role) => {
      const ex = await cheaperSwap();
      await exchanges.respond(sellerOne, ex.id, true, '');
      await expect(exchanges.setStatus(ex.id, 'delivered', staff(role))).rejects.toThrow('Ops only.');
      expect(walletCalls).toEqual([]);
    },
  );

  it('the desk and the warehouse move it, and delivery credits exactly the server’s difference once', async () => {
    const ex = await cheaperSwap();
    await exchanges.respond(sellerOne, ex.id, true, '');
    await exchanges.setStatus(ex.id, 'received', staff('warehouse_staff'));
    for (const s of ['ready', 'dispatched', 'delivered'] as const) await exchanges.setStatus(ex.id, s, staff('admin'));
    expect(credits()).toEqual([40]);
    await expect(exchanges.setStatus(ex.id, 'delivered', staff('admin'))).rejects.toThrow();
    expect(credits()).toEqual([40]);
  });
});
