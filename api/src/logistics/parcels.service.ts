import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { AuditLog, DeliveryTask, Order, OrderItem, Parcel, ParcelScan, ParcelScanStage, Seller } from '../database/entities';
import { AUDIT_ROLES } from '../common/role-groups';
import { SettingsService } from '../content/settings.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { cleanBoxCount, normalizeParcelCode, uniqueParcelCode } from './parcel-code';
import { BOXES_LOCKED, REQUIRE_PARCEL_SCAN, alreadyScanned, cancelledLabel, cargoMatches, notPartOf, scanEveryParcel, scanRequired } from './parcel-rules';
import { COLLECTED_STATUSES, OPEN_STATUSES, OUTBOUND_KINDS, isHubBound } from './leg-rules';
import { tierAllows } from './tiers';

/** One box of a leg's checklist. */
export interface ParcelLine {
  code: string;
  boxNo: number;
  boxCount: number;
  pickupScannedAt: Date | null;
  dropoffScannedAt: Date | null;
}

/** What a leg's cargo looks like to the one scanning it. A leg with no labelled parcel is complete on both stages. */
export interface Checklist {
  parcels: ParcelLine[];
  pickupComplete: boolean;
  dropoffComplete: boolean;
}

/** What the seller prints. Never the customer's phone or street: only the area. */
export interface LabelData {
  code: string;
  boxNo: number;
  boxCount: number;
  orderReference: string;
  storeName: string;
  destinationArea: string | null;
}

export interface ScanActor {
  id: string;
  role: string;
  name?: string;
  hubId?: string | null;
  tier?: string | null;
}

const isUnique = (e: unknown) => /UNIQUE|Duplicate entry|ER_DUP_ENTRY|constraint/i.test(String((e as Error)?.message ?? ''));

/**
 * Parcel labels and scans. A parcel is one physical box with a KOMORIKO code that never changes; each leg of its journey
 * scans it on the way out (`pickup`) and on the way in (`dropoff`). The rules live here: who may scan what, what a leg
 * carries, and (behind the `requireParcelScan` setting) that a leg cannot move on until every box was scanned.
 */
@Injectable()
export class ParcelsService {
  constructor(
    @InjectRepository(Parcel) private readonly parcels: Repository<Parcel>,
    @InjectRepository(ParcelScan) private readonly scans: Repository<ParcelScan>,
    @InjectRepository(DeliveryTask) private readonly tasks: Repository<DeliveryTask>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderItem) private readonly items: Repository<OrderItem>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    @InjectRepository(AuditLog) private readonly audits: Repository<AuditLog>,
    private readonly settings: SettingsService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  /** Is the blocking rule on? (Scanning itself always records.) */
  async required(): Promise<boolean> {
    return scanRequired(await this.settings.get(REQUIRE_PARCEL_SCAN));
  }

  // ── labels ───────────────────────────────────────────────────────────────────
  private async newCode(): Promise<string> {
    return uniqueParcelCode(async (c) => (await this.parcels.count({ where: { code: c } })) > 0);
  }

  private async make(base: Pick<Parcel, 'orderId' | 'sellerId' | 'returnId'>, boxCount: number): Promise<Parcel[]> {
    const out: Parcel[] = [];
    for (let n = 1; n <= boxCount; n++) {
      out.push(await this.parcels.save(this.parcels.create({ ...base, code: await this.newCode(), boxNo: n, boxCount, voidedAt: null })));
    }
    return out;
  }

  /** The seller's live boxes for an order, in box order. */
  async activeFor(orderId: string, sellerKeys: string[]): Promise<Parcel[]> {
    if (!sellerKeys.length) return [];
    return this.parcels.find({ where: { orderId, sellerId: In(sellerKeys), returnId: IsNull(), voidedAt: IsNull() }, order: { boxNo: 'ASC' } });
  }

  /** Has a rider (or the desk) scanned any of these boxes on the way out already? From then on the count is locked. */
  private async pickedUp(parcelIds: string[]): Promise<boolean> {
    if (!parcelIds.length) return false;
    return (await this.scans.count({ where: { parcelId: In(parcelIds), stage: 'pickup' } })) > 0;
  }

