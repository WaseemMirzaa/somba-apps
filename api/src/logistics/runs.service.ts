import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { AuditLog, DeliveryTask, Hub, TransferRun, TransferRunStatus, User, WarehouseException } from '../database/entities';
import { ADMIN_ROLES, NotificationsService } from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { Actor, LogisticsService } from './logistics.service';
import { tierAllows } from './tiers';

/** The legs a run can carry: warehouse-to-warehouse transfers (on the way out and on the way back). */
const RUN_KINDS = ['transfer', 'return_transfer'] as const;
const WAITING = ['unassigned', 'assigned'] as const;
const ON_THE_ROAD = ['picked_up', 'in_transit'] as const;

/** A transfer run as clients receive it. */
export interface RunView {
  id: string;
  reference: string;
  fromHubId: string;
  fromHubName: string;
  toHubId: string;
  toHubName: string;
  riderId: string | null;
  riderName: string | null;
  status: TransferRunStatus;
  taskIds: string[];
  count: number;
  receivedCount: number;
  missingCount: number;
  createdAt: Date;
  dispatchedAt: Date | null;
  /** The driver reported the run on the road (`rider:runStatus` or the first `in_transit` update of a parcel). */
  inTransit: boolean;
  inTransitAt: Date | null;
  arrivedAt: Date | null;
  closedAt: Date | null;
}

export interface RunProposal {
  toHubId: string;
  toHubName: string;
  taskIds: string[];
  count: number;
}

const missingReason = (ref: string) => `Parcel missing from run ${ref}.`;

/**
 * Transfer runs: one trip between two warehouses carrying many parcels (a manifest). The sending warehouse groups the
 * transfer legs that wait to leave for the same next warehouse, gives the run ONE driver, and hands it over; the driver
 * reports it on the road; the receiving warehouse scans it in (all at once or parcel by parcel) and closes it, which
 * turns parcels that never arrived into exceptions. Each hop of a multi-warehouse route is its own run, assigned by
 * the sending warehouse of that hop: a driver is never carried over to the next hop. Several drivers on one lane are
 * several runs ({@link split}). See docs/contracts/areas.md.
 */
@Injectable()
export class RunsService {
  constructor(
    @InjectRepository(TransferRun) private readonly runs: Repository<TransferRun>,
    @InjectRepository(DeliveryTask) private readonly tasks: Repository<DeliveryTask>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Hub) private readonly hubs: Repository<Hub>,
    @InjectRepository(WarehouseException) private readonly exceptions: Repository<WarehouseException>,
    @InjectRepository(AuditLog) private readonly audits: Repository<AuditLog>,
    private readonly logistics: LogisticsService,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  // ── views and pushes ─────────────────────────────────────────────────────────
  async viewMany(runs: TransferRun[]): Promise<RunView[]> {
    if (!runs.length) return [];
    const hubs = new Map((await this.hubs.find({ select: { id: true, name: true } })).map((h) => [h.id, h.name]));
    const riderIds = [...new Set(runs.map((r) => r.riderId).filter((x): x is string => !!x))];
    const riders = riderIds.length ? new Map((await this.users.find({ where: { id: In(riderIds) }, select: ['id', 'name'] })).map((u) => [u.id, u.name])) : new Map<string, string>();
    const members = await this.tasks.find({ where: { runId: In(runs.map((r) => r.id)) }, select: ['id', 'runId', 'status', 'failureReason', 'createdAt'], order: { createdAt: 'ASC' } });
    return runs.map((r) => {
      const mine = members.filter((t) => t.runId === r.id);
      return {
        id: r.id,
        reference: r.reference,
        fromHubId: r.fromHubId,
        fromHubName: hubs.get(r.fromHubId) ?? r.fromHubId,
        toHubId: r.toHubId,
        toHubName: hubs.get(r.toHubId) ?? r.toHubId,
        riderId: r.riderId ?? null,
        riderName: r.riderId ? (riders.get(r.riderId) ?? null) : null,
        status: r.status,
        taskIds: mine.map((t) => t.id),
        count: mine.length,
        receivedCount: mine.filter((t) => t.status === 'delivered').length,
        missingCount: mine.filter((t) => t.status === 'failed' && t.failureReason === missingReason(r.reference)).length,
        createdAt: r.createdAt,
        dispatchedAt: r.dispatchedAt ?? null,
        inTransit: !!r.inTransitAt,
        inTransitAt: r.inTransitAt ?? null,
        arrivedAt: r.arrivedAt ?? null,
        closedAt: r.closedAt ?? null,
      };
    });
  }

