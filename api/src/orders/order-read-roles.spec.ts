import { DeliveryTask, Hub, Order, OrderItem, User } from '../database/entities';
import { commerceWorld } from '../testing/commerce-db';
import type { World } from '../testing/commerce-db';
import { OrdersService } from './orders.service';
import { ORDER_ACCESS_DENIED, orderAudienceOf, withoutAddress } from '../common/order-access';
import { pushOrderToOps } from '../logistics/hub-scope';
import { RealtimeEmitter } from '../realtime/realtime-emitter';

/**
 * Who reads an order, and how much of it. The delivery address (and the phone inside it) is the customer's: the super admin,
 * operations and warehouse staff of the order's warehouse see it, support sees it read-only (it answers tickets, disputes and
 * returns about a delivery), finance and moderation see the amounts and lines without it, marketing sees no order at all.
 */
let w: World;
let orders: OrdersService;
const ADDRESS = JSON.stringify({ line1: '12 Rue du Lac', city: 'Kinshasa', commune: 'Gombe', phone: '+243990000001' });

beforeEach(async () => {
  w = await commerceWorld();
  const notifications = { toUser: async () => undefined, toRole: async () => undefined, toAdmins: async () => undefined, toUsers: async () => undefined };
  orders = new OrdersService(
    w.ds.getRepository(Order),
    w.ds.getRepository(DeliveryTask),
    w.ds.getRepository('Seller') as never,
    { registerFailedHandler: () => undefined } as never,
    w.products,
    notifications as never,
    w.emitter as never,
    { registerOrderSettledHandler: () => undefined } as never,
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

async function mkOrder(over: Partial<Order> = {}) {
  const repo = w.ds.getRepository(Order);
  return repo.save(
    repo.create({
      reference: `SOM-${Math.floor(Math.random() * 1e8)}`,
      customerId: 'cust-1',
      customerName: 'Jean Mukendi',
      status: 'confirmed',
      totalUsd: 25,
      shippingAddress: ADDRESS,
      items: [{ productId: 'ext:item', productName: 'Thing', variant: 'Default', qty: 1, priceUsd: 25, sellerId: 's1' }] as OrderItem[],
      ...over,
    }),
  );
}
const asRole = (role: string) => ({ id: `${role}-1`, role });

describe('orders.list by admin role', () => {
  it.each(['admin', 'admin_operations', 'admin_support'])('%s reads the order with its address', async (role) => {
    await mkOrder();
    const [o] = (await orders.list(asRole(role))) as Order[];
    expect(o.shippingAddress).toBe(ADDRESS);
    expect(o.totalUsd).toBe(25);
  });

  it.each(['admin_finance', 'admin_moderation'])('%s reads the amounts, lines and status but never the address or the phone in it', async (role) => {
    const saved = await mkOrder();
    const [o] = (await orders.list(asRole(role))) as Order[];
    expect(o).toMatchObject({ id: saved.id, reference: saved.reference, totalUsd: 25, status: 'confirmed', customerName: 'Jean Mukendi', shippingAddress: null });
    expect(o.items).toHaveLength(1);
    expect(JSON.stringify(o)).not.toContain('Rue du Lac');
    expect(JSON.stringify(o)).not.toContain('+243990000001');
    // reading it did not wipe the stored address
    expect((await w.ds.getRepository(Order).findOneByOrFail({ id: saved.id })).shippingAddress).toBe(ADDRESS);
  });

  it('marketing reads no order at all', async () => {
    await mkOrder();
    await expect(orders.list(asRole('admin_marketing'))).rejects.toThrow(ORDER_ACCESS_DENIED);
  });

  it('warehouse staff read their own warehouse’s orders in full; a customer reads their own; an unknown role reads nothing', async () => {
    const hub = await w.ds.getRepository(Hub).save(w.ds.getRepository(Hub).create({ name: 'Gombe', city: 'Kinshasa' }));
    const other = await w.ds.getRepository(Hub).save(w.ds.getRepository(Hub).create({ name: 'Limete', city: 'Kinshasa' }));
    const mine = await mkOrder({ destinationHubId: hub.id });
    await mkOrder({ destinationHubId: other.id });
    const rows = (await orders.list(asRole('warehouse_staff'), undefined, undefined, hub.id)) as Order[];
    expect(rows.map((o) => o.id)).toEqual([mine.id]);
    expect(rows[0].shippingAddress).toBe(ADDRESS);
    expect(await orders.list(asRole('guest'))).toEqual([]);
  });
});

describe('order access and pushes', () => {
  it('the audience of each role', () => {
    expect(['admin', 'admin_operations', 'admin_support', 'admin_finance', 'admin_marketing', 'admin_moderation'].map((r) => orderAudienceOf(r))).toEqual(['full', 'full', 'full', 'amounts', 'none', 'amounts']);
  });

  it('withoutAddress copies: the original keeps its address', () => {
    const o = { id: 'o1', shippingAddress: ADDRESS };
    expect(withoutAddress(o)).toEqual({ id: 'o1', shippingAddress: null });
    expect(o.shippingAddress).toBe(ADDRESS);
  });

  it('a pushed order reaches operations and support in full, finance and moderation without the address, marketing not at all', () => {
    const sent: { to: string; event: string; payload: { shippingAddress: string | null } }[] = [];
    const rec = (r: string[], event: string, payload: never) => void sent.push({ to: r.join(','), event, payload });
    const emitter = { toRoles: rec, toRolesOnly: rec, toHub: () => undefined };
    pushOrderToOps(emitter as never, 'order:created', { destinationHubId: null, originHubIds: null, shippingAddress: ADDRESS });
    expect(sent.map((s) => [s.to, s.payload.shippingAddress])).toEqual([
      ['admin,admin_operations,admin_support', ADDRESS],
      ['admin_finance,admin_moderation', null],
    ]);
    expect(sent.map((s) => s.to).join(',')).not.toContain('admin_marketing');
  });

  it('the sellers\' fan-out hears about an order once, from the full order (not again from the copy without the address)', () => {
    const emitter = new RealtimeEmitter();
    const heard: { event: string; shippingAddress: string | null }[] = [];
    emitter.registerFanout(['order:updated'], (event, payload) => void heard.push({ event, shippingAddress: (payload as { shippingAddress: string | null }).shippingAddress }));
    pushOrderToOps(emitter, 'order:updated', { destinationHubId: null, originHubIds: null, shippingAddress: ADDRESS });
    expect(heard).toEqual([{ event: 'order:updated', shippingAddress: ADDRESS }]);
  });
});
