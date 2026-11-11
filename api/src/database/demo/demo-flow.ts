import { DataSource } from 'typeorm';
import { DeliveryTask, Order, Seller, User } from '../entities';
import { LogisticsService } from '../../logistics/logistics.service';
import type { Actor } from '../../logistics/logistics.service';
import { DeliveryService } from '../../delivery/delivery.service';
import { OrdersService } from '../../orders/orders.service';
import { isHubBound } from '../../logistics/leg-rules';
import type { DemoCtx } from './demo-ctx';

/** How far an order's journey goes. Each stage includes the ones before it. */
export type Stage =
  | 'placed'
  | 'assigned'
  | 'ready'
  | 'picked'
  | 'at_hub'
  | 'transfer_road'
  | 'out'
  | 'delivered';
const ORDER: Stage[] = [
  'placed',
  'assigned',
  'ready',
  'picked',
  'at_hub',
  'transfer_road',
  'out',
  'delivered',
];
const at = (s: Stage) => ORDER.indexOf(s);

const OPEN = ['unassigned', 'assigned', 'picked_up', 'in_transit'];

const actorOf = (
  u: User,
  hubId: string | null,
  tier: string | null,
): Actor => ({ id: u.id, role: u.role, name: u.name, hubId, tier });

/**
 * Walks the legs of an order with the real services, the way the people do: the warehouse supervisor assigns a rider of
 * that warehouse, the rider picks up and delivers (with the customer's code), the operator scans parcels in.
 */
export class Driver {
  private readonly logistics: LogisticsService;
  private readonly delivery: DeliveryService;
  private readonly orders: OrdersService;
  private readonly ds: DataSource;

  constructor(private readonly ctx: DemoCtx) {
    this.logistics = ctx.app.get(LogisticsService);
    this.delivery = ctx.app.get(DeliveryService);
    this.orders = ctx.app.get(OrdersService);
    this.ds = ctx.ds;
  }

  private who(
    hubId: string | null | undefined,
    role: 'supervisor' | 'operator',
  ): { rider: User; actor: Actor } {
    const main = hubId === this.ctx.mainHub.id || !hubId;
    const rider = this.ctx.users.get(main ? 'rider' : 'rider.maluku')!;
    const staff = this.ctx.users.get(
      main
        ? role === 'operator'
          ? 'warehouse.operator'
          : 'warehouse.supervisor'
        : 'warehouse.maluku',
    )!;
    const h = main ? this.ctx.mainHub.id : this.ctx.demoHub.id;
    return { rider, actor: actorOf(staff, h, main ? role : 'supervisor') };
  }

  tasks(orderId: string): Promise<DeliveryTask[]> {
    return this.ds
      .getRepository(DeliveryTask)
      .find({ where: { orderId }, order: { createdAt: 'ASC' } });
  }

  private async open(
    orderId: string,
    filter?: (t: DeliveryTask) => boolean,
  ): Promise<DeliveryTask[]> {
    return (await this.tasks(orderId)).filter(
      (t) =>
        OPEN.includes(t.status) &&
        !t.disputeId &&
        !t.replacementId &&
        !t.exchangeId &&
        (!filter || filter(t)),
    );
  }

  /** The store owner marks their package ready (their own pickup). */
  async ready(task: DeliveryTask): Promise<void> {
    if (task.readyAt || !task.sellerId) return;
    const seller = await this.ds
      .getRepository(Seller)
      .findOne({ where: { id: task.sellerId } });
    const owner = seller?.userId
      ? await this.ds
          .getRepository(User)
          .findOne({ where: { id: seller.userId } })
      : null;
    if (!owner) return;
    await this.orders.sellerReady({ id: owner.id }, task.orderId);
  }

