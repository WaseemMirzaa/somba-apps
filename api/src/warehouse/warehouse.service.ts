import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DeliveryTask,
  Hub,
  Order,
  Product,
  StockTransfer,
  WarehouseBatch,
} from '../database/entities';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';

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
    private readonly emitter: RealtimeEmitter,
  ) {}

  listHubs(): Promise<Hub[]> {
    return this.hubs.find();
  }

  /** Parcels grouped for the warehouse pipeline (inbound → dispatched). */
  async parcels(stage?: string): Promise<DeliveryTask[]> {
    const all = await this.tasks.find({ order: { createdAt: 'DESC' } });
    if (!stage || stage === 'all') return all;
    const map: Record<string, string[]> = {
      inbound: ['unassigned'],
      sorting: ['assigned'],
      dispatched: ['picked_up', 'in_transit'],
      delivered: ['delivered'],
      exceptions: ['failed'],
    };
    const statuses = map[stage] ?? [stage];
    return all.filter((t) => statuses.includes(t.status));
  }

  /** Parcels not delivered, oldest first. */
  async aged(): Promise<DeliveryTask[]> {
    const open = await this.tasks.find({ order: { createdAt: 'ASC' } });
    return open.filter((t) => t.status !== 'delivered' && t.status !== 'failed');
  }

  /** Inventory levels by product/SKU. */
  async inventory() {
    const products = await this.products.find();
    return products.map((p) => ({
      sku: `SKU-${p.id.slice(0, 6)}`,
      productId: p.id,
      name: p.name,
      category: p.category,
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
    for (const id of taskIds) {
      const task = await this.tasks.findOne({ where: { id } });
      if (!task) continue;
      task.riderId = rider.id;
      task.status = 'assigned';
      await this.tasks.save(task);
      const order = await this.orders.findOne({ where: { id: task.orderId } });
      if (order) {
        order.riderId = rider.id;
        order.status = 'processing';
        await this.orders.save(order);
        this.emitter.toUser(order.customerId, 'order:updated', order);
      }
      this.emitter.toUser(rider.id, 'delivery:updated', task);
      this.emitter.toRoles(OPS_ROOMS, 'delivery:updated', task);
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

  /** COD reconciliation: cash collected per rider from delivered parcels. */
  async reconcile() {
    const delivered = await this.tasks.find({ where: { status: 'delivered' } });
    const byRider: Record<string, { riderId: string; parcels: number; codUsd: number }> = {};
    for (const t of delivered) {
      const key = t.riderId ?? 'unassigned';
      byRider[key] = byRider[key] ?? { riderId: key, parcels: 0, codUsd: 0 };
      byRider[key].parcels += 1;
      byRider[key].codUsd += t.codAmountUsd;
    }
    return Object.values(byRider).map((r) => ({
      ...r,
      codUsd: Number(r.codUsd.toFixed(2)),
    }));
  }

  listTransfers(): Promise<StockTransfer[]> {
    return this.transfers.find({ order: { createdAt: 'DESC' }, take: 100 });
  }

  async createTransfer(data: Partial<StockTransfer>): Promise<StockTransfer> {
    const transfer = await this.transfers.save(
      this.transfers.create({
        ...data,
        reference: `TRF-${Date.now().toString().slice(-6)}`,
        status: 'requested',
      }),
    );
    this.emitter.toRoles(OPS_ROOMS, 'transfer:updated', transfer);
    return transfer;
  }
}
