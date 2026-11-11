import { LogisticsService } from '../../logistics/logistics.service';
import { RoutingService } from '../../logistics/routing.service';
import { log } from './demo-common';
import { settleClock, stampLines, stampTask } from './demo-flow';
import type { DemoStoreKey } from './demo-catalog';
import type { OrderSpec, Scenario } from './demo-commerce';

/**
 * The orders a seller processes, one set per store, so the client can try every button of the seller module on the live
 * server and see the same orders in the customer app. Each one is placed through `OrdersService.create`, so the lines, the
 * payment, the pickup legs and the notices are the real ones; the steps after that (a rider, a scan, a delivery) are the
 * real services too (see `Driver`). Only the clock is moved afterwards, by id.
 *
 * Every basket differs from every other basket of the same customer (the seed finds an order again by its lines).
 */

const H = 3_600_000;

const store = (c: Scenario, k: DemoStoreKey) => c.ctx.stores.get(k)!;

/** The seller marked the parcel ready a little while ago (the services stamp "now"; a day-old order was not packed a day ago). */
async function readyAgo(c: Scenario, k: DemoStoreKey, hours: number) {
  const at = new Date(Date.now() - hours * H);
  const s = store(c, k);
  await stampLines(c.ctx.ds, c.order.id, s.id, { readyAt: at });
  const task = (await c.driver.tasks(c.order.id)).find(
    (t) => t.kind === 'pickup' && t.sellerId === s.id,
  );
  if (task) await stampTask(c.ctx.ds, task.id, { readyAt: at });
}

/** Hours the oldest parcel must wait before the sweeper splits the order (`splitDeliveryAfterHours`), or 0 when splitting is off. */
async function splitHours(c: Scenario): Promise<number> {
  return c.ctx.app.get(RoutingService).splitAfterHours();
}

/**
 * A two-seller order (A and B) in which A's parcel reached the destination warehouse longer ago than the limit.
 * The sweeper's own planning (`planNext`, the locked step `planWaiting` runs for every order) then starts the partial leg.
 * `both`: B's parcel arrives later and the second leg also reaches the customer.
 */