  /** Move one leg as far as the stage allows. Returns false when the walk must stop here. */
  async leg(task: DeliveryTask, stage: Stage): Promise<boolean> {
    const s = at(stage);
    const kind = task.kind;
    const { rider, actor } = this.who(task.hubId, 'supervisor');
    const fresh = async () =>
      (await this.ds
        .getRepository(DeliveryTask)
        .findOne({ where: { id: task.id } }))!;
    if (kind === 'pickup') {
      if (s < at('assigned')) return false;
      if (s === at('ready')) {
        await this.ready(task);
        return false;
      }
      if (task.status === 'unassigned')
        await this.logistics.assign(task.id, rider.id, actor);
      if (s === at('assigned')) return false;
      await this.ready(task);
      let t = await fresh();
      if (t.status === 'assigned')
        await this.delivery.updateStatus(t.id, 'picked_up', rider.id);
      t = await fresh();
      if (t.status === 'picked_up')
        await this.delivery.updateStatus(t.id, 'in_transit', rider.id);
      if (s === at('picked')) return false;
      t = await fresh();
      await this.logistics.onScanIn(
        t.id,
        t.toHubId as string,
        this.who(t.toHubId, 'operator').actor,
      );
      return true;
    }
    if (kind === 'transfer') {
      if (s < at('transfer_road')) return false;
      if (task.status === 'unassigned')
        await this.logistics.assign(task.id, rider.id, actor);
      let t = await fresh();
      if (t.status === 'assigned')
        await this.delivery.updateStatus(t.id, 'picked_up', rider.id);
      t = await fresh();
      if (t.status === 'picked_up')
        await this.delivery.updateStatus(t.id, 'in_transit', rider.id);
      if (s === at('transfer_road')) return false;
      t = await fresh();
      await this.logistics.onScanIn(
        t.id,
        t.toHubId as string,
        this.who(t.toHubId, 'operator').actor,
      );
      return true;
    }
    if (kind === 'delivery') {
      if (s < at('at_hub')) return false;
      if (task.status === 'unassigned')
        await this.logistics.assign(task.id, rider.id, actor);
      if (s === at('at_hub')) return false;
      let t = await fresh();
      if (t.status === 'assigned')
        await this.delivery.updateStatus(t.id, 'picked_up', rider.id);
      t = await fresh();
      if (t.status === 'picked_up')
        await this.delivery.updateStatus(t.id, 'in_transit', rider.id);
      if (s === at('out')) return false;
      t = await fresh();
      const code = await this.delivery.getProofCode(t.id);
      await this.delivery.updateStatus(
        t.id,
        'delivered',
        rider.id,
        undefined,
        code ?? undefined,
      );
      return true;
    }
    if (kind === 'express') {
      // The seller's own rider goes straight to the customer: ready (which releases the held-back leg), assigned, collected, on the road, delivered.
      if (s < at('ready')) return false;
      await this.ready(task);
      if (s === at('ready')) return false;
      let t = await fresh();
      if (t.status === 'unassigned')
        await this.logistics.assign(t.id, rider.id, actor);
      t = await fresh();
      if (s < at('out')) return false;
      if (t.status === 'assigned')
        await this.delivery.updateStatus(t.id, 'picked_up', rider.id);
      t = await fresh();
      if (t.status === 'picked_up')
        await this.delivery.updateStatus(t.id, 'in_transit', rider.id);
      if (s === at('out')) return false;
      t = await fresh();
      const code = await this.delivery.getProofCode(t.id);
      await this.delivery.updateStatus(
        t.id,
        'delivered',
        rider.id,
        undefined,
        code ?? undefined,
      );
      return true;
    }
    // A leg the demo does not drive by hand (return and replacement legs have their own helper below).
    return false;
  }

  /** Walk every open leg of an order up to the stage. `filter` limits it to some legs (one seller's pickup, for instance). */
  async drive(
    orderId: string,
    stage: Stage,
    filter?: (t: DeliveryTask) => boolean,
  ): Promise<void> {
    const seen = new Set<string>();
    for (let guard = 0; guard < 14; guard++) {
      const next = (await this.open(orderId, filter)).find(
        (t) => !seen.has(`${t.id}:${t.status}`),
      );
      if (!next) return;
      seen.add(`${next.id}:${next.status}`);
      const moved = await this.leg(next, stage);
      if (!moved) {
        // This leg stops here; other legs of the order might still move (another seller's pickup).
        const others = (await this.open(orderId, filter)).filter(
          (t) => !seen.has(`${t.id}:${t.status}`),
        );
        if (!others.length) return;
      }
    }
  }

