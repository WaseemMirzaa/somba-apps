import { DataSource } from 'typeorm';
import { Exchange, Order, OrderItem, Product, Seller } from '../database/entities';
import { addProduct, recordingEmitter, testDb } from '../testing/test-db';
import { EXCHANGE_NEEDS_WALLET, ExchangesService } from './exchanges.service';

/**
 * The wallet switch and exchanges: with the wallet OFF a customer cannot file an exchange that costs more (the difference is
 * paid from the wallet), and a cheaper item's difference goes back to the original payment method (through the registered refunder)
 * instead of the wallet; when no refunder takes it, the wallet is credited as always so the money is never lost.
 */
let ds: DataSource;
let settingValue: string | null = 'false';
let walletCalls: { userId: string; type: string; amount: number }[];
let exchanges: ExchangesService;
let hat: Product;
let pricey: Product;
let s1: Seller;

const customer = { id: 'c1', name: 'Marie Dubois', role: 'customer' };
const sellerOne = { id: 'su1', name: 'Seller', role: 'seller' };
const support = { id: 'sp1', name: 'Support', role: 'admin_support' };
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
  settingValue = 'false';
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
    { get: async (k: string) => (k === 'walletEnabled' ? settingValue : null) } as never,
    { replacementDelivery: async () => ({ id: 'task-1' }) } as never,
  );
});
afterEach(async () => ds.destroy());

/** Walk an approved exchange to delivered the way the warehouse desk does. */
async function deliver(id: string, by = staff('admin_operations')) {
  for (const s of ['received', 'ready', 'dispatched', 'delivered'] as const) await exchanges.setStatus(id, s, by);
}

const credits = () => walletCalls.filter((c) => c.type === 'refund').map((c) => c.amount);

describe('wallet off: exchanges', () => {
  it('an exchange that costs more is refused with the clear sentence: nothing is filed, no wallet is touched', async () => {
    const o = await order([{ product: hat, price: 10 }]);
    await expect(exchanges.create(customer, { orderId: o.id, fromSku: hat.id, fromName: 'Hat', toSku: pricey.id, toName: 'Boot' })).rejects.toThrow(EXCHANGE_NEEDS_WALLET);
    expect(await ds.getRepository(Exchange).count()).toBe(0);
    expect(walletCalls).toEqual([]);
  });

  it('wallet on: the same exchange is filed and the difference is charged to the wallet', async () => {
    settingValue = 'true';
    const o = await order([{ product: hat, price: 10 }]);
    const ex = await exchanges.create(customer, { orderId: o.id, fromSku: hat.id, fromName: 'Hat', toSku: pricey.id, toName: 'Boot' });
    expect(ex.priceDiffUsd).toBe(40);
    expect(walletCalls.map((c) => c.type)).toEqual(['debit']);
  });

  it('a cheaper item: the difference goes back through the refunder, not into the wallet', async () => {
    const asked: number[] = [];
    exchanges.registerDifferenceRefunder(async (_ex, usd) => (asked.push(usd), true));
    const o = await order([{ product: pricey, price: 50 }]);
    const ex = await exchanges.create(customer, { orderId: o.id, fromSku: pricey.id, fromName: 'Boot', toSku: hat.id, toName: 'Hat' });
    await exchanges.respond(support, ex.id, true, '');
    await deliver(ex.id);
    expect(asked).toEqual([40]);
    expect(credits()).toEqual([]);
  });

  it('a cheaper item the refunder does not take (an order paid with the wallet) is credited to the wallet as always', async () => {
    exchanges.registerDifferenceRefunder(async () => false);
    const o = await order([{ product: pricey, price: 50 }]);
    const ex = await exchanges.create(customer, { orderId: o.id, fromSku: pricey.id, fromName: 'Boot', toSku: hat.id, toName: 'Hat' });
    await exchanges.respond(support, ex.id, true, '');
    await deliver(ex.id);
    expect(credits()).toEqual([40]);
  });
});
