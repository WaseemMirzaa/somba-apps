import { Injectable } from '@nestjs/common';
import { FindOptionsWhere, In, Not } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { pageOf } from '../common/paging';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DeliveryTask,
  Hub,
  Order,
  Product,
  StockTransfer,
  WarehouseBatch,
  WarehouseException,
} from '../database/entities';
import type {
  ExceptionSeverity,
  ExceptionStatus,
  ExceptionType,
} from '../database/entities';
import { num, oneOf, str } from '../common/validate';
import { tasksOfHub } from '../logistics/hub-scope';
import { HubsService } from '../logistics/hubs.service';
import { Actor, LogisticsService } from '../logistics/logistics.service';
import { riderFits } from '../logistics/leg-rules';
import { tierAllows } from '../logistics/tiers';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ProductsService } from '../products/products.service';
import { ADMIN_ROLES, NotificationsService } from '../notifications/notifications.service';

const OPS_ROOMS = [...ADMIN_ROLES, 'warehouse_staff'];

@Injectable()
export class WarehouseService {
  constructor(
    @InjectRepository(Hub) private readonly hubs: Repository<Hub>,
    @InjectRepository(WarehouseBatch)
    private readonly batches: Repository<WarehouseBatch>,
    @InjectRepository(StockTransfer)
    private readonly transfers: Repository<StockTransfer>,
    @InjectRepository(DeliveryTask)
    private readonly tasks: Repository<DeliveryTask>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(WarehouseException)
    private readonly exceptions: Repository<WarehouseException>,
    private readonly emitter: RealtimeEmitter,
    private readonly notifications: NotificationsService,
    private readonly productsSvc: ProductsService,
    private readonly hubsSvc: HubsService,
    private readonly logistics: LogisticsService,
  ) {}

  // ── Warehouse exceptions (parcel incidents) ──────────────────────────────
  /** Incidents, newest first. `hubId` (warehouse staff) limits them to that warehouse; null/undefined = all (admins). */
  listExceptions(status?: string, hubId?: string | null): Promise<WarehouseException[]> {
    const where: FindOptionsWhere<WarehouseException> = {};
    if (status && status !== 'all') where.status = status as ExceptionStatus;
    if (hubId) where.hubId = hubId;
    return this.exceptions.find({ where, order: { createdAt: 'DESC' }, take: 200 });
  }

  /** Tell the admins and the staff of the incident's own warehouse (nobody else's). */
  private pushException(exc: WarehouseException): void {
    this.emitter.toRoles(ADMIN_ROLES, 'exception:updated', exc);
    if (exc.hubId) this.emitter.toHub(exc.hubId, 'exception:updated', exc);
  }

  async createException(
    raisedBy: string,
    input: {
      taskId?: string;
      orderReference?: string;
      type?: ExceptionType;
      severity?: ExceptionSeverity;
      hub?: string;
      notes: string;
    },
    scopeHubId?: string | null,
  ): Promise<WarehouseException> {
    // The incident belongs to a warehouse: the staff member's own, else the parcel's, else the one named.
    const task = input.taskId ? await this.tasks.findOne({ where: { id: str(input.taskId, 'Task', { max: 64 }) } }) : null;
    if (scopeHubId && task && ![task.hubId, task.fromHubId, task.toHubId].includes(scopeHubId)) {
      throw new BadRequestException('That parcel belongs to another warehouse.');
    }
    let hubRow: Hub | null = null;
    if (scopeHubId) hubRow = await this.hubs.findOne({ where: { id: scopeHubId } });
    else if (task?.hubId ?? task?.toHubId) hubRow = await this.hubs.findOne({ where: { id: (task?.hubId ?? task?.toHubId) as string } });
    else if (input.hub) {
      const wanted = str(input.hub, 'Hub', { max: 100 }).toLowerCase();
      hubRow = (await this.hubs.find()).find((h) => h.name.trim().toLowerCase() === wanted) ?? null;
    }
    const exc = await this.exceptions.save(
      this.exceptions.create({
        // Time plus a random tail: two incidents raised in the same millisecond must not collide on the unique reference.
        reference: `INC-${Date.now().toString().slice(-8)}${Math.floor(100 + Math.random() * 900)}`,
        taskId: input.taskId ? str(input.taskId, 'Task', { max: 64 }) : null,
        orderReference: input.orderReference ? str(input.orderReference, 'Order', { max: 40 }) : null,
        type: oneOf(input.type ?? 'other', ['damaged', 'missing_item', 'wrong_item', 'address_issue', 'lost', 'other'] as const, 'Type'),
        severity: oneOf(input.severity ?? 'medium', ['low', 'medium', 'high'] as const, 'Severity'),
        status: 'open',
        hub: hubRow ? hubRow.name : input.hub ? str(input.hub, 'Hub', { max: 100 }) : null,
        hubId: hubRow?.id ?? null,
        notes: str(input.notes, 'Notes', { min: 3, max: 2000 }),
        raisedBy,
      }),
    );
    this.pushException(exc);
    return exc;
  }