  /** Legs of a return, a replacement or an exchange: assign, pick up, scan in or deliver until nothing open is left. */
  async driveSideLegs(
    where: { disputeId?: string; replacementId?: string; exchangeId?: string },
    upTo: 'assigned' | 'road' | 'done',
  ): Promise<void> {
    const repo = this.ds.getRepository(DeliveryTask);
    for (let guard = 0; guard < 8; guard++) {
      const open = (
        await repo.find({ where: where as never, order: { createdAt: 'ASC' } })
      ).filter((t) => OPEN.includes(t.status));
      const task = open[0];
      if (!task) return;
      const { rider, actor } = this.who(task.hubId, 'supervisor');
      if (task.status === 'unassigned')
        await this.logistics.assign(task.id, rider.id, actor);
      if (upTo === 'assigned') return;
      let t = (await repo.findOne({ where: { id: task.id } }))!;
      if (t.status === 'assigned')
        await this.delivery.updateStatus(t.id, 'picked_up', rider.id);
      t = (await repo.findOne({ where: { id: task.id } }))!;
      if (t.status === 'picked_up')
        await this.delivery.updateStatus(t.id, 'in_transit', rider.id);
      if (upTo === 'road') return;
      t = (await repo.findOne({ where: { id: task.id } }))!;
      if (isHubBound(t.kind))
        await this.logistics.onScanIn(
          t.id,
          t.toHubId as string,
          this.who(t.toHubId, 'operator').actor,
        );
      else {
        const code =
          t.kind === 'delivery' ? await this.delivery.getProofCode(t.id) : null;
        await this.delivery.updateStatus(
          t.id,
          'delivered',
          rider.id,
          undefined,
          code ?? undefined,
        );
      }
    }
  }

  /** The rider reports the open customer leg as not delivered (the customer did not answer); the real service re-opens it as the next attempt. */
  async failDelivery(orderId: string, reason: string): Promise<void> {
    await this.drive(orderId, 'out', (t) => t.kind === 'delivery');
    const t = (await this.open(orderId)).find(
      (x) => x.kind === 'delivery' && x.status === 'in_transit',
    );
    if (!t) return;
    const { rider } = this.who(t.hubId, 'supervisor');
    await this.delivery.updateStatus(t.id, 'failed', rider.id, reason);
  }

