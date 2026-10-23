import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DeliveryStatus,
  DeliveryTask,
  Order,
  OrderItem,
  User,
} from '../database/entities';
import { ADMIN_ROLES } from '../notifications/notifications.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { PaymentsService } from '../payments/payments.service';
import { SettingsService } from '../content/settings.service';
import { pageOf } from '../common/paging';
import { sameHub, tasksOfHub } from '../common/zones/hub-scope';

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

/** Called when a rider reports a failed attempt (OrdersService re-opens or cancels the order). */
export type DeliveryFailedHandler = (task: DeliveryTask, reason: string) => Promise<void>;

@Injectable()
export class DeliveryService {
  private failedHandler: DeliveryFailedHandler | null = null;

  registerFailedHandler(fn: DeliveryFailedHandler) {
    this.failedHandler = fn;
  }

  constructor(
    @InjectRepository(DeliveryTask)
    private readonly tasks: Repository<DeliveryTask>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
    private readonly payments: PaymentsService,
    private readonly settings: SettingsService,
    @InjectRepository(User) private readonly users?: Repository<User>,
  ) {}

  /** Open tasks; for a warehouse-bound rider or staff member only their warehouse's (and unbound) tasks. */
  listUnassigned(paging?: unknown, hubId?: string | null): Promise<DeliveryTask[]> {
    const { take, skip } = pageOf(paging);
    return this.tasks.find({
      where: tasksOfHub({ status: 'unassigned' }, hubId),
      order: { createdAt: 'ASC' },
      take,
      skip,
    });
  }

  listForRider(riderId: string, paging?: unknown): Promise<DeliveryTask[]> {
    const { take, skip } = pageOf(paging);
    return this.tasks.find({
      where: { riderId },
      order: { updatedAt: 'DESC' },
      take,
      skip,
    });
  }

  /** Newest 200 by default (the dispatch desk's view); `limit`/`offset` page further back. */
  listAll(paging?: unknown, hubId?: string | null): Promise<DeliveryTask[]> {
    const { take, skip } = pageOf(paging, { def: 200 });
    return this.tasks.find({ where: tasksOfHub({}, hubId), order: { updatedAt: 'DESC' }, take, skip });
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
    // A rider takes tasks of their own warehouse only (the dispatch desk may assign across warehouses).
    if (!opts.reassign && this.users) {
      const [task, me] = await Promise.all([
        this.tasks.findOne({ where: { id: taskId }, select: ['id', 'hubId'] }),
        this.users.findOne({ where: { id: rider.id }, select: ['id', 'hubId'] }),
      ]);
      if (task && !sameHub(me?.hubId, task.hubId)) {
        throw new BadRequestException('This delivery belongs to another warehouse.');
      }
    }
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
      // Ops pages and (through the order fanout) every seller on the order follow along.
      this.emitter.toRoles(OPS_ROOMS, 'order:updated', order);
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
    // A rider who took the task themselves already knows; one assigned by the dispatch desk is told.
    if (opts.reassign) {
      await this.notifications.toUser(rider.id, {
        title: 'New delivery assigned to you',
        body: `${saved.orderReference} is now in your deliveries.`,
        type: 'task',
        entityId: saved.id,
        extra: { orderId: saved.orderId, view: 'active' },
      });
    }
    return saved;
  }

  /** Ops assign a task to a specific rider (dispatch desk). */
  /**
   * The dispatch desk gives a task to a rider. Admins may assign across warehouses; warehouse staff tied to a
   * warehouse (`staffHubId`) only assign their warehouse's parcels to their warehouse's riders.
   */
  async assign(
    taskId: string,
    rider: { id: string; name: string; hubId?: string | null },
    staffHubId?: string | null,
  ): Promise<DeliveryTask> {
    if (staffHubId) {
      const task = await this.tasks.findOne({ where: { id: taskId }, select: ['id', 'hubId'] });
      if (task && !sameHub(staffHubId, task.hubId)) throw new BadRequestException('This delivery belongs to another warehouse.');
      if (!sameHub(staffHubId, rider.hubId)) throw new BadRequestException('This rider works at another warehouse.');
    }
    return this.accept(taskId, { id: rider.id, name: rider.name }, { reassign: true });
  }