  async setExceptionStatus(
    id: string,
    status: ExceptionStatus,
    resolution?: string,
    scopeHubId?: string | null,
  ): Promise<WarehouseException> {
    const exc = await this.exceptions.findOne({ where: { id } });
    // Another warehouse's incident looks like it does not exist.
    if (!exc || (scopeHubId && exc.hubId !== scopeHubId)) throw new Error('Exception not found.');
    exc.status = status;
    if (resolution != null) exc.resolution = resolution;
    const saved = await this.exceptions.save(exc);
    this.pushException(saved);
    return saved;
  }

  // ── Hub directory (the logic lives in HubsService; these keep the warehouse:* events working) ──
  /** Every hub (inactive ones included, flagged `active:false`); `activeOnly` hides the inactive ones. */
  listHubs(opts: { activeOnly?: boolean } = {}) {
    return this.hubsSvc.list(opts);
  }

  /** Create (no `id`) or update (`id`) a hub, with its map position. Only the listed fields are accepted. */
  saveHub(data: Record<string, unknown>): Promise<Hub> {
    return this.hubsSvc.save(data);
  }

  /** Switch a hub on or off. An inactive hub cannot send or receive stock transfers or take orders. */
  setHubActive(id: string, active: boolean): Promise<Hub> {
    return this.hubsSvc.setActive(id, active);
  }

  /** Parcels grouped for the warehouse pipeline (inbound → dispatched). */
  async parcels(stage?: string, paging?: unknown, hubId?: string | null): Promise<DeliveryTask[]> {
    const { take, skip } = pageOf(paging);
    const map: Record<string, string[]> = {
      inbound: ['unassigned'],
      sorting: ['assigned'],
      dispatched: ['picked_up', 'in_transit'],
      delivered: ['delivered'],
      exceptions: ['failed'],
    };
    const base = !stage || stage === 'all' ? {} : { status: In(map[stage] ?? [stage]) as never };
    return this.tasks.find({ where: tasksOfHub(base, hubId), order: { createdAt: 'DESC' }, take, skip });
  }

  /** Parcels not delivered, oldest first. */
  async aged(paging?: unknown, hubId?: string | null): Promise<DeliveryTask[]> {
    const { take, skip } = pageOf(paging);
    return this.tasks.find({ where: tasksOfHub({ status: Not(In(['delivered', 'failed'])) as never }, hubId), order: { createdAt: 'ASC' }, take, skip });
  }

  /**
   * Inventory levels by product/SKU. Stock stays with the seller, so a warehouse's view is the products of the parcels
   * in ITS custody (inbound, on hand, outbound), with how many units that is; admins (no `hubId`) see every product.
   */
  async inventory(paging?: unknown, hubId?: string | null) {
    const { take, skip } = pageOf(paging);
    let custodyQty: Map<string, number> | null = null;
    if (hubId) {
      const c = await this.logistics.custody(hubId);
      const orderIds = [...new Set([...c.inbound, ...c.onHand, ...c.outbound].map((t) => t.orderId))];
      custodyQty = new Map();
      if (orderIds.length) {
        const rows = await this.orders
          .createQueryBuilder('o')
          .innerJoin('o.items', 'i')
          .select('i.productId', 'productId')
          .addSelect('SUM(i.qty)', 'qty')
          .where('o.id IN (:...orderIds)', { orderIds })
          .groupBy('i.productId')
          .getRawMany<{ productId: string; qty: string }>();
        for (const r of rows) custodyQty.set(r.productId, Number(r.qty));
      }
    }
    const products = custodyQty
      ? custodyQty.size
        ? await this.products.find({ where: { id: In([...custodyQty.keys()]) }, order: { createdAt: 'DESC', id: 'ASC' }, take, skip })
        : []
      : await this.products.find({ order: { createdAt: 'DESC', id: 'ASC' }, take, skip });
    const served = await this.productsSvc.describe(products);
    return products.map((p) => ({
      ...(custodyQty ? { custodyQty: custodyQty.get(p.id) ?? 0 } : {}),
      sku: `SKU-${p.id.slice(0, 6)}`,
      productId: p.id,
      name: served.get(p.id)?.name ?? p.name,
      nameFr: served.get(p.id)?.nameFr ?? p.name,
      category: served.get(p.id)?.category ?? '',
      categoryFr: served.get(p.id)?.categoryFr ?? '',
      stock: p.stock,
      status: p.stock === 0 ? 'out' : p.stock < 10 ? 'low' : 'ok',
    }));
  }

