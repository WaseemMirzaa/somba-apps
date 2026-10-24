import { Injectable } from '@nestjs/common';
import { In, Not } from 'typeorm';
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
  ) {}

  // ── Warehouse exceptions (parcel incidents) ──────────────────────────────
  listExceptions(status?: string): Promise<WarehouseException[]> {
    return this.exceptions.find({
      where: status && status !== 'all' ? { status: status as ExceptionStatus } : undefined,
      order: { createdAt: 'DESC' },
      take: 200,
    });
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
  ): Promise<WarehouseException> {
    const exc = await this.exceptions.save(
      this.exceptions.create({
        reference: `INC-${Date.now().toString().slice(-8)}`,
        taskId: input.taskId ? str(input.taskId, 'Task', { max: 64 }) : null,
        orderReference: input.orderReference ? str(input.orderReference, 'Order', { max: 40 }) : null,
        type: oneOf(input.type ?? 'other', ['damaged', 'missing_item', 'wrong_item', 'address_issue', 'lost', 'other'] as const, 'Type'),
        severity: oneOf(input.severity ?? 'medium', ['low', 'medium', 'high'] as const, 'Severity'),
        status: 'open',
        hub: input.hub ? str(input.hub, 'Hub', { max: 100 }) : null,
        notes: str(input.notes, 'Notes', { min: 3, max: 2000 }),
        raisedBy,
      }),
    );
    this.emitter.toRoles(OPS_ROOMS, 'exception:updated', exc);
    return exc;
  }

  async setExceptionStatus(
    id: string,
    status: ExceptionStatus,
    resolution?: string,
  ): Promise<WarehouseException> {
    const exc = await this.exceptions.findOne({ where: { id } });
    if (!exc) throw new Error('Exception not found.');
    exc.status = status;
    if (resolution != null) exc.resolution = resolution;
    const saved = await this.exceptions.save(exc);
    this.emitter.toRoles(OPS_ROOMS, 'exception:updated', saved);
    return saved;
  }

  // ── Hub directory ────────────────────────────────────────────────────────
  /** Every hub (inactive ones included, flagged `active:false`); `activeOnly` hides the inactive ones. */
  listHubs(opts: { activeOnly?: boolean } = {}): Promise<Hub[]> {
    return this.hubs.find({ where: opts.activeOnly ? { active: true } : undefined, order: { name: 'ASC' } });
  }

  /** Create (no `id`) or update (`id`) a hub. Only the listed fields are accepted. */
  async saveHub(data: Record<string, unknown>): Promise<Hub> {
    const id = data?.id === undefined || data.id === null || data.id === '' ? null : str(data.id, 'Hub', { max: 64 });
    const existing = id ? await this.hubs.findOne({ where: { id } }) : null;
    if (id && !existing) throw new Error('Hub not found.');
    const hub = existing ?? this.hubs.create({ active: true, country: null, address: null });
    const has = (k: string) => data[k] !== undefined;
    if (!existing || has('name')) hub.name = str(data.name, 'Hub name', { min: 2, max: 100 });
    if (!existing || has('city')) hub.city = str(data.city, 'City', { min: 2, max: 100 });
    if (has('country')) hub.country = data.country === null || data.country === '' ? null : str(data.country, 'Country', { max: 100 });
    if (has('address')) hub.address = data.address === null || data.address === '' ? null : str(data.address, 'Address', { min: 3, max: 200 });
    if (!existing || has('capacity')) hub.capacity = num(data.capacity ?? 500, 'Capacity', { min: 1, max: 1_000_000, int: true });
    // Hub names are how transfers and incidents refer to a hub, so they must stay unique.
    const clash = (await this.hubs.find({ select: { id: true, name: true } })).find(
      (h) => h.name.trim().toLowerCase() === hub.name.toLowerCase() && h.id !== hub.id,
    );
    if (clash) throw new Error('A hub with this name already exists.');
    const saved = await this.hubs.save(hub);
    this.emitter.toRoles(OPS_ROOMS, 'hub:updated', saved);
    return saved;
  }

  /** Switch a hub on or off. An inactive hub cannot send or receive stock transfers. */
  async setHubActive(id: string, active: boolean): Promise<Hub> {
    const hub = await this.hubs.findOne({ where: { id: str(id, 'Hub', { max: 64 }) } });
    if (!hub) throw new Error('Hub not found.');
    if (hub.active !== active) {
      if (!active && (await this.hubs.count({ where: { active: true, id: Not(hub.id) } })) === 0) {
        throw new Error('You cannot deactivate the last active hub.');
      }
      hub.active = active;
      await this.hubs.save(hub);
    }
    this.emitter.toRoles(OPS_ROOMS, 'hub:updated', hub);
    return hub;
  }

  /** Parcels grouped for the warehouse pipeline (inbound → dispatched). */
  async parcels(stage?: string, paging?: unknown): Promise<DeliveryTask[]> {
    const { take, skip } = pageOf(paging);
    const map: Record<string, string[]> = {
      inbound: ['unassigned'],
      sorting: ['assigned'],
      dispatched: ['picked_up', 'in_transit'],
      delivered: ['delivered'],
      exceptions: ['failed'],
    };
    const where = !stage || stage === 'all' ? undefined : { status: In(map[stage] ?? [stage]) as never };
    return this.tasks.find({ where, order: { createdAt: 'DESC' }, take, skip });
  }

  /** Parcels not delivered, oldest first. */
  async aged(paging?: unknown): Promise<DeliveryTask[]> {
    const { take, skip } = pageOf(paging);
    return this.tasks.find({ where: { status: Not(In(['delivered', 'failed'])) as never }, order: { createdAt: 'ASC' }, take, skip });
  }

  /** Inventory levels by product/SKU. */
  async inventory(paging?: unknown) {
    const { take, skip } = pageOf(paging);
    const products = await this.products.find({ order: { createdAt: 'DESC', id: 'ASC' }, take, skip });
    const served = await this.productsSvc.describe(products);
    return products.map((p) => ({
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

  listBatches(): Promise<WarehouseBatch[]> {
    return this.batches.find({ order: { createdAt: 'DESC' }, take: 100 });
  }

  /** Build a batch from unassigned parcels and assign them to a rider. */
  async buildBatch(
    hubId: string | null,
    taskIds: string[],
    rider: { id: string; name: string },
  ): Promise<WarehouseBatch> {
    const assigned: string[] = [];
    for (const id of taskIds) {
      const task = await this.tasks.findOne({ where: { id } });
      if (!task || !['unassigned', 'assigned'].includes(task.status)) continue;
      task.riderId = rider.id;
      task.status = 'assigned';
      await this.tasks.save(task);
      assigned.push(task.orderReference);
      const order = await this.orders.findOne({ where: { id: task.orderId } });
      if (order) {
        order.riderId = rider.id;
        order.status = 'processing';
        await this.orders.save(order);
        this.emitter.toUser(order.customerId, 'order:updated', order);
        // Ops pages and (through the order fanout) the sellers on the order follow along.
        this.emitter.toRoles(OPS_ROOMS, 'order:updated', order);
        await this.notifications.toUser(order.customerId, {
          title: 'Rider assigned',
          body: `${rider.name} is handling ${order.reference}.`,
          type: 'delivery',
          entityId: order.id,
        });
      }
      this.emitter.toUser(rider.id, 'delivery:updated', task);
      this.emitter.toRoles(OPS_ROOMS, 'delivery:updated', task);
    }
    if (assigned.length) {
      await this.notifications.toUser(rider.id, {
        title: assigned.length === 1 ? 'New delivery assigned to you' : `${assigned.length} deliveries assigned to you`,
        body: `${assigned.slice(0, 5).join(', ')}${assigned.length > 5 ? '…' : ''} — collect them at the warehouse.`,
        type: 'task',
        extra: { view: 'active' },
      });
    }
    const batch = await this.batches.save(
      this.batches.create({
        reference: `BATCH-${Date.now().toString().slice(-6)}`,
        hubId,
        riderId: rider.id,
        riderName: rider.name,
        taskIds: JSON.stringify(taskIds),
        status: 'dispatched',
      }),
    );
    this.emitter.toRoles(OPS_ROOMS, 'batch:updated', batch);
    return batch;
  }

  /** COD reconciliation: cash collected per rider from delivered parcels (one grouped query). */
  async reconcile() {
    const rows = await this.tasks
      .createQueryBuilder('t')
      .select('t.riderId', 'riderId')
      .addSelect('COUNT(*)', 'parcels')
      .addSelect('COALESCE(SUM(t.codAmountUsd), 0)', 'codUsd')
      .where("t.status = 'delivered'")
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