  /**
   * C-parcel-boxes (enforced here and in the seller portal): the seller packs an order's package into `boxCount` boxes. First
   * call makes the labels; a different count BEFORE the first pickup scan voids the old labels and makes new ones; after a
   * pickup scan the count is locked. `boxCount` undefined keeps what exists (1 box when nothing exists yet).
   */
  async ensureBoxes(orderId: string, sellerKey: string, boxCountRaw?: unknown): Promise<Parcel[]> {
    let want: number | undefined;
    try {
      want = boxCountRaw === undefined || boxCountRaw === null || boxCountRaw === '' ? undefined : cleanBoxCount(boxCountRaw);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const live = await this.activeFor(orderId, [sellerKey]);
    if (!live.length) return this.make({ orderId, sellerId: sellerKey, returnId: null }, want ?? 1);
    if (want === undefined || want === live.length) return live;
    if (await this.pickedUp(live.map((p) => p.id))) throw new BadRequestException(BOXES_LOCKED);
    await this.parcels.update({ id: In(live.map((p) => p.id)) }, { voidedAt: new Date() });
    return this.make({ orderId, sellerId: sellerKey, returnId: null }, want);
  }

  /** The parcel of a return the customer sends back (one box; idempotent per case). */
  async createForReturn(orderId: string, returnId: string): Promise<Parcel> {
    const live = await this.parcels.findOne({ where: { returnId, voidedAt: IsNull() } });
    if (live) return live;
    return (await this.make({ orderId, sellerId: null, returnId }, 1))[0];
  }

  /** The label of a return, for the customer who has to hand the box over (null when no return pickup exists). */
  async forReturn(returnId: string): Promise<Parcel | null> {
    return this.parcels.findOne({ where: { returnId, voidedAt: IsNull() } });
  }

  /** The return parcel as its customer (or ops) reads it: null until the return pickup exists. */
  async returnParcelFor(user: { id: string; role: string }, returnId: string): Promise<{ code: string; boxNo: number; boxCount: number; orderReference: string } | null> {
    const parcel = await this.forReturn(returnId);
    if (!parcel) return null;
    const order = await this.orders.findOne({ where: { id: parcel.orderId } });
    const staff = user.role.startsWith('admin') || user.role === 'warehouse_staff';
    if (!order || (!staff && order.customerId !== user.id)) throw new NotFoundException('Return not found.');
    return { code: parcel.code, boxNo: parcel.boxNo, boxCount: parcel.boxCount, orderReference: order.reference };
  }

  /** A package (or a whole order) will not travel: its labels are void, so a scan of one says so. */
  async voidFor(orderId: string, sellerKeys?: string[]): Promise<number> {
    const where = sellerKeys ? { orderId, sellerId: In(sellerKeys), returnId: IsNull(), voidedAt: IsNull() } : { orderId, returnId: IsNull(), voidedAt: IsNull() };
    const r = await this.parcels.update(where, { voidedAt: new Date() });
    return r.affected ?? 0;
  }

  /** The destination area printed on a label: commune and city of the delivery address, never the street or the phone. */
  private static areaOf(shipping: string | null): string | null {
    if (!shipping) return null;
    try {
      const a = JSON.parse(shipping) as Record<string, unknown>;
      return [a.commune, a.city].filter((x): x is string => typeof x === 'string' && !!x.trim()).join(', ') || null;
    } catch {
      return null;
    }
  }

  /** The labels of a seller's package, with whether the box count can still change. Refused once the package was delivered. */
  async labelsFor(orderId: string, sellerKeys: string[]): Promise<{ labels: LabelData[]; boxCount: number; locked: boolean }> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found.');
    const live = await this.activeFor(orderId, sellerKeys);
    if (!live.length) throw new BadRequestException('Mark the package ready first: the labels are made then.');
    const lines = (await this.items.find({ where: { orderId, sellerId: In(sellerKeys) } })).filter((i) => i.fulfilment !== 'cancelled');
    if (lines.length && lines.every((i) => i.deliveredAt)) throw new BadRequestException('This package was delivered: its labels can no longer be printed.');
    const seller = await this.sellers.findOne({ where: [{ id: In(sellerKeys) }, { userId: In(sellerKeys) }] });
    const area = ParcelsService.areaOf(order.shippingAddress);
    return {
      boxCount: live.length,
      locked: await this.pickedUp(live.map((p) => p.id)),
      labels: live.map((p) => ({ code: p.code, boxNo: p.boxNo, boxCount: p.boxCount, orderReference: order.reference, storeName: seller?.name ?? lines[0]?.sellerName ?? 'KOMORIKO', destinationArea: area })),
    };
  }