  listBatches(hubId?: string | null): Promise<WarehouseBatch[]> {
    return this.batches.find({ where: hubId ? { hubId } : undefined, order: { createdAt: 'DESC' }, take: 100 });
  }

  /**
   * Build a batch of tasks and give them all to one rider (supervisor tier or above). Every task must belong to the
   * actor's warehouse and the rider must be allowed on each of them; nothing is assigned if any task is refused.
   */
  async buildBatch(
    actor: Actor,
    taskIds: string[],
    rider: { id: string; name: string; hubId?: string | null },
  ): Promise<WarehouseBatch> {
    if (!tierAllows(actor.role, actor.tier, 'assign')) throw new BadRequestException('Only supervisors and managers can assign riders.');
    const ids = [...new Set(taskIds)];
    const tasks: DeliveryTask[] = [];
    for (const id of ids) {
      const task = await this.tasks.findOne({ where: { id } });
      if (!task) throw new BadRequestException('Delivery task not found.');
      if (!actor.role.startsWith('admin') && task.hubId !== actor.hubId) throw new BadRequestException('This task belongs to another warehouse.');
      if (!riderFits(task, rider.hubId)) throw new BadRequestException('This rider works at another warehouse.');
      if (!['unassigned', 'assigned'].includes(task.status)) continue;
      tasks.push(task);
    }
    for (const task of tasks) await this.logistics.assign(task.id, rider.id, actor);
    const hubId = actor.hubId ?? tasks[0]?.hubId ?? null;
    const batch = await this.batches.save(
      this.batches.create({
        reference: `BATCH-${Date.now().toString().slice(-6)}`,
        hubId,
        riderId: rider.id,
        riderName: rider.name,
        taskIds: JSON.stringify(tasks.map((t) => t.id)),
        status: 'dispatched',
      }),
    );
    this.emitter.toRoles(ADMIN_ROLES, 'batch:updated', batch);
    if (hubId) this.emitter.toHub(hubId, 'batch:updated', batch);
    return batch;
  }

  /** COD reconciliation: cash collected per rider from delivered parcels (one grouped query). */
  async reconcile(hubId?: string | null) {
    const qb = this.tasks
      .createQueryBuilder('t')
      .select('t.riderId', 'riderId')
      .addSelect('COUNT(*)', 'parcels')
      .addSelect('COALESCE(SUM(t.codAmountUsd), 0)', 'codUsd')
      .where("t.status = 'delivered' AND t.kind = 'delivery'");
    if (hubId) qb.andWhere('(t.hubId = :hubId OR t.fromHubId = :hubId OR t.toHubId = :hubId)', { hubId });
    const rows = await qb
      .groupBy('t.riderId')
      .getRawMany<{ riderId: string | null; parcels: string; codUsd: string }>();
    return rows.map((r) => ({
      riderId: r.riderId ?? 'unassigned',
      parcels: Number(r.parcels),
      codUsd: Number(Number(r.codUsd).toFixed(2)),
    }));
  }

  listTransfers(): Promise<StockTransfer[]> {
    return this.transfers.find({ order: { createdAt: 'DESC' }, take: 100 });
  }

  async createTransfer(data: Record<string, unknown>): Promise<StockTransfer> {
    const fromHub = str(data?.fromHub, 'From hub', { max: 100 });
    const toHub = str(data?.toHub, 'To hub', { max: 100 });
    if (fromHub.toLowerCase() === toHub.toLowerCase()) throw new Error('Choose two different hubs.');
    for (const h of await this.hubs.find({ where: { active: false } })) {
      if ([fromHub, toHub].some((n) => n.toLowerCase() === h.name.trim().toLowerCase())) {
        throw new Error(`${h.name} is deactivated and cannot take stock transfers.`);
      }
    }
    // Only these fields are accepted; reference, status and ids are ours.
    const transfer = await this.transfers.save(
      this.transfers.create({
        fromHub,
        toHub,
        sku: str(data?.sku, 'SKU', { max: 100 }),
        productName: data?.productName ? str(data.productName, 'Product', { max: 200 }) : null,
        qty: num(data?.qty, 'Quantity', { min: 1, max: 100000, int: true }),
        reference: `TRF-${Date.now().toString().slice(-8)}`,
        status: 'requested',
      }),
    );
    this.emitter.toRoles(OPS_ROOMS, 'transfer:updated', transfer);
    return transfer;
  }
}