  async view(run: TransferRun): Promise<RunView> {
    return (await this.viewMany([run]))[0];
  }

  /** `run:updated` goes to both warehouses, the admins and the run's driver. */
  private async push(run: TransferRun, extraRiders: (string | null)[] = []): Promise<RunView> {
    const fresh = (await this.runs.findOne({ where: { id: run.id } })) ?? run;
    const view = await this.view(fresh);
    this.emitter.toHub(fresh.fromHubId, 'run:updated', view);
    this.emitter.toHub(fresh.toHubId, 'run:updated', view);
    this.emitter.toRoles(ADMIN_ROLES, 'run:updated', view);
    for (const id of new Set([fresh.riderId, ...extraRiders].filter((x): x is string => !!x))) this.emitter.toUser(id, 'run:updated', view);
    return view;
  }

  private audit(actor: Actor | null, action: string, run: TransferRun, detail?: string): void {
    if (!actor) return;
    void this.audits
      .save(this.audits.create({ actor: actor.name, role: actor.role, action, entity: 'transfer_run', entityId: run.id, detail: detail ?? run.reference }))
      .then((log) => this.emitter.toRoles(ADMIN_ROLES, 'audit:created', log))
      .catch(() => undefined);
  }

  // ── permissions ──────────────────────────────────────────────────────────────
  private isAdmin(actor: Actor): boolean {
    return actor.role.startsWith('admin');
  }

  /** Supervisor+ of the SENDING warehouse (admins: any) may create, change, assign and dispatch a run. */
  private assertSender(actor: Actor, run: Pick<TransferRun, 'fromHubId'>): void {
    if (this.isAdmin(actor)) return;
    if (!tierAllows(actor.role, actor.tier, 'assign')) throw new BadRequestException('Only supervisors and managers can assign riders.');
    if (!actor.hubId || actor.hubId !== run.fromHubId) throw new BadRequestException('This task belongs to another warehouse.');
  }

  /** Any staff of the RECEIVING warehouse (admins: any) may receive a run. */
  private assertReceiver(actor: Actor, run: Pick<TransferRun, 'toHubId'>): void {
    if (this.isAdmin(actor)) return;
    if (!tierAllows(actor.role, actor.tier, 'scan')) throw new BadRequestException('Staff only.');
    if (!actor.hubId || actor.hubId !== run.toHubId) throw new BadRequestException('This parcel is not due at your warehouse.');
  }

  private async load(runId: unknown): Promise<TransferRun> {
    const run = await this.runs.findOne({ where: { id: typeof runId === 'string' ? runId : '' } });
    if (!run) throw new NotFoundException('Run not found.');
    return run;
  }

  private async members(run: TransferRun): Promise<DeliveryTask[]> {
    return this.tasks.find({ where: { runId: run.id }, order: { createdAt: 'ASC' } });
  }