  // ── the leg's checklist ──────────────────────────────────────────────────────
  /** The checklists of several legs at once (one query for the parcels, one for the scans). */
  async checklists(tasks: DeliveryTask[]): Promise<Map<string, Checklist>> {
    const out = new Map<string, Checklist>();
    if (!tasks.length) return out;
    const orderIds = [...new Set(tasks.map((t) => t.orderId))];
    const parcels = await this.parcels.find({ where: { orderId: In(orderIds), voidedAt: IsNull() }, order: { boxNo: 'ASC' } });
    const scans = parcels.length ? await this.scans.find({ where: { taskId: In(tasks.map((t) => t.id)) } }) : [];
    for (const t of tasks) {
      const cargo = parcels.filter((p) => p.orderId === t.orderId && cargoMatches(t, p));
      const lines: ParcelLine[] = cargo.map((p) => ({
        code: p.code,
        boxNo: p.boxNo,
        boxCount: p.boxCount,
        pickupScannedAt: scans.find((s) => s.taskId === t.id && s.parcelId === p.id && s.stage === 'pickup')?.at ?? null,
        dropoffScannedAt: scans.find((s) => s.taskId === t.id && s.parcelId === p.id && s.stage === 'dropoff')?.at ?? null,
      }));
      lines.sort((a, b) => a.boxNo - b.boxNo);
      out.set(t.id, { parcels: lines, pickupComplete: lines.every((l) => l.pickupScannedAt), dropoffComplete: lines.every((l) => l.dropoffScannedAt) });
    }
    return out;
  }

  async checklist(task: DeliveryTask): Promise<Checklist> {
    return (await this.checklists([task])).get(task.id) as Checklist;
  }

  /** How many boxes of the leg were scanned on a stage, and how many there are. */
  static count(list: Checklist, stage: ParcelScanStage): { scanned: number; total: number } {
    return { scanned: list.parcels.filter((p) => (stage === 'pickup' ? p.pickupScannedAt : p.dropoffScannedAt)).length, total: list.parcels.length };
  }

  /**
   * C-parcel-scan (enforced here, in the rider app and in the web desk): while `requireParcelScan` is on, a leg cannot be
   * picked up / handed over / received until every box of its cargo has a scan of that stage for THIS leg. Several legs
   * (a transfer run) are counted together, so the refusal says "2 of 3" for the whole run. A leg with no labelled parcel
   * is not blocked.
   */
  async assertComplete(tasks: DeliveryTask | DeliveryTask[], stage: ParcelScanStage): Promise<void> {
    if (!(await this.required())) return;
    const list = Array.isArray(tasks) ? tasks : [tasks];
    const lists = await this.checklists(list);
    let scanned = 0;
    let total = 0;
    for (const c of lists.values()) {
      const n = ParcelsService.count(c, stage);
      scanned += n.scanned;
      total += n.total;
    }
    if (scanned < total) throw new BadRequestException(scanEveryParcel(scanned, total));
  }

  // ── scanning ─────────────────────────────────────────────────────────────────
  private async byCode(codeRaw: unknown): Promise<{ code: string; parcel: Parcel | null }> {
    const code = normalizeParcelCode(codeRaw);
    if (!code) throw new BadRequestException('That is not a KOMORIKO parcel code. Codes look like PKG-7KQ2M9XA.');
    return { code, parcel: await this.parcels.findOne({ where: { code } }) };
  }

  private async record(parcel: Parcel, task: DeliveryTask, stage: ParcelScanStage, actor: ScanActor, extra: { manual: boolean; reason?: string | null; hubId?: string | null }): Promise<'new' | 'same' | 'other'> {
    const existing = await this.scans.findOne({ where: { parcelId: parcel.id, taskId: task.id, stage } });
    if (existing) return existing.actorId === actor.id ? 'same' : 'other';
    try {
      await this.scans.save(this.scans.create({ parcelId: parcel.id, taskId: task.id, stage, actorId: actor.id, actorRole: actor.role, hubId: extra.hubId ?? actor.hubId ?? null, at: new Date(), manual: extra.manual, reason: extra.reason ?? null }));
      return 'new';
    } catch (e) {
      // Two scans of the same box at the same instant: the second finds the first.
      if (isUnique(e)) return (await this.scans.findOne({ where: { parcelId: parcel.id, taskId: task.id, stage } }))?.actorId === actor.id ? 'same' : 'other';
      throw e;
    }
  }

