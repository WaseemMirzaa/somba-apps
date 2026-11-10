import { DeliveryTask, Hub, Order, OrderItem, User } from '../database/entities';
import { PART_DELIVERED, anyDelivered, isPartiallyDelivered, lineShareUsd } from '../common/delivery/split';
import { commerceWorld } from '../testing/commerce-db';
import type { World } from '../testing/commerce-db';
import { OrdersService } from './orders.service';

/**
 * A split order: once any line reached the customer the order cannot be cancelled (by the customer, or by an operator), because a
 * cancel would restock and refund goods the customer already holds. Support stops the rest by hand.
 */
let w: World;
let orders: OrdersService;
const owner = { id: 'cust-1', role: 'customer' };
const operator = { id: 'op-1', role: 'admin_operations' };
const refunds: string[] = [];

beforeEach(async () => {
  w = await commerceWorld();
  refunds.length = 0;
  const payments = { registerOrderSettledHandler: () => undefined, forOrder: async () => null, refundCancelledOrder: async (o: Order) => (refunds.push(o.id), 0) };
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

const line = (name: string, deliveredAt: Date | null, fulfilment: OrderItem['fulfilment'] = 'received') =>
  ({ productId: `ext:${name}`, productName: name, variant: 'Default', qty: 1, priceUsd: 10, sellerId: `s-${name}`, fulfilment, deliveredAt }) as unknown as OrderItem;
async function order(lines: OrderItem[], status: Order['status'] = 'processing') {
  const repo = w.ds.getRepository(Order);
  return repo.save(repo.create({ reference: `SOM-${Math.floor(Math.random() * 1e8)}`, customerId: owner.id, customerName: 'Jean', status, totalUsd: 20, items: lines }));
}
const statusOf = async (id: string) => (await w.ds.getRepository(Order).findOneByOrFail({ id })).status;

describe('cancelling a partly delivered order', () => {
  it('is refused for the customer and for an operator, with the support sentence, and changes nothing', async () => {
    const o = await order([line('a', new Date()), line('b', null)]);
    await expect(orders.cancel(owner, o.id, { allowProcessing: true })).rejects.toThrow(PART_DELIVERED);
    await expect(orders.adminCancel(operator, o.id, 'Customer asked')).rejects.toThrow('Part of this order was already delivered. Contact support to stop the rest.');
    expect(await statusOf(o.id)).toBe('processing');
    expect(refunds).toEqual([]);
  });

  it('an order with nothing delivered yet is cancelled as before', async () => {
    const o = await order([line('a', null), line('b', null)], 'confirmed');
    expect((await orders.cancel(owner, o.id)).status).toBe('cancelled');
  });

  it('lines the seller cancelled do not count: delivered + cancelled is a finished order, not a partial one', async () => {
    expect(isPartiallyDelivered([{ fulfilment: 'received', deliveredAt: new Date() }, { fulfilment: 'cancelled', deliveredAt: null }])).toBe(false);
    expect(isPartiallyDelivered([{ fulfilment: 'received', deliveredAt: new Date() }, { fulfilment: 'received', deliveredAt: null }])).toBe(true);
    expect(isPartiallyDelivered([{ fulfilment: 'received', deliveredAt: null }])).toBe(false);
    expect(anyDelivered([{ fulfilment: 'received', deliveredAt: new Date() }])).toBe(true);
    expect(anyDelivered([{ fulfilment: 'cancelled', deliveredAt: new Date() }])).toBe(false);
  });
});

describe('a leg\'s share of the money', () => {
  it('is its lines\' value less their pro-rata share of the discount, to the cent (the rule a seller\'s part-cancel refunds by)', () => {
    expect(lineShareUsd({ subtotalUsd: 20, discountUsd: 2 }, 10)).toBe(9);
    expect(lineShareUsd({ subtotalUsd: 30, discountUsd: 1 }, 10)).toBe(9.67);
    expect(lineShareUsd({ subtotalUsd: 0, discountUsd: 5 }, 10)).toBe(10);
    expect(lineShareUsd({ subtotalUsd: 20 }, 10)).toBe(10);
  });
});
