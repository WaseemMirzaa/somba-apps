import { DeliveryTask, Hub, Order, OrderItem, User } from '../database/entities';
import { commerceWorld } from '../testing/commerce-db';
import type { World } from '../testing/commerce-db';
import { OrdersService } from './orders.service';

/**
 * A-04: cancelling an order restocks it and refunds the prepaid money to the wallet. The customer may cancel their
 * own; staff only through the operator path (`orders:adminCancel` / `orders:updateStatus` -> cancelled), and only the
 * operator roles. An admin sub-role calling the customer path on someone else's order is told it does not exist.
 */
let w: World;
let orders: OrdersService;
let refunds: string[];
const owner = { id: 'cust-1', role: 'customer' };

beforeEach(async () => {
  w = await commerceWorld();
  refunds = [];
  const payments = {
    registerOrderSettledHandler: () => undefined,
    forOrder: async () => null,
    refundCancelledOrder: async (o: Order) => (refunds.push(o.id), 25),
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
    { getBalance: async () => 1000 } as never,
    w.promos,
    { get: async (k: string) => w.settings[k] ?? null } as never,
    w.ds.getRepository(Hub),
    w.ds.getRepository(User),
    undefined,
    { planOrder: async () => undefined, staffIds: async () => [], voidOrderTasks: async () => undefined } as never,
    { route: async () => ({}) } as never,
  );
});
afterEach(async () => w.ds.destroy());

async function paidOrder(status: Order['status'] = 'confirmed') {
  const repo = w.ds.getRepository(Order);
  return repo.save(
    repo.create({
      reference: `SOM-${Math.floor(Math.random() * 1e8)}`,
      customerId: owner.id,
      customerName: 'Jean Mukendi',
      status,
      totalUsd: 25,
      items: [{ productId: 'ext:item', productName: 'Thing', variant: 'Default', qty: 1, priceUsd: 25, sellerId: 's1' }] as OrderItem[],
    }),
  );
}
const statusOf = async (id: string) => (await w.ds.getRepository(Order).findOneByOrFail({ id })).status;

describe('orders.cancel (the customer path)', () => {
  it('the owner cancels their own order and is refunded', async () => {
    const o = await paidOrder();
    expect((await orders.cancel(owner, o.id)).status).toBe('cancelled');
    expect(refunds).toEqual([o.id]);
  });

  it('another customer cannot cancel it', async () => {
    const o = await paidOrder();
    await expect(orders.cancel({ id: 'cust-2', role: 'customer' }, o.id)).rejects.toThrow('Order not found.');
    expect(await statusOf(o.id)).toBe('confirmed');
    expect(refunds).toEqual([]);
  });

  it.each(['admin', 'admin_operations', 'admin_finance', 'admin_support', 'admin_marketing', 'admin_moderation', 'warehouse_staff', 'seller', 'rider'])(
    '%s cannot cancel (and refund) a customer’s order through the customer path',
    async (role) => {
      const o = await paidOrder();
      await expect(orders.cancel({ id: `${role}-1`, role }, o.id)).rejects.toThrow('Order not found.');
      expect(await statusOf(o.id)).toBe('confirmed');
      expect(refunds).toEqual([]);
    },
  );
});

describe('the operator path', () => {
  it.each(['admin', 'admin_operations'])('%s cancels with a reason', async (role) => {
    const o = await paidOrder();
    expect((await orders.adminCancel({ id: `${role}-1`, role }, o.id, 'Customer called')).status).toBe('cancelled');
    expect(refunds).toEqual([o.id]);
  });

  it.each(['admin_finance', 'admin_support', 'admin_marketing', 'admin_moderation', 'warehouse_staff'])('%s cannot use it', async (role) => {
    const o = await paidOrder();
    await expect(orders.adminCancel({ id: `${role}-1`, role }, o.id, 'Customer called')).rejects.toThrow('Order not found.');
    expect(await statusOf(o.id)).toBe('confirmed');
  });
});
