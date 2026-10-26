import { DataSource } from 'typeorm';
import {
  Category,
  DeliveryTask,
  ENTITIES,
  GeoArea,
  Hub,
  HubCoverage,
  HubLane,
  Order,
  OrderItem,
  Payment,
  PaymentRefund,
  Product,
  TransferRun,
  WarehouseBatch,
} from './entities';
import { SEED_WIPE_ORDER, wipeSeededData } from './seed-wipe';

/** A re-seed leaves nothing of the warehouse side behind: lanes, runs (and their reference counter), batches, coverage. */
describe('seed wipe', () => {
  let ds: DataSource;

  beforeEach(async () => {
    // Foreign keys are enforced (better-sqlite3 turns them on), so a wrong order fails here as it would on MySQL.
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true });
    await ds.initialize();
  });
  afterEach(async () => ds.destroy());

  const count = (entity: Parameters<DataSource['getRepository']>[0]) => ds.getRepository(entity).count();

  /** A demo that has been used: two warehouses, a lane both ways, two runs with parcels, a batch, coverage, an order with a line. */
  async function useTheDemo() {
    const hubs = ds.getRepository(Hub);
    const [k, l] = await hubs.save([hubs.create({ name: 'Entrepôt Kinshasa', city: 'Kinshasa' }), hubs.create({ name: 'Entrepôt Limete', city: 'Kinshasa' })]);
    const lanes = ds.getRepository(HubLane);
    await lanes.save([
      lanes.create({ fromHubId: k.id, toHubId: l.id, transitHours: 4, costUsd: null }),
      lanes.create({ fromHubId: l.id, toHubId: k.id, transitHours: 4, costUsd: null }),
    ]);
    const runs = ds.getRepository(TransferRun);
    const [r1, r2] = await runs.save([
      runs.create({ reference: 'TR-0005', fromHubId: k.id, toHubId: l.id }),
      runs.create({ reference: 'TR-0006', fromHubId: k.id, toHubId: l.id }),
    ]);
    const tasks = ds.getRepository(DeliveryTask);
    const t1 = await tasks.save(tasks.create({ orderId: 'o1', orderReference: 'SOM-1', kind: 'transfer', status: 'picked_up', runId: r1.id, fromHubId: k.id, toHubId: l.id }));
    await tasks.save(tasks.create({ orderId: 'o2', orderReference: 'SOM-2', kind: 'transfer', status: 'assigned', runId: r2.id, fromHubId: k.id, toHubId: l.id }));
    await ds.getRepository(WarehouseBatch).save(ds.getRepository(WarehouseBatch).create({ reference: 'BATCH-1', hubId: k.id, taskIds: JSON.stringify([t1.id]) }));
    await ds.getRepository(HubCoverage).save(ds.getRepository(HubCoverage).create({ hubId: l.id, areaId: 'area-1', feeOverrideUsd: null }));
    const cat = await ds.getRepository(Category).save(ds.getRepository(Category).create({ name: 'Phones' }));
    const product = await ds.getRepository(Product).save(ds.getRepository(Product).create({ name: 'Phone', price: 10, categoryId: cat.id }));
    const order = await ds.getRepository(Order).save(
      ds.getRepository(Order).create({
        reference: 'SOM-1',
        customerId: 'c1',
        customerName: 'Marie',
        status: 'confirmed',
        paymentMethod: 'cod',
        totalUsd: 10,
        shippingAddress: '{}',
        destinationHubId: l.id,
        items: [Object.assign(new OrderItem(), { productId: product.id, productName: 'Phone', variant: 'Default', qty: 1, priceUsd: 10, sellerId: 's1', sellerName: 'S', fulfilment: 'open' })],
      }),
    );
    return { k, l, order };
  }

  it('clears the lanes, the transfer runs, the batches, the coverage and the tasks together with the hubs they point at', async () => {
    await useTheDemo();
    expect(await count(HubLane)).toBe(2);
    expect(await count(TransferRun)).toBe(2);
    await wipeSeededData(ds);
    for (const e of [HubLane, TransferRun, WarehouseBatch, HubCoverage, DeliveryTask, Hub, OrderItem, Order, Product, Category]) expect(await count(e)).toBe(0);
  });

  it('clears the refund ledger with the payments (a re-seeded demo must not count the refunds of orders that are gone)', async () => {
    const { order } = await useTheDemo();
    const pay = await ds.getRepository(Payment).save(ds.getRepository(Payment).create({ reference: 'PAY-1', orderId: order.id, orderReference: 'SOM-1', userId: 'c1', method: 'stripe_card', amountUsd: 10, status: 'succeeded', refundedUsd: 4 }));
    await ds.getRepository(PaymentRefund).save(ds.getRepository(PaymentRefund).create({ paymentId: pay.id, orderId: order.id, userId: 'c1', amountUsd: 4, refundTo: 'wallet', kind: 'return' }));
    expect(await count(PaymentRefund)).toBe(1);
    await wipeSeededData(ds);
    expect(await count(PaymentRefund)).toBe(0);
    expect(await count(Payment)).toBe(0);
  });

  it('runs are numbered again from TR-0001 after a re-seed (the reference counts the rows that exist)', async () => {
    await useTheDemo();
    const top = async () =>
      (await ds.getRepository(TransferRun).createQueryBuilder('r').select('r.reference', 'reference').getRawMany<{ reference: string }>()).reduce(
        (m, r) => Math.max(m, Number(/^TR-(\d+)$/.exec(r.reference)?.[1] ?? 0)),
        0,
      );
    expect(await top()).toBe(6);
    await wipeSeededData(ds);
    expect(await top()).toBe(0); // the next run is TR-0001
  });

  it('keeps the geography: the DRC areas are reference data, never wiped', async () => {
    await ds.getRepository(GeoArea).insert({ code: 'CD', level: 'country', name: 'RDC', googleName: 'RDC', googleNameEn: 'DRC', path: 'CD', depth: 0 } as never);
    await useTheDemo();
    await wipeSeededData(ds);
    expect(await count(GeoArea)).toBe(1);
  });

  it('can run on an empty database, and twice', async () => {
    await wipeSeededData(ds);
    await useTheDemo();
    await wipeSeededData(ds);
    await wipeSeededData(ds);
    expect(await count(Hub)).toBe(0);
  });

  it('wipes the children before what they point at: tasks and runs before the hubs, lanes and coverage before the hubs, lines before orders', () => {
    const at = (e: unknown) => (SEED_WIPE_ORDER as readonly unknown[]).indexOf(e);
    for (const child of [DeliveryTask, TransferRun, WarehouseBatch, HubLane, HubCoverage]) {
      expect(at(child)).toBeGreaterThanOrEqual(0);
      expect(at(child)).toBeLessThan(at(Hub));
    }
    expect(at(TransferRun)).toBeLessThan(at(DeliveryTask));
    expect(at(OrderItem)).toBeLessThan(at(Order));
    expect(at(Product)).toBeLessThan(at(Category));
    // every entity is listed once
    expect(new Set(SEED_WIPE_ORDER).size).toBe(SEED_WIPE_ORDER.length);
  });
});