  // ── reads ────────────────────────────────────────────────────────────────────
  /** Runs of my warehouse (`direction` out = it sends, in = it receives, both by default). Admins: every run, or one warehouse's. */
  async list(actor: Actor, opts: { status?: string; direction?: string; hubId?: string | null }): Promise<RunView[]> {
    const hubId = this.isAdmin(actor) ? (opts.hubId ?? null) : (actor.hubId ?? null);
    if (!this.isAdmin(actor) && !hubId) throw new BadRequestException('Your account is not linked to a warehouse. Ask an administrator.');
    const status = opts.status && opts.status !== 'open' ? (opts.status as TransferRunStatus) : undefined;
    const scope: Record<string, unknown>[] = !hubId ? [{}] : opts.direction === 'out' ? [{ fromHubId: hubId }] : opts.direction === 'in' ? [{ toHubId: hubId }] : [{ fromHubId: hubId }, { toHubId: hubId }];
    const where = scope.map((s) => ({ ...s, ...(status ? { status } : {}) }));
    let rows = await this.runs.find({ where: where as never, order: { createdAt: 'DESC' }, take: 200 });
    if (opts.status === 'open') rows = rows.filter((r) => r.status !== 'closed');
    return this.viewMany(rows);
  }

  /** Transfer legs waiting at my warehouse (not yet in a run), grouped by the next warehouse. */
  async proposals(actor: Actor, hubIdArg?: string | null): Promise<RunProposal[]> {
    const hubId = this.isAdmin(actor) ? (hubIdArg ?? null) : (actor.hubId ?? null);
    if (!hubId) throw new BadRequestException(this.isAdmin(actor) ? 'Choose a warehouse.' : 'Your account is not linked to a warehouse. Ask an administrator.');
    const waiting = await this.tasks.find({
      where: RUN_KINDS.map((kind) => ({ kind, fromHubId: hubId, status: In([...WAITING]), runId: IsNull() })) as never,
      order: { createdAt: 'ASC' },
    });
    const names = new Map((await this.hubs.find({ select: { id: true, name: true } })).map((h) => [h.id, h.name]));
    const groups = new Map<string, string[]>();
    for (const t of waiting) if (t.toHubId) groups.set(t.toHubId, [...(groups.get(t.toHubId) ?? []), t.id]);
    return [...groups].map(([toHubId, taskIds]) => ({ toHubId, toHubName: names.get(toHubId) ?? toHubId, taskIds, count: taskIds.length })).sort((a, b) => a.toHubName.localeCompare(b.toHubName));
  }

  /** The runs a driver was given (open ones, and those closed in the last few days). */
  async forRider(riderId: string): Promise<RunView[]> {
    const since = new Date(Date.now() - 3 * 86_400_000);
    const rows = (await this.runs.find({ where: { riderId }, order: { createdAt: 'DESC' }, take: 100 })).filter((r) => r.status !== 'closed' || (r.closedAt ?? r.updatedAt) >= since);
    return this.viewMany(rows);
  }

  // ── building a run ───────────────────────────────────────────────────────────
  private async nextReference(): Promise<string> {
    const last = await this.runs.createQueryBuilder('r').select('r.reference', 'reference').orderBy('r.createdAt', 'DESC').addOrderBy('r.reference', 'DESC').limit(50).getRawMany<{ reference: string }>();
    const top = last.reduce((m, r) => Math.max(m, Number(/^TR-(\d+)$/.exec(r.reference)?.[1] ?? 0)), 0);
    return `TR-${String(top + 1).padStart(4, '0')}`;
  }

