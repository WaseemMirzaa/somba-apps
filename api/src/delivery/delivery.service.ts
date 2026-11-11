import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuditLog, DeliveryStatus, DeliveryTask, Order, User } from '../database/entities';
import { AUDIT_ROLES } from '../common/role-groups';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { SettingsService } from '../content/settings.service';
import { pageOf } from '../common/paging';
import { tasksOfHub } from '../logistics/hub-scope';
import { CUSTOMER_KINDS, isCustomerKind, isHubBound, kindWithArticle, riderNext } from '../logistics/leg-rules';
import { Actor, LogisticsService } from '../logistics/logistics.service';
import { RunsService } from '../logistics/runs.service';
import { DESK_ROLES, tierAllows } from '../logistics/tiers';
import { ALERT_FROM, CODE_MESSAGES, CodeLock, isCodeLocked, lockAfter, lockedMessage, sameCode, triesLeft } from './delivery-code-lock';

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
    // A repeated "delivered" (a retry after a lost answer, a double tap) changes nothing.
    if (status === 'delivered' && task.status === 'delivered' && !isHubBound(kind)) return task;
    if (status === 'delivered' && isHubBound(kind)) {
      throw new BadRequestException('This leg ends at the warehouse: warehouse staff scan the parcel in.');
    }
    // Proof of delivery: the customer's code must be entered to complete the handover.
    // Every wrong code is counted on the task in the database and locks the step after 5 (see delivery-code-lock.ts).
    if (status === 'delivered' && isCustomerKind(kind) && (await this.settings.get('requireDeliveryCode')) === 'true') {
      await this.checkDeliveryCode(task, code, riderId);
    }
    // A parcel in a run that has not left is handed to the driver with the whole run (dispatch), not picked up on its own.
    if (task.runId && status === 'picked_up' && (await this.runs?.isPlanned(task.runId))) {
      throw new BadRequestException('This parcel is part of a transfer run. Manage it from the run.');
    }
    if (!riderNext(kind, task.status).includes(status)) {
      // "A pickup that is picked up cannot become assigned.": the leg's own name, the words of the statuses (see the logistics contract §10); "An express delivery that is picked up cannot become assigned." takes its article from the label.
      throw new BadRequestException(`${kindWithArticle(kind).replace(/^./, (c) => c.toUpperCase())} that is ${task.status.replace('_', ' ')} cannot become ${String(status).replace('_', ' ')}.`);
    }
    const now = new Date();
    const failure = status === 'failed' ? String(reason ?? '').trim().slice(0, 200) || 'Customer not reachable' : null;
    // Conditional on the status we just read: a double-tap can't apply it twice.
    const claim = await this.tasks
      .createQueryBuilder()
      .update(DeliveryTask)
      .set({
        status,
        ...(failure ? { failureReason: failure } : {}),
        ...(status === 'picked_up' ? { pickedUpAt: new Date() } : {}),
        ...(status === 'delivered' ? { deliveredAt: now } : {}),
      })
      .where('id = :id AND status = :cur', { id: taskId, cur: task.status })
      .execute();
    if (!claim.affected) {
      // Lost a race with the very same request (two taps at once): the winner recorded it, this one just reports it.
      const now2 = await this.tasks.findOne({ where: { id: taskId } });
      if (status === 'delivered' && now2?.status === 'delivered') return now2;
      throw new BadRequestException('This delivery was just updated. Refresh and try again.');
    }
    const saved = (await this.tasks.findOne({ where: { id: taskId } }))!;

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

  /**
   * The ONE place the customer's code is compared (RD-01). Order of events, all in the database:
   *  1. a locked task refuses every try, the correct code included, with the lock message;
   *  2. the try is COUNTED before the comparison, by a compare-and-swap on the stored counter, so parallel guesses cannot
   *     slip through between "read the count" and "write the count" (at most 5 comparisons per lock);
   *  3. a correct code (compared in constant time) clears the counter: it never counts as a failure;
   *  4. a wrong one is audited, alerts the warehouse from the 3rd on, and answers with what to do.
   * A task with no stored code (nothing to compare with) and an empty field (not a guess) are not counted.
   */
  private async checkDeliveryCode(task: DeliveryTask, code: unknown, riderId: string): Promise<void> {
    const expected = await this.getProofCode(task.id);
    if (!expected) return;
    const now = Date.now();
    if (isCodeLocked(task, now)) throw new BadRequestException(lockedMessage(task, now));
    if (String(code ?? '').trim() === '') throw new BadRequestException(CODE_MESSAGES.wrong);
    const { failures, lock } = await this.countTry(task.id);
    if (sameCode(code, expected)) {
      await this.tasks.update({ id: task.id }, { codeFailures: 0, codeLockedUntil: null });
      return;
    }
    await this.onWrongCode(task, riderId, failures, lock);
    throw new BadRequestException(lock ? lockedMessage({ codeFailures: failures, codeLockedUntil: lock.until }, Date.now()) : triesLeft(failures) <= 2 ? CODE_MESSAGES.wrongLeft(triesLeft(failures)) : CODE_MESSAGES.wrong);
  }

  /** Count one try on the task (compare-and-swap on the stored counter; refused when the step is locked). */
  private async countTry(taskId: string): Promise<{ failures: number; lock: CodeLock | null }> {
    for (let i = 0; i < 12; i++) {
      const row = await this.tasks.findOne({ where: { id: taskId }, select: ['id', 'codeFailures', 'codeLockedUntil'] });
      if (!row) throw new NotFoundException('Delivery task not found.');
      const now = Date.now();
      if (isCodeLocked(row, now)) throw new BadRequestException(lockedMessage(row, now));
      const seen = row.codeFailures ?? 0;
      const failures = seen + 1;
      const lock = lockAfter(failures, now);
      const claim = await this.tasks
        .createQueryBuilder()
        .update(DeliveryTask)
        .set({ codeFailures: failures, codeLockedUntil: lock?.until ?? null })
        .where('id = :id AND codeFailures = :seen', { id: taskId, seen })
        .execute();
      if (claim.affected) return { failures, lock };
    }
    throw new BadRequestException('This delivery was just updated. Refresh and try again.');
  }

  /** A wrong code: one audit line (the task, the rider and the count, never the guess) and the alert to the warehouse side. */
  private async onWrongCode(task: DeliveryTask, riderId: string, failures: number, lock: CodeLock | null): Promise<void> {
    const rider = await this.tasks.manager.getRepository(User).findOne({ where: { id: riderId }, select: ['id', 'name'] }).catch(() => null);
    const name = rider?.name ?? 'Rider';
    await this.auditLine('rider', name, 'delivery.code_failed', task, `${task.orderReference}: wrong delivery code, try ${failures} (rider ${riderId})`);
    if (lock) {
      await this.auditLine(
        'rider',
        name,
        'delivery.code_locked',
        task,
        `${task.orderReference}: delivery code locked after ${failures} wrong tries (rider ${riderId}), ${lock.supervisor ? 'until a supervisor unlocks it' : `for ${lock.minutes} minutes`}`,
      );
    }
    if (failures >= ALERT_FROM) {
      try {
        await this.logistics.alertCodeFailures?.(task, name, failures, lock);
      } catch {
        /* the alert is best effort: the count and the lock are already saved */
      }
    }
  }

  /**
   * A warehouse supervisor (or an operations admin) clears the counter and the lock of a task, typically after phoning the
   * customer. Audited, and the rider is told. Operators and other warehouses' staff cannot.
   */
  async resetCodeLock(taskId: string, actor: Actor): Promise<DeliveryTask> {
    const task = await this.tasks.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Delivery task not found.');
    const mayUnlock = actor.role === 'admin' || actor.role === 'admin_operations' || (actor.role === 'warehouse_staff' && tierAllows(actor.role, actor.tier, 'oversee'));
    if (!mayUnlock) throw new BadRequestException(CODE_MESSAGES.notAllowedToUnlock);
    if (actor.hubId && !this.logistics.touches(task, actor.hubId)) throw new BadRequestException('This task belongs to another warehouse.');
    if (!isCustomerKind(task.kind ?? 'delivery')) throw new BadRequestException(CODE_MESSAGES.notLocked);
    const was = task.codeFailures ?? 0;
    if (was === 0 && !isCodeLocked(task, Date.now())) throw new BadRequestException(CODE_MESSAGES.notLocked);
    await this.tasks.update({ id: task.id }, { codeFailures: 0, codeLockedUntil: null });
    await this.auditLine(actor.role, actor.name, 'delivery.code_unlocked', task, `${task.orderReference}: delivery code unlocked by ${actor.name} (was at ${was} wrong tries)`);
    const saved = (await this.tasks.findOne({ where: { id: task.id } }))!;
    await this.logistics.emitTask(saved);
    try {
      await this.logistics.alertCodeUnlocked?.(saved);
    } catch {
      /* best effort */
    }
    return saved;
  }

  /** One audit line (fire-and-forget like the desk's other audit lines: the delivery must not fail because of it). */
  private async auditLine(role: string, name: string, action: string, task: DeliveryTask, detail: string): Promise<void> {
    try {
      const log = await this.tasks.manager.getRepository(AuditLog).save(
        this.tasks.manager.getRepository(AuditLog).create({ actor: name, role, action, entity: 'delivery', entityId: task.id, detail }),
      );
      this.emitter.toRoles(AUDIT_ROLES, 'audit:created', log);
    } catch {
      /* the audit line is best effort */
    }
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
    if (isCustomerKind(task.kind) || task.kind === 'replacement_delivery') {
      const order = await this.orders.findOne({ where: { id: task.orderId } });
      if (order) this.emitter.toUser(order.customerId, 'delivery:location', payload);
    }
    for (const h of new Set([task.hubId, task.fromHubId, task.toHubId].filter((x): x is string => !!x))) this.emitter.toHub(h, 'delivery:location', payload);
    this.emitter.toRoles(DESK_ROLES, 'delivery:location', payload);
  }

  /** The handover code (select:false column, so it is only ever read here and by the customer endpoint). */
  async getProofCode(taskId: string): Promise<string | null> {
    return this.logistics.proofCodeOf(taskId);
  }

  /**
   * The code for the customer's OPEN delivery of an order (only the owner may ask): a split order has one customer leg open at a time,
   * and each has its own code, so this is the code of the leg that is waiting for, or on its way to, the customer now.
   */
  async codeForOrder(orderId: string): Promise<string | null> {
    const task = await this.tasks.findOne({ where: { orderId, kind: In([...CUSTOMER_KINDS]), status: In(['unassigned', 'assigned', 'picked_up', 'in_transit']) }, order: { createdAt: 'DESC' } });
    if (!task) return null;
    return this.getProofCode(task.id);
  }
}