async function splitOrder(c: Scenario, both: boolean): Promise<void> {
  const { ctx, driver } = c;
  const ds = ctx.ds;
  const A = store(c, 'A');
  const B = store(c, 'B');
  const limit = await splitHours(c);
  if (limit <= 0) {
    log(
      `! splitDeliveryAfterHours is 0 (never split): the split order ${c.spec.key} stays a plain two-seller order.`,
    );
    return;
  }
  const now = Date.now();
  const placed = c.spec.placedAgoH;
  const aReceived = Math.min(limit + 3, placed - 6);
  // Store A: packed, collected, scanned in at the warehouse long enough ago.
  await driver.drive(
    c.order.id,
    'at_hub',
    (t) => t.kind === 'pickup' && t.sellerId === A.id,
  );
  const aPick = (await driver.tasks(c.order.id)).find(
    (t) => t.kind === 'pickup' && t.sellerId === A.id,
  )!;
  await stampTask(ds, aPick.id, {
    readyAt: new Date(now - (aReceived + 8) * H),
    pickedUpAt: new Date(now - (aReceived + 4) * H),
    receivedAt: new Date(now - aReceived * H),
    deliveredAt: new Date(now - aReceived * H),
  });
  await stampLines(ds, c.order.id, A.id, {
    readyAt: new Date(now - (aReceived + 8) * H),
    receivedAt: new Date(now - aReceived * H),
  });
  if (!both) {
    // Store B: packed and handed to the rider, on the road to the warehouse.
    await driver.drive(
      c.order.id,
      'picked',
      (t) => t.kind === 'pickup' && t.sellerId === B.id,
    );
    const bPick = (await driver.tasks(c.order.id)).find(
      (t) => t.kind === 'pickup' && t.sellerId === B.id,
    )!;
    await stampTask(ds, bPick.id, {
      readyAt: new Date(now - 5 * H),
      pickedUpAt: new Date(now - 2 * H),
    });
    await stampLines(ds, c.order.id, B.id, { readyAt: new Date(now - 5 * H) });
  }
  // The same locked planning the five-minute sweeper runs for this order: A has waited past the limit, so its parcel goes alone.
  const made = await ctx.app.get(LogisticsService).planNext(c.order.id);
  if (made.length !== 1)
    throw new Error(
      `Split order ${c.spec.key}: expected the sweeper's planning to start one partial leg, it started ${made.length}.`,
    );
  if (!both) {
    await driver.drive(c.order.id, 'out', (t) => t.kind === 'delivery');
    await stampTask(ds, made[0].id, {
      createdAt: new Date(now - 1 * H),
      pickedUpAt: new Date(now - 0.5 * H),
    });
    return;
  }

  // First leg: delivered to the customer with their code.
  await driver.drive(c.order.id, 'delivered', (t) => t.kind === 'delivery');
  const leg1At = new Date(now - 72 * H);
  await stampTask(ds, made[0].id, {
    createdAt: new Date(now - 76 * H),
    pickedUpAt: new Date(now - 74 * H),
    deliveredAt: leg1At,
  });
  await stampLines(ds, c.order.id, A.id, { deliveredAt: leg1At });
  // Store B's parcel arrives afterwards: the order is complete, so the last leg is planned by the scan-in itself.
  await driver.drive(
    c.order.id,
    'at_hub',
    (t) => t.kind === 'pickup' && t.sellerId === B.id,
  );
  const bPick = (await driver.tasks(c.order.id)).find(
    (t) => t.kind === 'pickup' && t.sellerId === B.id,
  )!;
  await stampTask(ds, bPick.id, {
    readyAt: new Date(now - 60 * H),
    pickedUpAt: new Date(now - 54 * H),
    receivedAt: new Date(now - 50 * H),
    deliveredAt: new Date(now - 50 * H),
  });
  await stampLines(ds, c.order.id, B.id, {
    readyAt: new Date(now - 60 * H),
    receivedAt: new Date(now - 50 * H),
  });
  await driver.drive(c.order.id, 'delivered', (t) => t.kind === 'delivery');
  const second = (await driver.tasks(c.order.id)).filter(
    (t) => t.kind === 'delivery' && t.id !== made[0].id,
  );
  const leg2At = new Date(now - 48 * H);
  for (const t of second)
    await stampTask(ds, t.id, {
      createdAt: new Date(now - 50 * H),
      pickedUpAt: new Date(now - 49 * H),
      deliveredAt: leg2At,
    });
  await stampLines(ds, c.order.id, B.id, { deliveredAt: leg2At });
  await ds.query('UPDATE orders SET updatedAt = ? WHERE id = ?', [
    leg2At,
    c.order.id,
  ]);
  await settleClock(ds, c.order.id, leg2At);
}

/** A delivery that failed once (the customer did not answer) and was re-opened for the rider's second attempt. */
async function failedOnce(c: Scenario): Promise<void> {
  const { ctx, driver } = c;
  const now = Date.now();
  await driver.drive(c.order.id, 'at_hub'); // pickups scanned in, the delivery leg given to the rider
  const first = (await driver.tasks(c.order.id)).find(
    (t) => t.kind === 'delivery',
  );
  if (!first) throw new Error(`Order ${c.spec.key} has no delivery leg.`);
  await driver.failDelivery(
    c.order.id,
    'Customer not reachable: the phone was switched off and nobody opened the door.',
  );
  await stampTask(ctx.ds, first.id, {
    createdAt: new Date(now - 7 * H),
    pickedUpAt: new Date(now - 4 * H),
  });
  const retry = (await driver.tasks(c.order.id)).find(
    (t) => t.kind === 'delivery' && t.id !== first.id,
  );
  if (!retry)
    throw new Error(`Order ${c.spec.key}: no second attempt was opened.`);
  await stampTask(ctx.ds, retry.id, { createdAt: new Date(now - 3 * H) });
  await settleClock(ctx.ds, c.order.id, new Date(now - 3 * H));
  await driver.drive(c.order.id, 'at_hub'); // the retry is the rider's again
}

/**
 * What each store has waiting, a split delivery on the road and one delivered in two legs, and a failed
 * attempt.
 */
