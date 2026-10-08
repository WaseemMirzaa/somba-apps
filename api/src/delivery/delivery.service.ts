import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DeliveryStatus,
  DeliveryTask,
  Order,
} from '../database/entities';
import { ADMIN_ROLES } from '../notifications/notifications.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { PaymentsService } from '../payments/payments.service';

const OPS_ROOMS = [...ADMIN_ROLES, 'warehouse_staff'];

/** Maps a delivery milestone onto the customer-facing order status. */
const ORDER_STATUS_FOR: Partial<Record<DeliveryStatus, Order['status']>> = {
  assigned: 'processing',
  picked_up: 'shipped',
  in_transit: 'out_for_delivery',
  delivered: 'delivered',
};

/** Allowed forward moves for a delivery (riders can't skip steps or rewind). */
const NEXT: Record<DeliveryStatus, DeliveryStatus[]> = {
  unassigned: [],
  assigned: ['picked_up', 'failed'],
  picked_up: ['in_transit', 'failed'],
  in_transit: ['delivered', 'failed'],
  delivered: [],
  failed: [],
};

@Injectable()
export class DeliveryService {
  constructor(
    @InjectRepository(DeliveryTask)
    private readonly tasks: Repository<DeliveryTask>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
    private readonly payments: PaymentsService,
  ) {}

  listUnassigned(): Promise<DeliveryTask[]> {
    return this.tasks.find({
      where: { status: 'unassigned' },
      order: { createdAt: 'ASC' },
    });
  }

  listForRider(riderId: string): Promise<DeliveryTask[]> {
    return this.tasks.find({
      where: { riderId },
      order: { updatedAt: 'DESC' },
    });
  }

  listAll(): Promise<DeliveryTask[]> {
    return this.tasks.find({ order: { updatedAt: 'DESC' }, take: 200 });
  }

  /**
   * Claim a task. The claim is ONE conditional UPDATE, so two riders racing for
   * the same task can't both win, and a task that's already on the road can't be
   * stolen. Ops (`reassign`) may also move a task that is assigned but not yet
   * picked up.
   */
  async accept(
    taskId: string,
    rider: { id: string; name: string },
    opts: { reassign?: boolean } = {},
  ): Promise<DeliveryTask> {
    const from = opts.reassign ? ['unassigned', 'assigned'] : ['unassigned'];
    const claim = await this.tasks
      .createQueryBuilder()
      .update(DeliveryTask)
      .set({ riderId: rider.id, status: 'assigned' })
      .where('id = :id AND status IN (:...from)', { id: taskId, from })
      .execute();
    if (!claim.affected) {
      const exists = await this.tasks.findOne({ where: { id: taskId } });
      if (!exists) throw new NotFoundException('Delivery task not found.');
      throw new BadRequestException('This delivery is no longer available.');
    }
    const saved = (await this.tasks.findOne({ where: { id: taskId } }))!;

    const order = await this.orders.findOne({ where: { id: saved.orderId } });
    if (order) {
      order.riderId = rider.id;
      order.status = 'processing';
      await this.orders.save(order);
      this.emitter.toUser(order.customerId, 'order:updated', order);
    }

    this.emitter.toUser(rider.id, 'delivery:updated', saved);
    this.emitter.toRoles(OPS_ROOMS, 'delivery:updated', saved);
    if (order) {
      await this.notifications.toUser(order.customerId, {
        title: 'Rider assigned',
        body: `${rider.name} is handling ${order.reference}.`,
        type: 'delivery',
        entityId: order.id,
      });
    }
    return saved;
  }

  /** Ops assign a task to a specific rider (dispatch desk). */
  async assign(
    taskId: string,
    rider: { id: string; name: string },
  ): Promise<DeliveryTask> {
    return this.accept(taskId, rider, { reassign: true });
  }

  /** The assigned rider advances the delivery; the customer order status follows along. */
  async updateStatus(
    taskId: string,
    status: DeliveryStatus,
    riderId: string,
  ): Promise<DeliveryTask> {
    const task = await this.tasks.findOne({ where: { id: taskId } });
    // Same answer for "missing" and "someone else's" so ids can't be probed.
    if (!task || task.riderId !== riderId) throw new NotFoundException('Delivery task not found.');
    if (!NEXT[task.status]?.includes(status)) {
      throw new BadRequestException(`A ${task.status.replace('_', ' ')} delivery cannot become ${String(status).replace('_', ' ')}.`);
    }
    // Conditional on the status we just read: a double-tap can't apply it twice.
    const claim = await this.tasks
      .createQueryBuilder()
      .update(DeliveryTask)
      .set({ status })
      .where('id = :id AND status = :cur', { id: taskId, cur: task.status })
      .execute();
    if (!claim.affected) throw new BadRequestException('This delivery was just updated. Refresh and try again.');
    const saved = (await this.tasks.findOne({ where: { id: taskId } }))!;

    // Collect COD when the parcel is delivered.
    if (status === 'delivered') {
      await this.payments.markCollected(task.orderId);
    }

    const order = await this.orders.findOne({ where: { id: task.orderId } });
    const mapped = ORDER_STATUS_FOR[status];
    // Never resurrect an order that was cancelled/returned meanwhile.
    if (order && mapped && order.status !== 'cancelled' && order.status !== 'returned') {
      order.status = mapped;
      await this.orders.save(order);
      this.emitter.toUser(order.customerId, 'order:updated', order);
      this.emitter.toRoles(OPS_ROOMS, 'order:updated', order);
      await this.notifications.toUser(order.customerId, {
        title: 'Delivery update',
        body: `${order.reference} is now ${mapped.replace(/_/g, ' ')}.`,
        type: 'delivery',
        entityId: order.id,
      });
    }

    this.emitter.toRoles(OPS_ROOMS, 'delivery:updated', saved);
    if (saved.riderId) this.emitter.toUser(saved.riderId, 'delivery:updated', saved);
    return saved;
  }

  /** High-frequency live position pushed to the customer + ops maps. */
  async updateLocation(
    taskId: string,
    riderId: string,
    lat: number,
    lng: number,
  ): Promise<void> {
    const task = await this.tasks.findOne({ where: { id: taskId } });
    if (!task || task.riderId !== riderId) return;
    if (!(Math.abs(lat) <= 90) || !(Math.abs(lng) <= 180)) return;
    task.lat = lat;
    task.lng = lng;
    await this.tasks.save(task);

    const payload = { taskId, orderId: task.orderId, lat, lng };
    const order = await this.orders.findOne({ where: { id: task.orderId } });
    if (order) this.emitter.toUser(order.customerId, 'delivery:location', payload);
    this.emitter.toRoles(OPS_ROOMS, 'delivery:location', payload);
  }
}
