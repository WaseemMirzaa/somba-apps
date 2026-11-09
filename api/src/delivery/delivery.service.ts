import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, DeliveryStatus, DeliveryTask, Order, User } from '../database/entities';
import { ADMIN_ROLES } from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { PaymentsService } from '../payments/payments.service';
import { SettingsService } from '../content/settings.service';
import { cents, HALF_CENT, usd } from '../warehouse/cash.service';
import { pageOf } from '../common/paging';
import { tasksOfHub } from '../logistics/hub-scope';
import { isHubBound, isOrderFlow, kindLabel, riderNext } from '../logistics/leg-rules';
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
    cashUsd?: unknown,
  ): Promise<DeliveryTask> {
    const task = await this.tasks.findOne({ where: { id: taskId } });
    // Same answer for "missing" and "someone else's" so ids can't be probed.
    if (!task || task.riderId !== riderId) throw new NotFoundException('Delivery task not found.');
    const kind = task.kind ?? 'delivery';
    // A repeated "delivered" (a retry after a lost answer, a double tap) changes nothing: the cash is recorded once.
    if (status === 'delivered' && task.status === 'delivered' && !isHubBound(kind)) return this.repeatDelivered(task, cashUsd);
    if (status === 'delivered' && isHubBound(kind)) {
      throw new BadRequestException('This leg ends at the warehouse: warehouse staff scan the parcel in.');
    }
    // Proof of delivery: the customer's code must be entered to complete the handover.
    // Every wrong code is counted on the task in the database and locks the step after 5 (see delivery-code-lock.ts).
    if (status === 'delivered' && kind === 'delivery' && (await this.settings.get('requireDeliveryCode')) === 'true') {
      await this.checkDeliveryCode(task, code, riderId);
    }
    // C-cod: the cash the rider says they took must be exactly what is due, before anything is written.
    const cashDue = status === 'delivered' && kind === 'delivery' && isOrderFlow(task) ? DeliveryService.checkCash(task, cashUsd) : 0;
    // A parcel in a run that has not left is handed to the driver with the whole run (dispatch), not picked up on its own.
    if (task.runId && status === 'picked_up' && (await this.runs?.isPlanned(task.runId))) {
      throw new BadRequestException('This parcel is part of a transfer run. Manage it from the run.');
    }
    if (!riderNext(kind, task.status).includes(status)) {
      // "A pickup that is picked up cannot become assigned.": the leg's own name, the words of the statuses (see the logistics contract §10).
      throw new BadRequestException(`A ${kindLabel(kind)} that is ${task.status.replace('_', ' ')} cannot become ${String(status).replace('_', ' ')}.`);
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
        // The cash record is written with the status change itself: a delivered COD task always has its amount, time and rider.
        ...(cashDue > 0 ? { codCollectedUsd: cashDue, codCollectedAt: now, codCollectedById: riderId } : {}),
      })
      .where('id = :id AND status = :cur', { id: taskId, cur: task.status })
      .execute();
    if (!claim.affected) {
      // Lost a race with the very same request (two taps at once): the winner recorded it, this one just reports it.
      const now2 = await this.tasks.findOne({ where: { id: taskId } });
      if (status === 'delivered' && now2?.status === 'delivered') return this.repeatDelivered(now2, cashUsd);
      throw new BadRequestException('This delivery was just updated. Refresh and try again.');
    }
    const saved = (await this.tasks.findOne({ where: { id: taskId } }))!;

    // Collect COD when the customer's parcel is delivered.
    if (status === 'delivered' && kind === 'delivery' && isOrderFlow(saved)) {
      const rider = cashDue > 0 ? await this.tasks.manager.getRepository(User).findOne({ where: { id: riderId }, select: ['id', 'name'] }).catch(() => null) : null;
      const byName = rider?.name ?? 'Rider';
      await this.payments.markCollected(
        task.orderId,
        cashDue > 0 ? { amountUsd: cashDue, byId: riderId, byName, byRole: 'rider', at: now, taskId: saved.id, source: 'rider' } : undefined,
      );
      if (cashDue > 0) await this.auditCash('rider', byName, 'cod.collected', saved, `${saved.orderReference}: ${usd(cashDue)} collected at the door`);
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
    await this.auditCash('rider', name, 'delivery.code_failed', task, `${task.orderReference}: wrong delivery code, try ${failures} (rider ${riderId})`);
    if (lock) {
      await this.auditCash(
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
    if ((task.kind ?? 'delivery') !== 'delivery') throw new BadRequestException(CODE_MESSAGES.notLocked);
    const was = task.codeFailures ?? 0;
    if (was === 0 && !isCodeLocked(task, Date.now())) throw new BadRequestException(CODE_MESSAGES.notLocked);
    await this.tasks.update({ id: task.id }, { codeFailures: 0, codeLockedUntil: null });
    await this.auditCash(actor.role, actor.name, 'delivery.code_unlocked', task, `${task.orderReference}: delivery code unlocked by ${actor.name} (was at ${was} wrong tries)`);
    const saved = (await this.tasks.findOne({ where: { id: task.id } }))!;
    await this.logistics.emitTask(saved);
    try {
      await this.logistics.alertCodeUnlocked?.(saved);
    } catch {
      /* best effort */
    }
    return saved;
  }

  /**
   * C-cod: what a delivery must bring in. Returns the amount due to record (0 when the delivery is prepaid). A COD delivery
   * needs the rider to confirm the cash and the figure must be the amount due; anything else is refused with the amounts.
   */
  private static checkCash(task: DeliveryTask, cashUsd: unknown): number {
    const due = cents(task.codAmountUsd);
    const given = cashUsd === undefined || cashUsd === null || cashUsd === '' ? null : Number(cashUsd);
    if (given !== null && !Number.isFinite(given)) throw new BadRequestException('Enter the cash you collected as an amount in dollars.');
    if (due < HALF_CENT) {
      if (given !== null && given > HALF_CENT) throw new BadRequestException('No cash is due on this delivery: it is already paid.');
      return 0;
    }
    if (given === null) throw new BadRequestException(`Confirm the cash you collected: ${usd(due)} is due on this delivery.`);
    if (Math.abs(cents(given) - due) > HALF_CENT) {
      throw new BadRequestException(`The cash you entered (${usd(given)}) is not the amount to collect (${usd(due)}). Collect exactly ${usd(due)}, or ask the warehouse if the amount changed.`);
    }
    return due;
  }

  /**
   * The same "delivered" again: no new cash record. A different cash figure than the recorded one is still refused. If
   * the first request died after the delivery was written but before the payment was marked collected, this retry
   * finishes that (`markCollected` only acts on a payment that is still pending).
   */
  private async repeatDelivered(task: DeliveryTask, cashUsd: unknown): Promise<DeliveryTask> {
    const given = cashUsd === undefined || cashUsd === null || cashUsd === '' ? null : Number(cashUsd);
    if (given !== null && task.codCollectedUsd !== null && Math.abs(cents(given) - cents(task.codCollectedUsd)) > HALF_CENT) {
      throw new BadRequestException(`This delivery is already complete with ${usd(task.codCollectedUsd)} collected.`);
    }
    if (task.codCollectedAt && task.codCollectedUsd !== null && (task.kind ?? 'delivery') === 'delivery') {
      const rider = await this.tasks.manager.getRepository(User).findOne({ where: { id: task.codCollectedById ?? task.riderId ?? '' }, select: ['id', 'name'] }).catch(() => null);
      await this.payments.markCollected(task.orderId, { amountUsd: task.codCollectedUsd, byId: task.codCollectedById ?? '', byName: rider?.name ?? 'Rider', byRole: 'rider', at: task.codCollectedAt, taskId: task.id, source: 'rider' });
    }
    return task;
  }

  /** One audit line (fire-and-forget like the desk's other audit lines: the delivery must not fail because of it). */
  private async auditCash(role: string, name: string, action: string, task: DeliveryTask, detail: string): Promise<void> {
    try {
      const log = await this.tasks.manager.getRepository(AuditLog).save(
        this.tasks.manager.getRepository(AuditLog).create({ actor: name, role, action, entity: 'delivery', entityId: task.id, detail }),
      );
      this.emitter.toRoles(ADMIN_ROLES, 'audit:created', log);
    } catch {
      /* the cash record on the task is the source of truth */
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
    if (task.kind === 'delivery' || task.kind === 'replacement_delivery') {
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

  /** The code for the customer's CURRENT delivery of an order (only the owner may ask). */
  async codeForOrder(orderId: string): Promise<string | null> {
    const task = await this.tasks.findOne({ where: { orderId, kind: 'delivery' }, order: { createdAt: 'DESC' } });
    if (!task || task.status === 'delivered' || task.status === 'failed') return null;
    return this.getProofCode(task.id);
  }
}