  /** The legs a rider scans for: one leg, or every leg of a transfer run. */
  private async legsOf(riderId: string, ref: { taskId?: unknown; runId?: unknown }): Promise<DeliveryTask[]> {
    const runId = ref.runId ? String(ref.runId) : null;
    const legs = runId
      ? await this.tasks.find({ where: { runId, riderId } })
      : ref.taskId
        ? await this.tasks.find({ where: { id: String(ref.taskId), riderId } })
        : [];
    // The same answer for "missing" and "someone else's" so ids cannot be probed.
    if (!legs.length) throw new NotFoundException('Delivery task not found.');
    return legs;
  }

  /** The leg checklist for the rider (`rider:legParcels`): one leg, or a whole run. */
  async legChecklist(riderId: string, ref: { taskId?: unknown; runId?: unknown }): Promise<Checklist & { taskIds: string[]; required: boolean }> {
    const legs = await this.legsOf(riderId, ref);
    return { ...(await this.merge(legs)), taskIds: legs.map((l) => l.id), required: await this.required() };
  }

  private async merge(legs: DeliveryTask[]): Promise<Checklist> {
    const lists = await this.checklists(legs);
    const parcels = [...lists.values()].flatMap((c) => c.parcels);
    return { parcels, pickupComplete: parcels.every((p) => p.pickupScannedAt), dropoffComplete: parcels.every((p) => p.dropoffScannedAt) };
  }

  /**
   * The rider scans one box (`rider:scanParcel`). The leg must be theirs and open; the code must belong to the leg's cargo.
   * A repeat of the same scan by the same rider changes nothing and says so (`already`); a box someone else scanned on this
   * leg and stage is refused.
   */
  async riderScan(riderId: string, input: { taskId?: unknown; runId?: unknown; code?: unknown; stage?: unknown; manual?: unknown }): Promise<Checklist & { taskId: string; stage: ParcelScanStage; code: string; scanned: number; total: number; already: boolean; required: boolean }> {
    const stage = input.stage;
    if (stage !== 'pickup' && stage !== 'dropoff') throw new BadRequestException('Stage must be pickup or dropoff.');
    const legs = await this.legsOf(riderId, input);
    const { code, parcel } = await this.byCode(input.code);
    const open = legs.filter((l) => (OPEN_STATUSES as readonly string[]).includes(l.status));
    if (!open.length) throw new BadRequestException('This leg is already closed.');
    if (parcel?.voidedAt) throw new BadRequestException(cancelledLabel(code));
    const leg = parcel ? open.find((l) => l.orderId === parcel.orderId && cargoMatches(l, parcel)) : undefined;
    if (!parcel || !leg) throw new BadRequestException(notPartOf(code, open[0].kind));
    if (stage === 'dropoff' && !(COLLECTED_STATUSES as readonly string[]).includes(leg.status)) throw new BadRequestException(`Collect ${code} first: this leg is not picked up yet.`);
    const result = await this.record(parcel, leg, stage, { id: riderId, role: 'rider' }, { manual: input.manual === true });
    if (result === 'other') throw new BadRequestException(alreadyScanned(code));
    const list = await this.merge(legs);
    const n = ParcelsService.count(list, stage);
    // The people watching the leg (desk, ops) see the tick at once.
    this.emitter.toRoles(['admin', 'admin_operations'], 'parcel:scanned', { taskId: leg.id, code, stage });
    return { ...list, taskId: leg.id, stage, code, scanned: n.scanned, total: n.total, already: result === 'same', required: await this.required() };
  }