  private async saveNew(base: Partial<TransferRun>): Promise<TransferRun> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.runs.save(this.runs.create({ status: 'planned', riderId: null, ...base, reference: await this.nextReference() }));
      } catch (e) {
        if (attempt >= 4) throw e; // a parallel request took the same number: take the next one
      }
    }
  }

  /** Tasks that may join a run from `fromHubId` to `toHubId`: transfers waiting here for that next warehouse, in no run. */
  private async joinable(ids: unknown, fromHubId: string, toHubId: string): Promise<DeliveryTask[]> {
    const wanted = [...new Set((Array.isArray(ids) ? ids : []).map((x) => String(x)))].slice(0, 500);
    if (!wanted.length) throw new BadRequestException('Choose at least one parcel.');
    const found = await this.tasks.find({ where: { id: In(wanted) } });
    const ok = found.filter((t) => (RUN_KINDS as readonly string[]).includes(t.kind) && t.fromHubId === fromHubId && t.toHubId === toHubId && (WAITING as readonly string[]).includes(t.status) && !t.runId);
    if (found.length !== wanted.length || ok.length !== wanted.length) throw new BadRequestException('Only parcels waiting at this warehouse can join this run.');
    return ok;
  }

  /** Put tasks in a run; when it has a driver they are given to that driver (they were not theirs before). */
  private async attach(run: TransferRun, tasks: DeliveryTask[]): Promise<void> {
    for (const t of tasks) {
      const gone = t.riderId && t.riderId !== run.riderId ? t.riderId : null;
      await this.tasks.update({ id: t.id }, { runId: run.id, riderId: run.riderId ?? null, status: run.riderId ? 'assigned' : 'unassigned' });
      if (gone) this.tellGone(gone, t);
      await this.logistics.emitTask(t);
    }
  }

  /** A driver who had a parcel before it joined a run is told it left their list. */
  private tellGone(riderId: string, t: DeliveryTask): void {
    const gone = { id: t.id, orderId: t.orderId, orderReference: t.orderReference, kind: t.kind, status: 'unassigned', removed: true, reason: 'reassigned' };
    for (const ev of ['task:updated', 'delivery:updated']) this.emitter.toUser(riderId, ev, gone);
  }

  async create(actor: Actor, input: { toHubId?: unknown; taskIds?: unknown; fromHubId?: unknown }): Promise<RunView> {
    const toHubId = String(input?.toHubId ?? '');
    if (!toHubId || !(await this.hubs.findOne({ where: { id: toHubId } }))) throw new NotFoundException('Hub not found.');
    let fromHubId = actor.hubId ?? null;
    if (this.isAdmin(actor)) {
      const first = Array.isArray(input?.taskIds) && input.taskIds.length ? await this.tasks.findOne({ where: { id: String(input.taskIds[0]) } }) : null;
      fromHubId = (typeof input?.fromHubId === 'string' && input.fromHubId) || first?.fromHubId || null;
    }
    if (!fromHubId) throw new BadRequestException('Your account is not linked to a warehouse. Ask an administrator.');
    this.assertSender(actor, { fromHubId });
    const tasks = await this.joinable(input?.taskIds, fromHubId, toHubId);
    const run = await this.saveNew({ fromHubId, toHubId, createdById: actor.id });
    await this.attach(run, tasks);
    this.audit(actor, 'run.created', run, `${run.reference} · ${tasks.length} parcel(s)`);
    return this.push(run);
  }

  async update(actor: Actor, input: { runId?: unknown; addTaskIds?: unknown; removeTaskIds?: unknown }): Promise<RunView> {
    const run = await this.load(input?.runId);
    this.assertSender(actor, run);
    if (run.status !== 'planned') throw new BadRequestException('This run has already left.');
    const remove = [...new Set((Array.isArray(input?.removeTaskIds) ? input.removeTaskIds : []).map((x) => String(x)))];
    if (remove.length) {
      const mine = await this.tasks.find({ where: { runId: run.id, id: In(remove) } });
      for (const t of mine) {
        await this.tasks.update({ id: t.id }, { runId: null, riderId: null, status: 'unassigned' });
        if (t.riderId) this.tellGone(t.riderId, t);
        await this.logistics.emitTask(t);
      }
    }
    if (Array.isArray(input?.addTaskIds) && input.addTaskIds.length) await this.attach(run, await this.joinable(input.addTaskIds, run.fromHubId, run.toHubId));
    this.audit(actor, 'run.updated', run);
    return this.push(run);
  }

  /**
   * Several drivers on one lane = several runs: move chosen parcels of a planned run into a NEW run on the same lane,
   * which gets its own driver. The original keeps its driver and the rest of its parcels; the moved parcels wait for
   * the new run's driver.
   */
  async split(actor: Actor, input: { runId?: unknown; taskIds?: unknown }): Promise<{ original: RunView; created: RunView }> {
    const run = await this.load(input?.runId);
    this.assertSender(actor, run);
    if (run.status !== 'planned') throw new BadRequestException('This run has already left.');
    const wanted = [...new Set((Array.isArray(input?.taskIds) ? input.taskIds : []).map((x) => String(x)))];
    const members = await this.members(run);
    const moving = members.filter((t) => wanted.includes(t.id));
    if (!wanted.length || moving.length !== wanted.length) throw new BadRequestException('Choose parcels of this run.');
    if (moving.length >= members.length) throw new BadRequestException('Choose some of the parcels of this run, not all of them.');
    const created = await this.saveNew({ fromHubId: run.fromHubId, toHubId: run.toHubId, createdById: actor.id });
    for (const t of moving) {
      await this.tasks.update({ id: t.id }, { runId: created.id, riderId: null, status: 'unassigned' });
      if (t.riderId) this.tellGone(t.riderId, t);
      await this.logistics.emitTask(t);
    }
    this.audit(actor, 'run.split', run, `${run.reference} -> ${created.reference} · ${moving.length} parcel(s)`);
    return { original: await this.push(run, [run.riderId]), created: await this.push(created) };
  }

  /** Give the run its (one) driver: from the sending or the receiving warehouse. The driver is the run's, never the previous hop's. */
  async assign(actor: Actor, input: { runId?: unknown; riderId?: unknown }): Promise<RunView> {
    const run = await this.load(input?.runId);
    this.assertSender(actor, run);
    if (run.status !== 'planned') throw new BadRequestException('This run has already left.');
    const rider = await this.users.findOne({ where: { id: String(input?.riderId ?? '') } });
    if (!rider || rider.role !== 'rider' || !rider.active) throw new BadRequestException('Choose an active rider.');
    if (!rider.hubId || ![run.fromHubId, run.toHubId].includes(rider.hubId)) throw new BadRequestException('This rider works at another warehouse.');
    const members = await this.members(run);
    const before = run.riderId;
    await this.runs.update({ id: run.id }, { riderId: rider.id });
    run.riderId = rider.id;
    for (const t of members.filter((x) => (WAITING as readonly string[]).includes(x.status))) {
      await this.tasks.update({ id: t.id }, { riderId: rider.id, status: 'assigned' });
      if (t.riderId && t.riderId !== rider.id) this.tellGone(t.riderId, t);
      await this.logistics.emitTask(t);
    }
    const names = new Map((await this.hubs.find({ select: { id: true, name: true } })).map((h) => [h.id, h.name]));
    await this.notifications
      .toUser(rider.id, {
        title: 'Transfer run assigned',
        body:
          members.length === 1
            ? `${run.reference}: 1 parcel to ${names.get(run.toHubId) ?? 'the next warehouse'} is now in your tasks.`
            : `${run.reference}: ${members.length} parcels to ${names.get(run.toHubId) ?? 'the next warehouse'} are now in your tasks.`,
        type: 'task',
        entityId: run.id,
        extra: { runId: run.id, view: 'active' },
      })
      .catch(() => undefined);
    this.audit(actor, 'run.assigned', run, `${run.reference} -> ${rider.name}`);
    return this.push(run, [before]);
  }

  /** Hand the run to its driver: every parcel becomes `picked_up` with that driver. The receiving warehouse is told it is coming. */
  async dispatch(actor: Actor, input: { runId?: unknown }): Promise<RunView> {
    const run = await this.load(input?.runId);
    this.assertSender(actor, run);
    if (run.status !== 'planned') throw new BadRequestException('This run has already left.');
    if (!run.riderId) throw new BadRequestException('Choose a driver for this run first.');
    const ready = (await this.members(run)).filter((t) => t.status === 'assigned' && t.riderId === run.riderId);
    if (!ready.length) throw new BadRequestException('This run has no parcels left to send.');
    const now = new Date();
    const sent: DeliveryTask[] = [];
    for (const t of ready) {
      const claim = await this.tasks.createQueryBuilder().update(DeliveryTask).set({ status: 'picked_up', pickedUpAt: now }).where("id = :id AND status = 'assigned'", { id: t.id }).execute();
      if (!claim.affected) continue;
      const saved = (await this.tasks.findOne({ where: { id: t.id } })) as DeliveryTask;
      sent.push(saved);
      await this.logistics.afterRiderStatus(saved, 'picked_up');
    }
    await this.runs.update({ id: run.id }, { status: 'dispatched', dispatchedAt: now });
    const names = new Map((await this.hubs.find({ select: { id: true, name: true } })).map((h) => [h.id, h.name]));
    await this.notifications
      .toUsers(await this.logistics.staffIds(run.toHubId), {
        title: 'Transfer run on its way',
        body:
          sent.length === 1
            ? `${run.reference}: 1 parcel from ${names.get(run.fromHubId) ?? 'a warehouse'} is on its way to your warehouse.`
            : `${run.reference}: ${sent.length} parcels from ${names.get(run.fromHubId) ?? 'a warehouse'} are on their way to your warehouse.`,
        type: 'task',
        entityId: run.id,
      })
      .catch(() => undefined);
    this.audit(actor, 'run.dispatched', run, `${run.reference} · ${sent.length} parcel(s)`);
    return this.push(run);
  }

  /** Is this run still being prepared (its parcels are handed over by the warehouse, not picked up one by one)? */
  async isPlanned(runId: string): Promise<boolean> {
    return (await this.runs.findOne({ where: { id: runId }, select: { id: true, status: true } }))?.status === 'planned';
  }

  /** The driver reports the run on the road: every parcel still `picked_up` becomes `in_transit`. */
  async markInTransit(runId: string, riderId: string): Promise<RunView> {
    const run = await this.load(runId);
    if (run.riderId !== riderId) throw new NotFoundException('Run not found.');
    if (run.status !== 'dispatched') throw new BadRequestException(run.status === 'planned' ? 'This run has not left yet.' : 'This run is already closed.');
    const now = new Date();
    const moved = await this.tasks.createQueryBuilder().update(DeliveryTask).set({ status: 'in_transit' }).where("runId = :id AND status = 'picked_up'", { id: run.id }).execute();
    if (!run.inTransitAt) await this.runs.update({ id: run.id }, { inTransitAt: now });
    if (moved.affected) for (const t of await this.members(run)) if (t.status === 'in_transit') await this.logistics.afterRiderStatus(t, 'in_transit');
    return this.push(run);
  }

  /** A parcel of a dispatched run went `in_transit` (the driver tapped it): the whole run is on the road. Never throws. */
  async onTaskInTransit(task: DeliveryTask): Promise<void> {
    if (!task.runId) return;
    try {
      const run = await this.runs.findOne({ where: { id: task.runId } });
      if (run?.status === 'dispatched' && run.riderId === task.riderId) await this.markInTransit(run.id, run.riderId as string);
    } catch {
      /* the parcel's own status already moved */
    }
  }

  /** Scan the run in at the receiving warehouse: the given parcels, or all that are still on the road. Each scan runs the normal next-leg logic. */
  async receive(actor: Actor, input: { runId?: unknown; taskIds?: unknown }): Promise<RunView> {
    const run = await this.load(input?.runId);
    this.assertReceiver(actor, run);
    if (run.status === 'planned') throw new BadRequestException('This run has not left yet.');
    if (run.status === 'closed') throw new BadRequestException('This run is already closed.');
    const members = await this.members(run);
    let targets = members.filter((t) => (ON_THE_ROAD as readonly string[]).includes(t.status));
    if (Array.isArray(input?.taskIds) && input.taskIds.length) {
      const wanted = new Set(input.taskIds.map((x) => String(x)));
      if (![...wanted].every((id) => members.some((m) => m.id === id))) throw new BadRequestException('That parcel is not in this run.');
      targets = targets.filter((t) => wanted.has(t.id));
    }
    let received = 0;
    for (const t of targets) {
      await this.logistics.onScanIn(t.id, run.toHubId, actor);
      received++;
    }
    if (received && !run.arrivedAt) await this.runs.update({ id: run.id }, { status: 'arrived', arrivedAt: new Date() });
    this.audit(actor, 'run.received', run, `${run.reference} · ${received} parcel(s)`);
    return this.push(run);
  }

  /**
   * Close the run. Parcels that never arrived are marked failed ("Parcel missing from run TR-0042.") and each one becomes
   * a warehouse exception at the receiving warehouse; both warehouses and the admins are told.
   */
  async close(actor: Actor, input: { runId?: unknown }): Promise<RunView> {
    const run = await this.load(input?.runId);
    if (!this.isAdmin(actor)) {
      if (!tierAllows(actor.role, actor.tier, 'assign')) throw new BadRequestException('Only supervisors and managers can assign riders.');
      if (actor.hubId !== run.fromHubId && actor.hubId !== run.toHubId) throw new BadRequestException('This task belongs to another warehouse.');
    }
    if (run.status === 'closed') return this.view(run);
    if (run.status === 'planned') throw new BadRequestException('This run has not left yet.');
    const missing = (await this.members(run)).filter((t) => (ON_THE_ROAD as readonly string[]).includes(t.status));
    const names = new Map((await this.hubs.find({ select: { id: true, name: true } })).map((h) => [h.id, h.name]));
    for (const t of missing) {
      await this.tasks.update({ id: t.id }, { status: 'failed', failureReason: missingReason(run.reference) });
      const saved = (await this.tasks.findOne({ where: { id: t.id } })) as DeliveryTask;
      await this.logistics.emitTask(saved);
      const exc = await this.exceptions.save(
        this.exceptions.create({
          reference: `INC-${Date.now().toString().slice(-8)}${Math.floor(100 + Math.random() * 900)}`,
          taskId: t.id,
          orderReference: t.orderReference,
          type: 'missing_item',
          severity: 'high',
          status: 'open',
          hub: names.get(run.toHubId) ?? null,
          hubId: run.toHubId,
          notes: missingReason(run.reference),
          raisedBy: actor.name,
        }),
      );
      this.emitter.toHub(run.toHubId, 'exception:updated', exc);
      this.emitter.toRoles(ADMIN_ROLES, 'exception:updated', exc);
    }
    await this.runs.update({ id: run.id }, { status: 'closed', closedAt: new Date(), arrivedAt: run.arrivedAt ?? (missing.length ? null : new Date()) });
    if (missing.length) {
      const notice = {
        title: 'Parcel missing from run',
        body:
          missing.length === 1
            ? `${run.reference}: 1 parcel did not arrive from ${names.get(run.fromHubId) ?? 'a warehouse'} at ${names.get(run.toHubId) ?? 'a warehouse'}.`
            : `${run.reference}: ${missing.length} parcels did not arrive from ${names.get(run.fromHubId) ?? 'a warehouse'} at ${names.get(run.toHubId) ?? 'a warehouse'}.`,
        type: 'task',
        entityId: run.id,
      };
      await this.notifications.toAdmins(notice).catch(() => undefined);
      await this.notifications.toUsers([...new Set([...(await this.logistics.staffIds(run.fromHubId)), ...(await this.logistics.staffIds(run.toHubId))])], notice).catch(() => undefined);
    }
    this.audit(actor, 'run.closed', run, `${run.reference} · ${missing.length} missing`);
    return this.push(run);
  }
}
