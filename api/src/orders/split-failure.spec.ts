import { DataSource } from 'typeorm';
import { DeliveryTask, ENTITIES, Hub, Order, OrderItem, Payment, Product, Seller, User, WalletTransaction } from '../database/entities';
import { DeliveryService } from '../delivery/delivery.service';
import { LogisticsService } from '../logistics/logistics.service';
import type { Actor } from '../logistics/logistics.service';
import { LanesService } from '../logistics/lanes.service';
import { WalletService } from '../wallet/wallet.service';
import { geoWorld } from '../testing/geo-world';
import { OrdersService } from './orders.service';

/**
 * A delivery that fails on a split order (B11): below the limit the leg is planned again and the order keeps its status when part of
 * it was delivered; at the limit only the leg's lines are cancelled (refunded, or less cash to collect), restocked and sent back to
 * their sellers, and the rest of the order carries on. Real logistics, delivery and orders services over an in-memory schema.
 */
describe('split order: a customer leg that fails', () => {
  let ds: DataSource;
  let logistics: LogisticsService;
  let delivery: DeliveryService;
  let orders: OrdersService;
  let world: Awaited<ReturnType<typeof geoWorld>>;
  let rider: User;
  let customer: User;
  let sellerA: Seller;
  let sellerB: Seller;
  let seq = 0;
  const restock = jest.fn(async () => undefined);
  const told: { to: string; title: string; body: string }[] = [];
  const notif = {
    toUser: jest.fn(async (to: string, n: { title: string; body: string }) => void told.push({ to, title: n.title, body: n.body })),
    toUsers: jest.fn(async () => undefined),
    toAdmins: jest.fn(async () => undefined),
    toRole: jest.fn(async () => undefined),
  };
  const emitter = { toUser: jest.fn(), toRoles: jest.fn(), toRolesOnly: jest.fn(), toHub: jest.fn(), registerFanout: jest.fn(), registerUserView: jest.fn() };
  const markCollected = jest.fn(async () => undefined);
  const admin: Actor = { id: 'a1', role: 'admin', name: 'Admin', hubId: null, tier: null };
  const hours = (h: number) => new Date(Date.now() + h * 3_600_000);
  let gombe: Hub;

  const tasks = (orderId: string) => ds.getRepository(DeliveryTask).find({ where: { orderId }, order: { createdAt: 'ASC', id: 'ASC' } });
  const legs = async (orderId: string) => (await tasks(orderId)).filter((t) => t.kind === 'delivery');
  const openLeg = async (orderId: string) => (await legs(orderId)).find((t) => ['unassigned', 'assigned', 'picked_up', 'in_transit'].includes(t.status))!;
  const order = (id: string) => ds.getRepository(Order).findOneOrFail({ where: { id } });
  const balance = async () => (await ds.getRepository(User).findOneByOrFail({ id: customer.id })).walletBalance;
  const scan = async (taskId: string) => {
    await ds.getRepository(DeliveryTask).update({ id: taskId }, { status: 'picked_up' });
    return logistics.onScanIn(taskId, gombe.id);
  };
  const fail = (taskId: string, reason = 'Customer not reachable') => delivery.updateStatus(taskId, 'failed', rider.id, reason);

  /** Two sellers in Gombe, each with a $10 line; both parcels scanned in only on request. `cod` = cash on delivery. */
  async function place(opts: { cod?: boolean } = {}) {
    const n = ++seq;
    const o = await ds.getRepository(Order).save(
      ds.getRepository(Order).create({
        reference: `SOM-${n}`,
        customerId: customer.id,
        customerName: 'Marie Dubois',
        status: 'confirmed',
        paymentMethod: opts.cod ? 'cod' : 'stripe_card',
        subtotalUsd: 20,
        deliveryFeeUsd: 5,
        totalUsd: 25,
        shippingAddress: JSON.stringify({ line1: '1 Rue', city: 'Kinshasa', commune: 'Gombe', geo: { lat: -4.3086, lng: 15.3171 } }),
        items: [sellerA, sellerB].map((s) => Object.assign(new OrderItem(), { productId: `p-${s.id}`, productName: `Thing ${s.name}`, variant: 'Default', qty: 1, priceUsd: 10, sellerId: s.id, sellerName: s.name, fulfilment: 'open' })),
      }),
    );
    await ds.getRepository(Payment).save(
      ds.getRepository(Payment).create({ reference: `PAY-${n}`, orderId: o.id, orderReference: o.reference, userId: customer.id, method: opts.cod ? 'cod' : 'stripe_card', amountUsd: 25, status: opts.cod ? 'pending' : 'succeeded' }),
    );
    const route = await world.routing.route({ shippingAddress: o.shippingAddress, sellerIds: [sellerA.id, sellerB.id] });
    await ds.getRepository(Order).update({ id: o.id }, { destinationHubId: route.destinationHubId, originHubIds: route.originHubIds, originBySeller: route.originBySeller, routeBySeller: route.routeBySeller });
    await logistics.planOrder(await order(o.id));
    const pickups = await tasks(o.id);
    return { id: o.id, pA: pickups.find((t) => t.sellerId === sellerA.id)!, pB: pickups.find((t) => t.sellerId === sellerB.id)! };
  }
  /** A's parcel is at the warehouse and the sweeper has sent it alone after the limit. */
  async function partialLegForA(opts: { cod?: boolean } = {}) {
    const placed = await place(opts);
    await scan(placed.pA.id);
    await logistics.planWaiting(hours(25));
    const leg = await openLeg(placed.id);
    await logistics.assign(leg.id, rider.id, admin);
    return { ...placed, leg };
  }

  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true });
    await ds.initialize();
    told.length = 0;
    jest.clearAllMocks();
    const settings = { all: async () => ({}), get: async () => null };
    world = await geoWorld(ds, { settings: () => ({}) });
    gombe = await ds.getRepository(Hub).save(ds.getRepository(Hub).create({ name: 'Entrepôt Kinshasa', city: 'Kinshasa', country: 'X', lat: -4.3105, lng: 15.3136, active: true, areaId: (await world.area('CD-KN-GOM')).id }));
    await world.coverage.assign({ hubId: gombe.id, areaIds: [(await world.area('CD-KN')).id] });
    rider = await ds.getRepository(User).save(ds.getRepository(User).create({ emailHash: 'r1', email: 'r@t.test', passwordHash: 'x', name: 'Rider', role: 'rider', hubId: gombe.id }));
    customer = await ds.getRepository(User).save(ds.getRepository(User).create({ emailHash: 'c1', email: 'c@t.test', passwordHash: 'x', name: 'Marie', role: 'customer', walletBalance: 0 }));
    const mkSeller = (name: string) =>
      ds.getRepository(Seller).save(ds.getRepository(Seller).create({ name, status: 'approved', pickupAddress: `${name} street`, pickupLat: -4.3152, pickupLng: 15.3098, originHubId: gombe.id, pickupAreaId: null }));
    sellerA = await mkSeller('Alpha');
    sellerB = await mkSeller('Bravo');
    logistics = new LogisticsService(
      ds.getRepository(DeliveryTask),
      ds.getRepository(Order),
      ds.getRepository(OrderItem),
      ds.getRepository(Hub),
      ds.getRepository(User),
      ds.getRepository(Seller),
      ds.getRepository(Product),
      ds.getRepository('AuditLog') as never,
      world.routing,
      new LanesService(ds.getRepository('HubLane') as never, ds.getRepository(Hub), emitter as never),
      notif as never,
      emitter as never,
      settings as never,
    );
    delivery = new DeliveryService(ds.getRepository(DeliveryTask), ds.getRepository(Order), emitter as never, { markCollected } as never, settings as never, logistics);
    const payments = {
      registerOrderSettledHandler: () => undefined,
      forOrder: (orderId: string) => ds.getRepository(Payment).findOne({ where: { orderId }, order: { createdAt: 'DESC' } }),
      refundCancelledOrder: async () => 0,
    };
    orders = new OrdersService(
      ds.getRepository(Order),
      ds.getRepository(DeliveryTask),
      ds.getRepository(Seller),
      delivery,
      { restock } as never,
      notif as never,
      emitter as never,
      payments as never,
      new WalletService(ds.getRepository(User), ds.getRepository(WalletTransaction), emitter as never),
      {} as never,
      settings as never,
      ds.getRepository(Hub),
      ds.getRepository(User),
      undefined,
      logistics,
      world.routing,
    );
  });
  afterEach(async () => ds.destroy());

  it('below the limit the partial leg is planned again (next attempt, same code) and the order is left alone, with a message that does not offer to cancel', async () => {
    const { id, leg } = await partialLegForA();
    const code = await logistics.proofCodeOf(leg.id);
    const before = (await order(id)).status;
    await fail(leg.id);
    const next = await openLeg(id);
    expect(next).toMatchObject({ attempts: 2, status: 'unassigned' });
    expect(next.sellerIds).toEqual([sellerA.id]);
    expect(await logistics.proofCodeOf(next.id)).toBe(code);
    expect((await order(id)).status).toBe(before);
    const msg = told.find((t) => t.title === 'Delivery attempt failed')!;
    expect(msg.body).toContain('We will try again (attempt 2 of 3).');
    expect(msg.body).not.toContain('cancel the order');
  });

  it('at the limit, on a leg that does not finish the order: only its lines are cancelled, refunded, restocked and sent back; the rest carries on', async () => {
    const { id, pB, leg } = await partialLegForA();
    await ds.getRepository(DeliveryTask).update({ id: leg.id }, { attempts: 3 });
    const status = (await order(id)).status;
    await fail(leg.id);
    const o = await order(id);
    expect(o.status).toBe(status); // not cancelled: Bravo's parcel is still coming
    const a = o.items.find((i) => i.sellerId === sellerA.id)!;
    const b = o.items.find((i) => i.sellerId === sellerB.id)!;
    expect(a).toMatchObject({ fulfilment: 'cancelled', cancelReason: 'Could not be delivered', refundedUsd: 10 });
    expect(b.fulfilment).not.toBe('cancelled');
    expect(await balance()).toBe(10);
    expect(restock).toHaveBeenCalledWith(`p-${sellerA.id}`, 1, expect.objectContaining({ orderId: id, reason: 'cancel_restock' }));
    expect(restock).toHaveBeenCalledTimes(1);
    // the goods are at the warehouse: a return-to-seller leg carries them back to Alpha only
    const back = (await tasks(id)).filter((t) => t.kind === 'return_to_seller');
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ sellerId: sellerA.id, fromHubId: gombe.id, parentTaskId: leg.id, status: 'unassigned' });
    expect(JSON.parse(back[0].itemsJson as string)).toHaveLength(1);
    expect(told.find((t) => t.title === 'Items could not be delivered')).toMatchObject({ to: customer.id });
    // no new leg for Alpha, and none yet for Bravo (not here)
    expect((await legs(id)).filter((t) => t.status !== 'failed')).toHaveLength(0);
    // Bravo's parcel arrives: its own leg, which now finishes the order
    await scan(pB.id);
    const last = await openLeg(id);
    expect(last.sellerIds).toEqual([sellerB.id]);
    expect((await logistics.view(last)).completesOrder).toBe(true);
  });

  it('at the limit on the last leg of a partly delivered order: its lines are cancelled and, nothing being left, the order is delivered', async () => {
    const { id, pB, leg } = await partialLegForA();
    await delivery.updateStatus(leg.id, 'picked_up', rider.id);
    await delivery.updateStatus(leg.id, 'in_transit', rider.id);
    await delivery.updateStatus(leg.id, 'delivered', rider.id);
    await scan(pB.id);
    const last = await openLeg(id);
    await logistics.assign(last.id, rider.id, admin);
    await ds.getRepository(DeliveryTask).update({ id: last.id }, { attempts: 3 });
    await fail(last.id, 'Wrong address');
    const o = await order(id);
    expect(o.status).toBe('delivered'); // Alpha's part was delivered, Bravo's was given up
    expect(o.items.find((i) => i.sellerId === sellerB.id)).toMatchObject({ fulfilment: 'cancelled', refundedUsd: 10 });
    expect(o.items.find((i) => i.sellerId === sellerA.id)!.deliveredAt).toBeInstanceOf(Date);
    expect(await balance()).toBe(10);
    expect((await tasks(id)).filter((t) => t.kind === 'return_to_seller')).toHaveLength(1);
  });

  it('cash on delivery: the lines given up lower the payment, and the leg that finishes the order takes the remainder', async () => {
    const { id, pB, leg } = await partialLegForA({ cod: true });
    expect(leg.codAmountUsd).toBe(15); // Alpha's $10 + the $5 fee
    await ds.getRepository(DeliveryTask).update({ id: leg.id }, { attempts: 3 });
    await fail(leg.id);
    const pay = await ds.getRepository(Payment).findOneByOrFail({ orderId: id });
    expect(pay).toMatchObject({ amountUsd: 15, status: 'pending' }); // $25 - Alpha's $10
    expect(await balance()).toBe(0); // nothing was paid, so nothing is refunded
    await scan(pB.id);
    const last = await openLeg(id);
    // the fee was never collected (the first leg failed): the remainder of the payment is what is due
    expect(last.codAmountUsd).toBe(15);
  });

  it('a whole-order leg that fails below the limit sends the order back to confirmed and the re-opened leg does not push it forward again', async () => {
    const placed = await place();
    await scan(placed.pA.id);
    await scan(placed.pB.id);
    const leg = await openLeg(placed.id);
    await logistics.assign(leg.id, rider.id, admin);
    await delivery.updateStatus(leg.id, 'picked_up', rider.id);
    await delivery.updateStatus(leg.id, 'in_transit', rider.id);
    expect((await order(placed.id)).status).toBe('out_for_delivery');
    await fail(leg.id);
    expect((await order(placed.id)).status).toBe('confirmed');
    expect(await openLeg(placed.id)).toMatchObject({ attempts: 2, status: 'unassigned' });
    expect(told.find((t) => t.title === 'Delivery attempt failed')?.body).toContain('You can also cancel the order.');
  });

  it('a whole-order leg that fails at the limit with nothing delivered still cancels the whole order, as before', async () => {
    const placed = await place();
    await scan(placed.pA.id);
    await scan(placed.pB.id);
    const leg = await openLeg(placed.id);
    await logistics.assign(leg.id, rider.id, admin);
    await ds.getRepository(DeliveryTask).update({ id: leg.id }, { attempts: 3 });
    await fail(leg.id);
    expect((await order(placed.id)).status).toBe('cancelled');
  });
});