  /**
   * Warehouse staff scan a box by its code. `in` = a box arriving at their warehouse (drop-off of a leg that ends here),
   * `out` = a box leaving (pick-up of a leg that starts here). Returns the leg, its checklist and whether the leg is now complete
   * (or the rule is off): the caller then scans the leg in / out.
   */
  async staffScan(actor: ScanActor, input: { code?: unknown; mode: 'in' | 'out'; hubId: string | null; manual?: boolean }): Promise<{ task: DeliveryTask; checklist: Checklist; complete: boolean; already: boolean }> {
    const { code, parcel } = await this.byCode(input.code);
    if (parcel?.voidedAt) throw new BadRequestException(cancelledLabel(code));
    const where = input.mode === 'in' ? 'is not due at your warehouse.' : 'is not waiting to leave your warehouse.';
    if (!parcel) throw new BadRequestException(`${code} ${where}`);
    const legs = (await this.tasks.find({ where: { orderId: parcel.orderId, status: In([...OPEN_STATUSES]) } })).filter((t) => cargoMatches(t, parcel));
    const leg = legs.find((t) =>
      input.mode === 'in'
        ? isHubBound(t.kind) && (!input.hubId || t.toHubId === input.hubId) && (COLLECTED_STATUSES as readonly string[]).includes(t.status)
        : (OUTBOUND_KINDS as readonly string[]).includes(t.kind) && (!input.hubId || t.fromHubId === input.hubId) && t.status === 'assigned',
    );
    if (!leg) {
      // Say why when the box is on a leg here that is simply not ready for the scan.
      if (input.mode === 'in' && legs.some((t) => isHubBound(t.kind) && (!input.hubId || t.toHubId === input.hubId))) throw new BadRequestException(`A rider must collect ${code} before it can be scanned in.`);
      if (input.mode === 'out' && legs.some((t) => !input.hubId || t.fromHubId === input.hubId)) throw new BadRequestException(`Assign a rider before handing ${code} over.`);
      throw new BadRequestException(`${code} ${where}`);
    }
    const stage: ParcelScanStage = input.mode === 'in' ? 'dropoff' : 'pickup';
    const result = await this.record(parcel, leg, stage, actor, { manual: input.manual === true, hubId: input.hubId ?? (input.mode === 'in' ? leg.toHubId : leg.fromHubId) });
    const checklist = await this.checklist(leg);
    const done = stage === 'dropoff' ? checklist.dropoffComplete : checklist.pickupComplete;
    return { task: leg, checklist, complete: done || !(await this.required()), already: result !== 'new' };
  }

  /**
   * A supervisor or manager marks a box scanned by hand (a damaged label): needs a reason, is audited, and shows as manual.
   * A rider can never do this.
   */
  async markByHand(actor: ScanActor, input: { taskId?: unknown; code?: unknown; stage?: unknown; reason?: unknown }, touches: (t: DeliveryTask) => boolean): Promise<Checklist> {
    if (!tierAllows(actor.role, actor.tier, 'oversee')) throw new BadRequestException('Only a supervisor or a manager can mark a parcel by hand.');
    const stage = input.stage;
    if (stage !== 'pickup' && stage !== 'dropoff') throw new BadRequestException('Stage must be pickup or dropoff.');
    const reason = String(input.reason ?? '').trim().slice(0, 200);
    if (reason.length < 3) throw new BadRequestException('Give a reason, for example "label torn".');
    const task = await this.tasks.findOne({ where: { id: String(input.taskId ?? '') } });
    if (!task) throw new NotFoundException('Delivery task not found.');
    if (actor.hubId && !touches(task)) throw new BadRequestException('This task belongs to another warehouse.');
    if (!(OPEN_STATUSES as readonly string[]).includes(task.status)) throw new BadRequestException('This leg is already closed.');
    const { code, parcel } = await this.byCode(input.code);
    if (parcel?.voidedAt) throw new BadRequestException(cancelledLabel(code));
    if (!parcel || parcel.orderId !== task.orderId || !cargoMatches(task, parcel)) throw new BadRequestException(notPartOf(code, task.kind));
    const result = await this.record(parcel, task, stage, actor, { manual: true, reason, hubId: actor.hubId ?? null });
    if (result === 'other') throw new BadRequestException(alreadyScanned(code));
    if (result === 'new') {
      void this.audits
        .save(this.audits.create({ actor: actor.name ?? actor.id, role: actor.role, action: 'parcel.marked_by_hand', entity: 'delivery', entityId: task.id, detail: `${task.orderReference}: ${code} marked ${stage} by hand (${reason})` }))
        .then((log) => this.emitter.toRoles(AUDIT_ROLES, 'audit:created', log))
        .catch(() => undefined);
    }
    return this.checklist(task);
  }
}