  /** The 4-digit code the customer sees for an order that is out for delivery. */
  async code(orderId: string): Promise<string | null> {
    return this.delivery.codeForOrder(orderId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────────
// Time travel: everything the demo creates happens "now"; these move it into the past, row by row, by id.
// ─────────────────────────────────────────────────────────────────────────────────

const q = async (ds: DataSource, sql: string, params: unknown[] = []) =>
  ds.query(sql, params);

/**
 * Move an order and everything that belongs to it so that it was placed `placedAgo` ms ago (relative offsets are kept),
 * then optionally set when it was delivered. Touches only rows tied to the order (its lines, legs, payments, refunds,
 * after-sale cases, and the notices about them) and the customer's own wallet history from the order's start.
 */
export async function backdateOrder(
  ds: DataSource,
  orderId: string,
  opts: { placedAgoMs: number; deliveredAgoMs?: number },
): Promise<void> {
  const order = await ds
    .getRepository(Order)
    .findOne({ where: { id: orderId } });
  if (!order) return;
  const startMs = order.createdAt.getTime();
  const delta = Math.max(
    0,
    Math.round(startMs - (Date.now() - opts.placedAgoMs)),
  ); // ms to subtract
  if (delta <= 0) return;
  const sec = Math.round(delta / 1000);
  const shift = (cols: string[]) =>
    cols
      .map(
        (c) =>
          `${c} = IF(${c} IS NULL, NULL, DATE_SUB(${c}, INTERVAL ${sec} SECOND))`,
      )
      .join(', ');

  const tasks = await ds
    .getRepository(DeliveryTask)
    .find({ where: { orderId }, select: { id: true } });
  const taskIds = tasks.map((t) => t.id);
  const lineIds = (order.items ?? []).map((i) => i.id);
  const disputes: { id: string }[] = await q(
    ds,
    'SELECT id FROM disputes WHERE orderId = ?',
    [orderId],
  );
  const exchanges: { id: string }[] = await q(
    ds,
    'SELECT id FROM exchanges WHERE orderId = ?',
    [orderId],
  );
  const replacements: { id: string }[] = await q(
    ds,
    'SELECT id FROM replacements WHERE orderId = ?',
    [orderId],
  );
  const payments: { id: string }[] = await q(
    ds,
    'SELECT id FROM payments WHERE orderId = ?',
    [orderId],
  );
  const entityIds = [
    orderId,
    ...taskIds,
    ...disputes.map((d) => d.id),
    ...exchanges.map((d) => d.id),
    ...replacements.map((d) => d.id),
  ];

  await q(
    ds,
    `UPDATE orders SET ${shift(['createdAt', 'updatedAt'])} WHERE id = ?`,
    [orderId],
  );
  if (lineIds.length)
    await q(
      ds,
      `UPDATE order_items SET ${shift(['readyAt', 'receivedAt', 'deliveredAt'])} WHERE id IN (${lineIds.map(() => '?').join(',')})`,
      lineIds,
    );
  if (taskIds.length)
    await q(
      ds,
      `UPDATE delivery_tasks SET ${shift(['createdAt', 'updatedAt', 'readyAt', 'receivedAt', 'pickedUpAt', 'deliveredAt'])} WHERE id IN (${taskIds.map(() => '?').join(',')})`,
      taskIds,
    );
  await q(
    ds,
    `UPDATE payments SET ${shift(['createdAt', 'updatedAt'])} WHERE orderId = ?`,
    [orderId],
  );
  await q(
    ds,
    `UPDATE payment_refunds SET ${shift(['createdAt', 'updatedAt'])} WHERE orderId = ?`,
    [orderId],
  );
  await q(
    ds,
    `UPDATE disputes SET ${shift(['createdAt', 'updatedAt', 'sellerDueAt', 'sellerRespondedAt', 'sellerLapsedAt', 'escalatedAt', 'receivedAt', 'gradedAt'])} WHERE orderId = ?`,
    [orderId],
  );
  if (disputes.length) {
    const ids = disputes.map((d) => d.id);
    const ph = ids.map(() => '?').join(',');
    await q(
      ds,
      `UPDATE dispute_messages SET ${shift(['createdAt'])} WHERE disputeId IN (${ph})`,
      ids,
    );
    await q(
      ds,
      `UPDATE dispute_items SET ${shift(['createdAt'])} WHERE disputeId IN (${ph})`,
      ids,
    );
  }
  await q(
    ds,
    `UPDATE exchanges SET ${shift(['createdAt', 'updatedAt', 'sellerDueAt', 'sellerRespondedAt', 'deliveredAt'])} WHERE orderId = ?`,
    [orderId],
  );
  await q(
    ds,
    `UPDATE replacements SET ${shift(['createdAt', 'updatedAt', 'sellerDueAt', 'sellerRespondedAt', 'deliveredAt'])} WHERE orderId = ?`,
    [orderId],
  );
  if (entityIds.length)
    await q(
      ds,
      `UPDATE notifications SET createdAt = DATE_SUB(createdAt, INTERVAL ${sec} SECOND) WHERE entityId IN (${entityIds.map(() => '?').join(',')})`,
      entityIds,
    );
  if (entityIds.length)
    await q(
      ds,
      `UPDATE audit_logs SET createdAt = DATE_SUB(createdAt, INTERVAL ${sec} SECOND) WHERE entityId IN (${entityIds.map(() => '?').join(',')})`,
      entityIds,
    );
  // The customer's wallet lines written since the order began (the payment, a refund).
  await q(
    ds,
    `UPDATE wallet_transactions SET createdAt = DATE_SUB(createdAt, INTERVAL ${sec} SECOND) WHERE userId = ? AND createdAt >= ?`,
    [order.customerId, new Date(startMs - 2000)],
  );

  if (opts.deliveredAgoMs !== undefined) {
    const when = new Date(Date.now() - opts.deliveredAgoMs);
    if (taskIds.length)
      await q(
        ds,
        `UPDATE delivery_tasks SET deliveredAt = ?, updatedAt = ? WHERE id IN (${taskIds.map(() => '?').join(',')}) AND status = 'delivered' AND kind IN ('delivery','express')`,
        [when, when, ...taskIds],
      );
    await q(ds, 'UPDATE orders SET updatedAt = ? WHERE id = ? AND status = ?', [
      when,
      orderId,
      'delivered',
    ]);
  }
}

/**
 * Put the after-sale cases of an order (returns, disputes, exchanges, replacements) at `agoMs` ago, keeping their inner
 * offsets (the seller's deadline stays 48 hours after the request). Call it AFTER `backdateOrder`, which moves the cases
 * together with the order. Also moves what the case caused: its legs, its refunds, its messages, the notices about it,
 * and the customer's wallet lines written from the request on (the refund).
 */
export async function placeCases(
  ds: DataSource,
  orderId: string,
  agoMs: number,
): Promise<void> {
  const order = await ds
    .getRepository(Order)
    .findOne({ where: { id: orderId } });
  if (!order) return;
  const target = Date.now() - agoMs;
  const tables: {
    table: string;
    cols: string[];
    kids?: { table: string; col: string; cols: string[] }[];
  }[] = [
    {
      table: 'disputes',
      cols: [
        'createdAt',
        'updatedAt',
        'sellerDueAt',
        'sellerRespondedAt',
        'sellerLapsedAt',
        'escalatedAt',
        'receivedAt',
        'gradedAt',
      ],
      kids: [
        { table: 'dispute_messages', col: 'disputeId', cols: ['createdAt'] },
        { table: 'dispute_items', col: 'disputeId', cols: ['createdAt'] },
        {
          table: 'delivery_tasks',
          col: 'disputeId',
          cols: [
            'createdAt',
            'updatedAt',
            'readyAt',
            'receivedAt',
            'pickedUpAt',
            'deliveredAt',
          ],
        },
        {
          table: 'payment_refunds',
          col: 'disputeId',
          cols: ['createdAt', 'updatedAt'],
        },
      ],
    },
    {
      table: 'exchanges',
      cols: [
        'createdAt',
        'updatedAt',
        'sellerDueAt',
        'sellerRespondedAt',
        'deliveredAt',
      ],
      kids: [
        {
          table: 'delivery_tasks',
          col: 'exchangeId',
          cols: [
            'createdAt',
            'updatedAt',
            'readyAt',
            'receivedAt',
            'pickedUpAt',
            'deliveredAt',
          ],
        },
      ],
    },
    {
      table: 'replacements',
      cols: [
        'createdAt',
        'updatedAt',
        'sellerDueAt',
        'sellerRespondedAt',
        'deliveredAt',
      ],
      kids: [
        {
          table: 'delivery_tasks',
          col: 'replacementId',
          cols: [
            'createdAt',
            'updatedAt',
            'readyAt',
            'receivedAt',
            'pickedUpAt',
            'deliveredAt',
          ],
        },
      ],
    },
  ];
  const shift = (cols: string[], sec: number) =>
    cols
      .map(
        (c) =>
          `${c} = IF(${c} IS NULL, NULL, DATE_SUB(${c}, INTERVAL ${sec} SECOND))`,
      )
      .join(', ');
  for (const t of tables) {
    const cases: { id: string; createdAt: Date }[] = await q(
      ds,
      `SELECT id, createdAt FROM ${t.table} WHERE orderId = ?`,
      [orderId],
    );
    for (const c of cases) {
      const sec = Math.round((new Date(c.createdAt).getTime() - target) / 1000);
      if (!sec) continue;
      await q(ds, `UPDATE ${t.table} SET ${shift(t.cols, sec)} WHERE id = ?`, [
        c.id,
      ]);
      for (const k of t.kids ?? [])
        await q(
          ds,
          `UPDATE ${k.table} SET ${shift(k.cols, sec)} WHERE ${k.col} = ?`,
          [c.id],
        );
      await q(
        ds,
        `UPDATE notifications SET createdAt = DATE_SUB(createdAt, INTERVAL ${sec} SECOND) WHERE entityId = ?`,
        [c.id],
      );
      await q(
        ds,
        `UPDATE audit_logs SET createdAt = DATE_SUB(createdAt, INTERVAL ${sec} SECOND) WHERE entityId = ?`,
        [c.id],
      );
      // The wallet lines written from the request on belong to it (a refund).
      await q(
        ds,
        `UPDATE wallet_transactions SET createdAt = DATE_SUB(createdAt, INTERVAL ${sec} SECOND) WHERE userId = ? AND createdAt >= ?`,
        [order.customerId, new Date(new Date(c.createdAt).getTime() - 500)],
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────────
// Exact moments. The services stamp "now"; a scenario that must look days old sets the moments it needs, row by row.
// ─────────────────────────────────────────────────────────────────────────────────

export interface Moments {
  createdAt?: Date;
  readyAt?: Date;
  receivedAt?: Date;
  pickedUpAt?: Date;
  deliveredAt?: Date;
}

/** Set the moments of one delivery leg. */
export async function stampTask(
  ds: DataSource,
  taskId: string,
  m: Moments,
): Promise<void> {
  const set: string[] = [];
  const params: unknown[] = [];
  for (const [col, v] of Object.entries(m)) {
    if (!v) continue;
    set.push(`${col} = ?`);
    params.push(v);
  }
  const last = m.deliveredAt ?? m.pickedUpAt ?? m.receivedAt ?? m.createdAt;
  if (last) {
    set.push('updatedAt = ?');
    params.push(last);
  }
  if (!set.length) return;
  await q(ds, `UPDATE delivery_tasks SET ${set.join(', ')} WHERE id = ?`, [
    ...params,
    taskId,
  ]);
}

/** Set the moments of one seller's lines of an order (ready, at the warehouse, with the customer). */
export async function stampLines(
  ds: DataSource,
  orderId: string,
  sellerId: string,
  m: Pick<Moments, 'readyAt' | 'receivedAt' | 'deliveredAt'>,
): Promise<void> {
  const set: string[] = [];
  const params: unknown[] = [];
  for (const [col, v] of Object.entries(m)) {
    if (!v) continue;
    set.push(`${col} = IF(${col} IS NULL, NULL, ?)`);
    params.push(v);
  }
  if (!set.length) return;
  await q(
    ds,
    `UPDATE order_items SET ${set.join(', ')} WHERE orderId = ? AND sellerId = ?`,
    [...params, orderId, sellerId],
  );
}

/**
 * The notices and audit lines an order and its legs wrote in the last hour (that is, by the steps a scenario just ran) are
 * dated `when`, so a delivery that "happened three days ago" is not announced as new.
 */
export async function settleClock(
  ds: DataSource,
  orderId: string,
  when: Date,
): Promise<void> {
  const tasks: { id: string }[] = await q(
    ds,
    'SELECT id FROM delivery_tasks WHERE orderId = ?',
    [orderId],
  );
  const ids = [orderId, ...tasks.map((t) => t.id)];
  const ph = ids.map(() => '?').join(',');
  const since = new Date(Date.now() - 3_600_000);
  for (const table of ['notifications', 'audit_logs'])
    await q(
      ds,
      `UPDATE ${table} SET createdAt = ? WHERE entityId IN (${ph}) AND createdAt >= ?`,
      [when, ...ids, since],
    );
}