export function orderTypeSpecs(): OrderSpec[] {
  return [
    // ── Store A, Maison Kinshasa (Gombe) ──
    {
      key: 'W-A1',
      customer: 'reviewer.1',
      lines: [{ sku: 'MK-HNY', qty: 2 }],
      address: 'limete',
      stage: 'placed',
      placedAgoH: 3,
    },
    {
      key: 'W-A2',
      customer: 'reviewer.2',
      lines: [{ sku: 'MK-LMP' }, { sku: 'MK-BLL' }],
      address: 'kalamu',
      stage: 'placed',
      placedAgoH: 5,
    },
    {
      key: 'W-A3',
      customer: 'reviewer.3',
      lines: [{ sku: 'MK-TOY' }],
      address: 'bandalungwa',
      stage: 'ready',
      placedAgoH: 10,
      afterBackdate: (c) => readyAgo(c, 'A', 1.5),
    },
    // ── Store B, Limete Grossiste ──
    {
      key: 'W-B1',
      customer: 'reviewer.4',
      lines: [{ sku: 'MB-TEA', qty: 3 }],
      address: 'kintambo',
      stage: 'placed',
      placedAgoH: 4,
    },
    {
      key: 'W-B2',
      customer: 'reviewer.1',
      lines: [{ sku: 'MB-BIN' }, { sku: 'MB-NBK', qty: 2 }],
      address: 'limete',
      stage: 'placed',
      placedAgoH: 6,
    },
    {
      key: 'W-B3',
      customer: 'customer.fr',
      lines: [{ sku: 'MB-BTL', qty: 2 }],
      address: 'ngaliema',
      stage: 'ready',
      placedAgoH: 9,
      afterBackdate: (c) => readyAgo(c, 'B', 2),
    },
    // ── Store C, Ndolo Électro (Kasa-Vubu) ──
    {
      key: 'W-C1',
      customer: 'reviewer.2',
      lines: [{ sku: 'MC-KTL' }],
      address: 'kalamu',
      stage: 'placed',
      placedAgoH: 2,
    },
    {
      key: 'W-C2',
      customer: 'reviewer.3',
      lines: [{ sku: 'MC-FAN' }, { sku: 'MC-CHG' }],
      address: 'bandalungwa',
      stage: 'placed',
      placedAgoH: 7,
    },
    {
      key: 'W-C3',
      customer: 'reviewer.4',
      lines: [{ sku: 'MC-IRN' }],
      address: 'kintambo',
      stage: 'ready',
      placedAgoH: 11,
      afterBackdate: (c) => readyAgo(c, 'C', 3),
    },

    // ── Split delivery (A + B) ──
    {
      // A's parcel waited past the limit and is out for delivery alone; B's parcel is still on the road to the warehouse.
      key: 'S-1',
      customer: 'customer.full',
      lines: [{ sku: 'MK-NBK', qty: 2 }, { sku: 'MB-TOW' }],
      address: 'gombe',
      stage: 'placed',
      placedAgoH: 60,
      afterBackdate: (c) => splitOrder(c, false),
    },
    {
      // Both parts delivered, on two legs, a day apart.
      key: 'S-2',
      customer: 'customer.fr',
      lines: [
        { sku: 'MK-BLL', qty: 2 },
        { sku: 'MB-FLR', qty: 2 },
      ],
      address: 'ngaliema',
      stage: 'placed',
      placedAgoH: 120,
      afterBackdate: (c) => splitOrder(c, true),
    },

    // ── Failed attempt ──
    {
      key: 'D-F1',
      customer: 'reviewer.4',
      lines: [{ sku: 'MK-PLT' }],
      address: 'kintambo',
      stage: 'placed',
      placedAgoH: 30,
      afterBackdate: (c) => failedOnce(c),
    },

    // ── Express (store C, same commune as the customer: Kasa-Vubu). Only while express delivery is on. ──
    {
      // Paid, waiting for store C to press Package Ready; the seller's rider is then sent straight to the customer.
      key: 'X-1',
      customer: 'reviewer.1',
      lines: [{ sku: 'MC-CHG', qty: 2 }],
      address: 'kasavubu',
      stage: 'placed',
      placedAgoH: 2,
      express: true,
    },
    {
      // The demo rider collected it from the seller and is on the road to the customer (code set).
      key: 'X-2',
      customer: 'reviewer.1',
      lines: [{ sku: 'MC-FAN' }],
      address: 'kasavubu',
      stage: 'out',
      placedAgoH: 5,
      express: true,
    },
    {
      key: 'X-3',
      customer: 'reviewer.1',
      lines: [{ sku: 'MC-IRN' }],
      address: 'kasavubu',
      stage: 'delivered',
      placedAgoH: 30,
      deliveredAgoH: 27,
      express: true,
    },
    {
      // Express: waiting to be packed.
      key: 'X-C1',
      customer: 'reviewer.1',
      lines: [{ sku: 'MC-KTL' }, { sku: 'MC-CHG' }],
      address: 'kasavubu',
      stage: 'placed',
      placedAgoH: 1,
      express: true,
    },
  ];
}
