import { Injectable, NotFoundException } from '@nestjs/common';
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

  /** A rider claims an unassigned task. */
  async accept(taskId: string, rider: { id: string; name: string }): Promise<DeliveryTask> {
    const task = await this.tasks.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Delivery task not found.');
    task.riderId = rider.id;
    task.status = 'assigned';
    const saved = await this.tasks.save(task);

    const order = await this.orders.findOne({ where: { id: task.orderId } });
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

  /** Ops assign an unassigned task to a specific rider (dispatch desk). */
  async assign(
    taskId: string,
    rider: { id: string; name: string },
  ): Promise<DeliveryTask> {
    return this.accept(taskId, rider);
  }

  /** Rider advances the delivery; the customer order status follows along. */
  async updateStatus(
    taskId: string,
    status: DeliveryStatus,
  ): Promise<DeliveryTask> {
    const task = await this.tasks.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Delivery task not found.');
    task.status = status;
    const saved = await this.tasks.save(task);

    // Collect COD when the parcel is delivered.
    if (status === 'delivered') {
      await this.payments.markCollected(task.orderId);
    }

    const order = await this.orders.findOne({ where: { id: task.orderId } });
    const mapped = ORDER_STATUS_FOR[status];
    if (order && mapped) {
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
    task.lat = lat;
    task.lng = lng;
    await this.tasks.save(task);

    const payload = { taskId, orderId: task.orderId, lat, lng };
    const order = await this.orders.findOne({ where: { id: task.orderId } });
    if (order) this.emitter.toUser(order.customerId, 'delivery:location', payload);
    this.emitter.toRoles(OPS_ROOMS, 'delivery:location', payload);
  }
}
