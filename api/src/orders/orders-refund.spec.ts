import { DeliveryTask, Hub, Order, OrderItem, Payment, PaymentRefund, User, WalletTransaction } from '../database/entities';
import type { Seller } from '../database/entities';
import { refundTooMuch } from '../payments/refund-ledger';
import { commerceWorld } from '../testing/commerce-db';
import type { World } from '../testing/commerce-db';
import { WalletService } from '../wallet/wallet.service';
import { OrdersService } from './orders.service';

/** C-refund on the seller's side: cancelling lines of a paid order refunds them through the same ledger and the same cap. */
const ROUTE = { feeUsd: 0, deliveryUsd: 0, transferUsd: 0, distanceKm: 1, destinationHubId: 'h1', destinationHub: { id: 'h1', name: 'H', city: 'C' }, originHubIds: [], originBySeller: {}, transfer: false, pinned: true, fallback: null };

let w: World;
let shop: Seller;
let orders: OrdersService;
let customer: User;
let wallet: WalletService;

beforeEach(async () => {
  w = await commerceWorld();
  shop = await w.store('Kinshasa Traders', 'u-kt');
  customer = await w.ds.getRepository(User).save(w.ds.getRepository(User).create({ emailHash: 'c1', email: 'c@x.test', passwordHash: 'x', name: 'Marie', role: 'customer', walletBalance: 0 }));
  wallet = new WalletService(w.ds.getRepository(User), w.ds.getRepository(WalletTransaction), w.emitter as never);
  const payments = {
    registerOrderSettledHandler: () => undefined,
    assertMethodAllowed: async () => undefined,
    processForOrder: async () => ({ status: 'succeeded', method: 'wallet' }),
    forOrder: (orderId: string) => w.ds.getRepository(Payment).findOne({ where: { orderId }, order: { createdAt: 'DESC' } }),
    refundCancelledOrder: async () => 0,
  };
  const notifications = { toUser: async () => undefined, toRole: async () => undefined, toAdmins: async () => undefined, toUsers: async () => undefined };
  orders = new OrdersService(
    w.ds.getRepository(Order),
    w.ds.getRepository(DeliveryTask),
    w.ds.getRepository('Seller') as never,
    { registerFailedHandler: () => undefined } as never,
    w.products,
    notifications as never,
    w.emitter as never,
    payments as never,
    wallet,
    w.promos,
    { get: async (k: string) => w.settings[k] ?? null } as never,
    w.ds.getRepository(Hub),
    w.ds.getRepository(User),
    undefined,
    { planOrder: async () => undefined, staffIds: async () => [], voidOrderTasks: async () => undefined, onSellerCancelled: async () => undefined } as never,
    { route: async () => ROUTE } as never,
  );
});
afterEach(async () => w.ds.destroy());

/** A confirmed, paid order with two lines ($20 and $10) from the same store. */
async function paidOrder() {
  const a = await w.product(shop, { name: 'Shoes', price: 20, stock: 10 });
  const b = await w.product(shop, { name: 'Socks', price: 10, stock: 10 });
  const o = await orders.create({ id: customer.id, name: 'Marie' }, { items: [{ productId: a.id, qty: 1 }, { productId: b.id, qty: 1 }], paymentMethod: 'stripe_card' });
  await w.ds.getRepository(Order).update({ id: o.id }, { status: 'confirmed' });
  const payment = await w.ds.getRepository(Payment).save(
    w.ds.getRepository(Payment).create({ reference: 'PAY-1', orderId: o.id, orderReference: o.reference, userId: customer.id, method: 'stripe_card', amountUsd: 30, status: 'succeeded' }),
  );
  const fresh = await w.ds.getRepository(Order).findOneByOrFail({ id: o.id });
  return { order: fresh, payment, shoes: fresh.items.find((i) => i.productName === 'Shoes')!, socks: fresh.items.find((i) => i.productName === 'Socks')! };
}
const ledger = () => w.ds.getRepository(PaymentRefund).find();
const balance = async () => (await w.ds.getRepository(User).findOneByOrFail({ id: customer.id })).walletBalance;

describe('a seller cancelling lines of a paid order', () => {
  it('refunds them to the wallet and records the refund on the payment and in the ledger', async () => {
    const { order, payment, shoes } = await paidOrder();
    await orders.sellerCancel({ id: 'u-kt' }, order.id, 'Out of stock', [shoes.id]);
    expect(await balance()).toBe(20);
    expect(await ledger()).toEqual([expect.objectContaining({ paymentId: payment.id, orderId: order.id, amountUsd: 20, refundTo: 'wallet', kind: 'seller_cancel', memo: `Refund: seller cancelled part of ${order.reference}` })]);
    expect(await w.ds.getRepository(Payment).findOneByOrFail({ id: payment.id })).toMatchObject({ status: 'succeeded', refundedUsd: 20 });
    expect((await w.ds.getRepository(OrderItem).findOneByOrFail({ id: shoes.id })).refundedUsd).toBe(20);
  });

  it('can never refund more than is left on the payment: the cancel is refused and nothing changes', async () => {
    const { order, payment, shoes } = await paidOrder();
    await w.ds.getRepository(Payment).update({ id: payment.id }, { refundedUsd: 25 }); // $25 of the $30 already went back (a return)
    await expect(orders.sellerCancel({ id: 'u-kt' }, order.id, 'Out of stock', [shoes.id])).rejects.toThrow(refundTooMuch(5));
    expect(await balance()).toBe(0);
    expect(await ledger()).toEqual([]);
    expect((await w.ds.getRepository(OrderItem).findOneByOrFail({ id: shoes.id })).fulfilment).toBe('open'); // the whole step rolled back
    expect((await w.ds.getRepository(Payment).findOneByOrFail({ id: payment.id })).refundedUsd).toBe(25);
  });
});
