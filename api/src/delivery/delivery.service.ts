import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeliveryStatus, DeliveryTask, Order } from '../database/entities';
import { ADMIN_ROLES } from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { PaymentsService } from '../payments/payments.service';
import { SettingsService } from '../content/settings.service';
import { pageOf } from '../common/paging';
import { tasksOfHub } from '../logistics/hub-scope';
import { isHubBound, isOrderFlow, kindLabel, riderNext } from '../logistics/leg-rules';
import { LogisticsService } from '../logistics/logistics.service';
import { RunsService } from '../logistics/runs.service';

/** Called when a rider reports a failed attempt (OrdersService re-opens the leg or cancels the order). */
export type DeliveryFailedHandler = (task: DeliveryTask, reason: string) => Promise<void>;

/**
 * What a rider does with the tasks the warehouse gave them: pick up, go, hand over (or fail). Assigning is the
 * warehouse desk's job ({@link LogisticsService.assign}); riders never take tasks themselves.
 */
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
    private readonly emitter: RealtimeEmitter,
    private readonly payments: PaymentsService,
    private readonly settings: SettingsService,
    private readonly logistics: LogisticsService,
    private readonly runs?: RunsService,
  ) {}

  /** Open tasks nobody has been given yet, for a warehouse (staff). */
  listUnassigned(paging?: unknown, hubId?: string | null): Promise<DeliveryTask[]> {
    const { take, skip } = pageOf(paging);
    return this.tasks.find({
      where: tasksOfHub({ status: 'unassigned' }, hubId),
      order: { createdAt: 'ASC' },
      take,
      skip,
    });
  }

  /** A rider's own tasks (only what was assigned to them). */
  listForRider(riderId: string, paging?: unknown): Promise<DeliveryTask[]> {
    const { take, skip } = pageOf(paging);
    return this.tasks.find({
      where: { riderId },
      order: { updatedAt: 'DESC' },
      take,
      skip,
    });
  }

  /** Newest 200 by default (the dispatch desk's view); `limit`/`offset` page further back. Limited to one warehouse when `hubId` is given. */
  listAll(paging?: unknown, hubId?: string | null): Promise<DeliveryTask[]> {
    const { take, skip } = pageOf(paging, { def: 200 });
    return this.tasks.find({ where: tasksOfHub({}, hubId), order: { updatedAt: 'DESC' }, take, skip });
  }

  /** Riders no longer take tasks themselves: the warehouse that manages the task gives it to them. */
  accept(_taskId?: string): Promise<DeliveryTask> {
    void _taskId;
    throw new BadRequestException('Your warehouse assigns your tasks. You cannot accept a task yourself.');
  }

  /** The assigned rider advances the task; the customer order status follows on the order's own legs. */
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
    const kind = task.kind ?? 'delivery';
    if (status === 'delivered' && isHubBound(kind)) {
      throw new BadRequestException('This leg ends at the warehouse: warehouse staff scan the parcel in.');
    }
    // Proof of delivery: the customer's code must be entered to complete the handover.
    if (status === 'delivered' && kind === 'delivery' && (await this.settings.get('requireDeliveryCode')) === 'true') {
      const expected = await this.getProofCode(task.id);
      if (expected && String(code ?? '').trim() !== expected) {
        throw new BadRequestException('Wrong delivery code. Ask the customer for the 4-digit code shown in their app.');
      }
    }
    // A parcel in a run that has not left is handed to the driver with the whole run (dispatch), not picked up on its own.
    if (task.runId && status === 'picked_up' && (await this.runs?.isPlanned(task.runId))) {
      throw new BadRequestException('This parcel is part of a transfer run. Manage it from the run.');
    }
    if (!riderNext(kind, task.status).includes(status)) {
      // "A pickup that is picked up cannot become assigned.": the leg's own name, the words of the statuses (see the logistics contract §10).
      throw new BadRequestException(`A ${kindLabel(kind)} that is ${task.status.replace('_', ' ')} cannot become ${String(status).replace('_', ' ')}.`);
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

    // Collect COD when the customer's parcel is delivered.
    if (status === 'delivered' && kind === 'delivery' && isOrderFlow(saved)) {
      await this.payments.markCollected(task.orderId);
    }

    // A failed attempt is not a dead end: the leg is re-opened for another attempt (or the order is cancelled and
    // refunded once the limit is reached).
    if (status === 'failed') {
      await this.logistics.emitTask(saved);
      if (this.failedHandler) await this.failedHandler(saved, failure ?? '');
      return saved;
    }

    await this.logistics.afterRiderStatus(saved, status);
    // A parcel of a dispatched transfer run reported on the road: the whole run is on the road.
    if (status === 'in_transit' && saved.runId) await this.runs?.onTaskInTransit(saved);
    return saved;
  }

  /** High-frequency live position pushed to the customer + the warehouses and admins following the task. */
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

    const payload = { taskId, orderId: task.orderId, kind: task.kind, lat, lng };
    // Only the customer waiting for their own parcel watches the rider on a map.
    if (task.kind === 'delivery' || task.kind === 'replacement_delivery') {
      const order = await this.orders.findOne({ where: { id: task.orderId } });
      if (order) this.emitter.toUser(order.customerId, 'delivery:location', payload);
    }
    for (const h of new Set([task.hubId, task.fromHubId, task.toHubId].filter((x): x is string => !!x))) this.emitter.toHub(h, 'delivery:location', payload);
    this.emitter.toRoles(ADMIN_ROLES, 'delivery:location', payload);
  }

  /** The handover code (select:false column, so it is only ever read here and by the customer endpoint). */
  async getProofCode(taskId: string): Promise<string | null> {
    return this.logistics.proofCodeOf(taskId);
  }

  /** The code for the customer's CURRENT delivery of an order (only the owner may ask). */
  async codeForOrder(orderId: string): Promise<string | null> {
    const task = await this.tasks.findOne({ where: { orderId, kind: 'delivery' }, order: { createdAt: 'DESC' } });
    if (!task || task.status === 'delivered' || task.status === 'failed') return null;
    return this.getProofCode(task.id);
  }
}