  /** The assigned rider advances the delivery; the customer order status follows along. */
  async updateStatus(
    taskId: string,
    status: DeliveryStatus,
    riderId: string,
    reason?: string,
    code?: string,
  ): Promise<DeliveryTask> {
    const task = await this.tasks.findOne({ where: { id: taskId } });
    // Same answer for "missing" and "someone else's" so ids can't be probed.
    if (!task || task.riderId !== riderId) throw new NotFoundException('Delivery task not found.');
    // Proof of delivery: the customer's code must be entered to complete the handover.
    if (status === 'delivered' && (await this.settings.get('requireDeliveryCode')) === 'true') {
      const expected = await this.getProofCode(task.id);
      if (expected && String(code ?? '').trim() !== expected) {
        throw new BadRequestException('Wrong delivery code. Ask the customer for the 4-digit code shown in their app.');
      }
    }
    if (!NEXT[task.status]?.includes(status)) {
      throw new BadRequestException(`A ${task.status.replace('_', ' ')} delivery cannot become ${String(status).replace('_', ' ')}.`);
    }
    const failure = status === 'failed' ? String(reason ?? '').trim().slice(0, 200) || 'Customer not reachable' : null;
    // Conditional on the status we just read: a double-tap can't apply it twice.
    const claim = await this.tasks
      .createQueryBuilder()
      .update(DeliveryTask)
      .set({
        status,
        ...(failure ? { failureReason: failure } : {}),
        ...(status === 'picked_up' ? { pickedUpAt: new Date() } : {}),
        ...(status === 'delivered' ? { deliveredAt: new Date() } : {}),
      })
      .where('id = :id AND status = :cur', { id: taskId, cur: task.status })
      .execute();
    if (!claim.affected) throw new BadRequestException('This delivery was just updated. Refresh and try again.');
    const saved = (await this.tasks.findOne({ where: { id: taskId } }))!;

    // Collect COD when the parcel is delivered.
    if (status === 'delivered') {
      await this.payments.markCollected(task.orderId);
    }

    // A failed attempt is not a dead end: the order is re-opened for another
    // attempt (or cancelled and refunded once the limit is reached).
    if (status === 'failed') {
      this.emitter.toRoles(OPS_ROOMS, 'delivery:updated', saved);
      if (saved.riderId) this.emitter.toUser(saved.riderId, 'delivery:updated', saved);
      if (this.failedHandler) await this.failedHandler(saved, failure ?? '');
      return saved;
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

  /** The seller says the parcel is packed and ready for pickup. */
  async markReady(orderId: string): Promise<DeliveryTask | null> {
    const task = await this.tasks.findOne({ where: { orderId, status: 'unassigned' } })
      ?? (await this.tasks.findOne({ where: { orderId, status: 'assigned' } }));
    if (!task) return null;
    if (!task.readyAt) {
      task.readyAt = new Date();
      await this.tasks.save(task);
    }
    this.emitter.toRoles(OPS_ROOMS, 'delivery:updated', task);
    if (task.riderId) this.emitter.toUser(task.riderId, 'delivery:updated', task);
    return task;
  }

  /** Hub staff scan the parcel in. Independent of the rider's progress. */
  async markReceived(taskId: string): Promise<DeliveryTask> {
    const task = await this.tasks.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Delivery task not found.');
    if (task.status === 'delivered' || task.status === 'failed') {
      throw new BadRequestException(`A ${task.status} parcel cannot be received.`);
    }
    if (!task.receivedAt) {
      task.receivedAt = new Date();
      await this.tasks.save(task);
    }
    // The packed seller packages are now at the hub (a seller still packing stays open).
    await this.tasks.manager.update(
      OrderItem,
      { orderId: task.orderId, fulfilment: 'ready' },
      { fulfilment: 'received', receivedAt: task.receivedAt },
    );
    this.emitter.toRoles(OPS_ROOMS, 'delivery:updated', task);
    if (task.riderId) this.emitter.toUser(task.riderId, 'delivery:updated', task);
    // The customer and every seller on the order see the parcel reach the warehouse.
    const order = await this.orders.findOne({ where: { id: task.orderId } });
    if (order) {
      this.emitter.toUser(order.customerId, 'order:updated', order);
      this.emitter.toRoles(OPS_ROOMS, 'order:updated', order);
      await this.notifications.toUser(order.customerId, {
        title: 'Parcel at our warehouse',
        body: `${order.reference} reached the Somba&Teka warehouse and will be on its way soon.`,
        type: 'delivery',
        entityId: order.id,
      });
    }
    return task;
  }

  /** The handover code (select:false column, so it is only ever read here and by the customer endpoint). */
  async getProofCode(taskId: string): Promise<string | null> {
    const row = await this.tasks.createQueryBuilder('t').addSelect('t.proofCode').where('t.id = :id', { id: taskId }).getOne();
    return row?.proofCode ?? null;
  }

  /** The code for the customer's CURRENT delivery of an order (only the owner may ask). */
  async codeForOrder(orderId: string): Promise<string | null> {
    const task = await this.tasks.findOne({ where: { orderId }, order: { createdAt: 'DESC' } });
    if (!task || task.status === 'delivered' || task.status === 'failed') return null;
    return this.getProofCode(task.id);
  }
}
