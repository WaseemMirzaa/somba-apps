import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, IsNull, Repository } from 'typeorm';
import { AuditLog, DeliveryTask, Order, OrderItem, Parcel, ParcelGroup, ParcelGroupOrder, ParcelScan, ParcelScanStage, Seller } from '../database/entities';
import { withOrderLocks } from '../common/order-lock';
import { ORDER_ACCESS_DENIED, orderAudienceOf } from '../common/order-access';
import { AUDIT_ROLES } from '../common/role-groups';
import { SettingsService } from '../content/settings.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { cleanBoxCount, normalizeParcelCode, uniqueParcelCode } from './parcel-code';
import { BOXES_LOCKED, REQUIRE_PARCEL_SCAN, alreadyScanned, cancelledLabel, cargoMatches, notPartOf, scanEveryParcel, scanRequired } from './parcel-rules';
import { COLLECTED_STATUSES, OPEN_STATUSES, OUTBOUND_KINDS, isCustomerKind, isHubBound } from './leg-rules';
import { tierAllows } from './tiers';
import { ContentLine, GroupPlan, addressObject, areaOf, planFor, variantLabel } from './parcel-groups';
export type { ContentLine } from './parcel-groups';

/** One box of a leg's checklist. */
export interface ParcelLine {
  code: string;
  /** The label set this box belongs to (null on a return parcel). */
  groupId?: string | null;
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
  /** What is in the boxes: every product x qty with its options, of every order of the label set (empty when the leg carries no labelled parcel). */
  contents: ContentLine[];
  /** The orders whose goods are in those boxes (more than one when a seller packed several same-day orders together). */
  orders: OrderRef[];
}

export interface OrderRef {
  orderId: string;
  reference: string;
}

/** What the seller prints. Never the customer's phone or street: only the area. */
export interface LabelData {
  code: string;
  boxNo: number;
  boxCount: number;
  orderReference: string;
  storeName: string;
  destinationArea: string | null;
  /** Every product x qty (with size / options) in the label set: printed under the code. */
  contents: ContentLine[];
  /** The references of every order in the set (the first is `orderReference`). */
  orderRefs: string[];
  groupId: string | null;
  /** Bumps when the set's contents changed after the labels were made: the seller is told to reprint. */
  contentsRev: number;
}

/** The labels of a package, with whether the box count can still change. */
export interface LabelSet {
  labels: LabelData[];
  boxCount: number;
  locked: boolean;
  groupId: string | null;
  orders: OrderRef[];
  contentsRev: number;
}

/** What `parcels:resolve` answers: the box, its contents and where it goes, as much as the asker may know. */
/** One box of an order's parcels section (admin order page, warehouse): its state across the legs. */
export interface OrderBox {
  code: string;
  boxNo: number;
  boxCount: number;
  voided: boolean;
  storeName: string | null;
  pickupScans: number;
  dropoffScans: number;
  lastScanAt: Date | null;
}

/** The label sets an order's boxes belong to, with what is in them. */
export interface OrderParcels {
  orderId: string;
  sets: { groupId: string | null; orders: OrderRef[]; locked: boolean; contentsRev: number; contents: ContentLine[]; boxes: OrderBox[] }[];
}

export interface ResolvedParcel {
  code: string;
  boxNo: number;
  boxCount: number;
  voided: boolean;
  storeName: string | null;
  destinationArea: string | null;
  /** The full address and phone: only for the roles that deliver or answer for the parcel (never a seller). */
  destination: { area: string | null; address: string | null; phone: string | null; recipient: string | null };
  contents: ContentLine[];
  orders: OrderRef[];
  group: { id: string | null; orders: number; locked: boolean; contentsRev: number } | null;
  legs: { id: string; orderId: string; orderReference: string; kind: string; status: string }[];
}

export interface ScanActor {
  id: string;
  role: string;
  name?: string;
  hubId?: string | null;
  tier?: string | null;
}

const isUnique = (e: unknown) => /UNIQUE|Duplicate entry|ER_DUP_ENTRY|constraint/i.test(String((e as Error)?.message ?? ''));

export const GROUP_MISMATCH = 'These orders cannot share a label: they differ in customer, day, delivery address or delivery mode.';
export const GROUP_LOCKED = 'A rider already collected these boxes. The orders in them cannot change; pack the other orders in a new set.';
export const GROUP_SINGLE_SELLER = 'Orders with several sellers keep their own labels: they cannot be packed together.';

/**
 * Parcel labels and scans. A parcel is one physical box with a KOMORIKO code that never changes; each leg of its journey
 * scans it on the way out (`pickup`) and on the way in (`dropoff`). The rules live here: who may scan what, what a leg
 * carries, and (behind the `requireParcelScan` setting) that a leg cannot move on until every box was scanned.
 *
 * Boxes belong to a PARCEL GROUP (one label set for the same-day orders of one seller, one customer and one address; an order
 * packed on its own is a group of one). Legs stay per order; a scan of a box of the group is recorded on every sibling leg
 * of the same kind, so one scan serves them all.
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

  private get db(): EntityManager {
    return this.parcels.manager;
  }

  // ── groups ───────────────────────────────────────────────────────────────────
  /** The group an order's boxes belong to (null when the order has no label set yet). */
  async groupOf(orderId: string, m: EntityManager = this.db): Promise<ParcelGroup | null> {
    const mem = await m.findOne(ParcelGroupOrder, { where: { orderId } });
    return mem ? m.findOne(ParcelGroup, { where: { id: mem.groupId } }) : null;
  }

  /** The other orders that share this order's label set (empty when it has its own). */
  async siblingOrderIds(orderId: string, m: EntityManager = this.db): Promise<string[]> {
    const mem = await m.findOne(ParcelGroupOrder, { where: { orderId } });
    if (!mem) return [];
    return (await m.find(ParcelGroupOrder, { where: { groupId: mem.groupId } })).map((r) => r.orderId).filter((id) => id !== orderId);
  }

  /** A group and its orders (null when it does not exist). */
  async groupInfo(groupId: string): Promise<{ group: ParcelGroup; orderIds: string[] } | null> {
    const group = await this.db.findOne(ParcelGroup, { where: { id: groupId } });
    if (!group) return null;
    return { group, orderIds: (await this.refsOf(this.db, groupId)).map((r) => r.orderId) };
  }

  /** The orders of a group, oldest first (the first is the anchor the boxes are filed under). */
  private async refsOf(m: EntityManager, groupId: string): Promise<OrderRef[]> {
    const members = await m.find(ParcelGroupOrder, { where: { groupId } });
    if (!members.length) return [];
    const rows = await m.find(Order, { where: { id: In(members.map((r) => r.orderId)) }, select: ['id', 'reference', 'createdAt'] as never });
    const at = (id: string) => +new Date(rows.find((o) => o.id === id)?.createdAt ?? members.find((r) => r.orderId === id)?.createdAt ?? 0);
    const ref = (id: string) => rows.find((o) => o.id === id)?.reference ?? '';
    return members
      .map((r) => r.orderId)
      .sort((a, b) => at(a) - at(b) || ref(a).localeCompare(ref(b)) || a.localeCompare(b))
      .map((id) => ({ orderId: id, reference: ref(id) }));
  }

  /** The plan of an order: its single seller (or none when several ship it) decides who it may share a label set with. */
  private planOf(order: Order, sellerKey: string): GroupPlan {
    const sellers = new Set((order.items ?? []).filter((i) => !i.productId.startsWith('ext:') && i.fulfilment !== 'cancelled').map((i) => i.sellerId).filter((x): x is string => !!x));
    return planFor(order, sellers.size > 1 ? null : sellerKey);
  }

  private async newGroup(m: EntityManager, plan: GroupPlan, orderId?: string): Promise<ParcelGroup> {
    const last = await m.createQueryBuilder(ParcelGroup, 'g').select('MAX(g.daySeq)', 'n').where('g.groupKey = :k', { k: plan.groupKey }).getRawOne<{ n: string | number | null }>();
    const group = await m.save(ParcelGroup, m.create(ParcelGroup, { ...plan, daySeq: Number(last?.n ?? 0) + 1, lockedAt: null, contentsRev: 0 }));
    if (orderId) await m.save(ParcelGroupOrder, m.create(ParcelGroupOrder, { groupId: group.id, orderId }));
    return group;
  }

  /** The order's group; made (a group of one) when the order has none. */
  private async ensureGroup(m: EntityManager, orderId: string, sellerKey: string): Promise<ParcelGroup> {
    const have = await this.groupOf(orderId, m);
    if (have) return have;
    const order = await m.findOne(Order, { where: { id: orderId } });
    const plan: GroupPlan = order
      ? this.planOf(order, sellerKey)
      : { sellerKey, customerId: '', dayKey: '', addressKey: '', deliveryMode: 'standard', originHubId: null, destinationHubId: null, groupKey: `order:${orderId}` };
    return this.newGroup(m, plan, orderId);
  }

  private async isLocked(m: EntityManager, group: ParcelGroup): Promise<boolean> {
    if (group.lockedAt) return true;
    const ids = (await m.find(Parcel, { where: { groupId: group.id }, select: ['id'] })).map((p) => p.id);
    return this.pickedUp(ids, m);
  }

  /** Stamp the group as collected (the first pickup scan of any of its boxes). */
  private async lock(m: EntityManager, groupId: string | null): Promise<void> {
    if (groupId) await m.createQueryBuilder().update(ParcelGroup).set({ lockedAt: new Date() }).where('id = :id AND lockedAt IS NULL', { id: groupId }).execute();
  }

  // ── labels ───────────────────────────────────────────────────────────────────
  private async newCode(m: EntityManager): Promise<string> {
    return uniqueParcelCode(async (c) => (await m.count(Parcel, { where: { code: c } })) > 0);
  }

  private async make(m: EntityManager, base: { orderId: string; groupId: string; sellerId: string | null }, boxCount: number): Promise<Parcel[]> {
    const out: Parcel[] = [];
    for (let n = 1; n <= boxCount; n++) {
      out.push(await m.save(Parcel, m.create(Parcel, { ...base, returnId: null, code: await this.newCode(m), boxNo: n, boxCount, voidedAt: null, liveSlot: `${base.groupId}:${base.sellerId}:${n}` })));
    }
    return out;
  }

  /** The seller's live boxes of a group, in box order. */
  private async liveIn(m: EntityManager, groupId: string, sellerKeys: string[]): Promise<Parcel[]> {
    if (!sellerKeys.length) return [];
    return m.find(Parcel, { where: { groupId, sellerId: In(sellerKeys), returnId: IsNull(), voidedAt: IsNull() }, order: { boxNo: 'ASC' } });
  }

  /** The seller's live boxes for an order (the order's label set), in box order. */
  async activeFor(orderId: string, sellerKeys: string[]): Promise<Parcel[]> {
    if (!sellerKeys.length) return [];
    const group = await this.groupOf(orderId);
    if (group) return this.liveIn(this.db, group.id, sellerKeys);
    return this.parcels.find({ where: { orderId, sellerId: In(sellerKeys), returnId: IsNull(), voidedAt: IsNull() }, order: { boxNo: 'ASC' } });
  }

  /** Has a rider (or the desk) scanned any of these boxes on the way out already? From then on the count is locked. */
  private async pickedUp(parcelIds: string[], m: EntityManager = this.db): Promise<boolean> {
    if (!parcelIds.length) return false;
    return (await m.count(ParcelScan, { where: { parcelId: In(parcelIds), stage: 'pickup' } })) > 0;
  }

  private static wanted(raw: unknown): number | undefined {
    try {
      return raw === undefined || raw === null || raw === '' ? undefined : cleanBoxCount(raw);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  /** The boxes of a group for one seller: made when there are none; replaced by another count BEFORE the first pickup scan. */
  private async boxesFor(m: EntityManager, group: ParcelGroup, sellerKey: string, want: number | undefined): Promise<Parcel[]> {
    const live = await this.liveIn(m, group.id, [sellerKey]);
    const anchor = (await this.refsOf(m, group.id))[0]?.orderId;
    if (!anchor) throw new BadRequestException('Order not found.');
    if (!live.length) return this.make(m, { orderId: anchor, groupId: group.id, sellerId: sellerKey }, want ?? 1);
    if (want === undefined || want === live.length) return live;
    if (await this.isLocked(m, group)) throw new BadRequestException(BOXES_LOCKED);
    await m.update(Parcel, { id: In(live.map((p) => p.id)) }, { voidedAt: new Date(), liveSlot: null });
    return this.make(m, { orderId: anchor, groupId: group.id, sellerId: sellerKey }, want);
  }

  /**
   * C-parcel-boxes (enforced here and in the seller portal): the seller packs an order's package into `boxCount` boxes. First
   * call makes the labels; a different count BEFORE the first pickup scan voids the old labels and makes new ones; after a
   * pickup scan the count is locked. `boxCount` undefined keeps what exists (1 box when nothing exists yet). C-parcel-race: runs
   * in one transaction under the order's lock, and the unique `liveSlot` index refuses a second live set, so a double click or a
   * second tab gets the first one's boxes instead of making more.
   */
  async ensureBoxes(orderId: string, sellerKey: string, boxCountRaw?: unknown, m?: EntityManager): Promise<Parcel[]> {
    const want = ParcelsService.wanted(boxCountRaw);
    const run = async (tm: EntityManager) => this.boxesFor(tm, await this.ensureGroup(tm, orderId, sellerKey), sellerKey, want);
    return m ? run(m) : withOrderLocks(this.db, [orderId], run);
  }

  /**
   * C-parcel-group: pack several orders of one seller into ONE box set (inside the caller's transaction, which holds every order's
   * lock). All orders must have the same group key (seller, customer, Kinshasa day, address, delivery mode, hubs) and none may be
   * in a group a rider already collected. Orders leave the label set they were in (its unscanned boxes are void; an emptied set is
   * deleted) and join the target: the oldest unlocked set with the same key, else a new one. Existing boxes keep their codes when
   * `boxCount` is unchanged; the set's `contentsRev` goes up so the seller reprints the contents.
   */
  async packGroup(m: EntityManager, orderIds: string[], sellerKey: string, boxCountRaw?: unknown): Promise<{ group: ParcelGroup; boxes: Parcel[] }> {
    const want = ParcelsService.wanted(boxCountRaw);
    const ids = [...new Set(orderIds)];
    if (ids.length === 1) {
      const group = await this.ensureGroup(m, ids[0], sellerKey);
      return { group, boxes: await this.boxesFor(m, group, sellerKey, want) };
    }
    const orders = await m.find(Order, { where: { id: In(ids) } });
    if (orders.length !== ids.length) throw new NotFoundException('Order not found.');
    const plans = orders.map((o) => ({ o, plan: this.planOf(o, sellerKey) }));
    if (plans.some((p) => !p.plan.sellerKey || p.plan.groupKey !== plans[0].plan.groupKey)) throw new BadRequestException(plans.some((p) => !p.plan.sellerKey) ? GROUP_SINGLE_SELLER : GROUP_MISMATCH);
    const current = new Map<string, ParcelGroup | null>();
    for (const o of orders) current.set(o.id, await this.groupOf(o.id, m));
    for (const [id, g] of current) if (g && (await this.isLocked(m, g))) throw new BadRequestException(`${orders.find((o) => o.id === id)?.reference}: ${GROUP_LOCKED}`);
    const key = plans[0].plan.groupKey;
    const target = [...current.values()].filter((g): g is ParcelGroup => !!g && g.groupKey === key).sort((a, b) => a.daySeq - b.daySeq || +new Date(a.createdAt) - +new Date(b.createdAt))[0] ?? (await this.newGroup(m, plans[0].plan));
    const had = (await this.liveIn(m, target.id, [sellerKey])).length > 0;
    let changed = false;
    for (const o of orders) {
      const g = current.get(o.id) ?? null;
      if (g?.id === target.id) continue;
      if (g) await this.leave(m, g, o.id);
      await m.save(ParcelGroupOrder, m.create(ParcelGroupOrder, { groupId: target.id, orderId: o.id }));
      changed = true;
    }
    if (changed && had) await m.increment(ParcelGroup, { id: target.id }, 'contentsRev', 1);
    const fresh = (await m.findOne(ParcelGroup, { where: { id: target.id } }))!;
    return { group: fresh, boxes: await this.boxesFor(m, fresh, sellerKey, want) };
  }

  /** An order leaves a label set (it moves to another or runs alone): the set keeps its other orders, or is voided and deleted when it was the last. */
  private async leave(m: EntityManager, group: ParcelGroup, orderId: string): Promise<void> {
    await m.delete(ParcelGroupOrder, { groupId: group.id, orderId });
    const left = await m.count(ParcelGroupOrder, { where: { groupId: group.id } });
    if (left) {
      await m.increment(ParcelGroup, { id: group.id }, 'contentsRev', 1);
      return;
    }
    await m.update(Parcel, { groupId: group.id, voidedAt: IsNull() }, { voidedAt: new Date(), liveSlot: null });
    await m.delete(ParcelGroup, { id: group.id });
  }

  /** The seller takes an order out of a label set (before any pickup scan): it gets a label set of its own with the same box count. */
  async detachOrder(m: EntityManager, orderId: string, sellerKey: string): Promise<{ group: ParcelGroup; boxes: Parcel[] }> {
    const group = await this.groupOf(orderId, m);
    if (!group) throw new NotFoundException('Order not found.');
    if (await this.isLocked(m, group)) throw new BadRequestException(GROUP_LOCKED);
    const count = (await this.liveIn(m, group.id, [sellerKey])).length || 1;
    if ((await m.count(ParcelGroupOrder, { where: { groupId: group.id } })) < 2) return { group, boxes: await this.boxesFor(m, group, sellerKey, undefined) };
    await this.leave(m, group, orderId);
    return this.packGroup(m, [orderId], sellerKey, count);
  }

  /** The contents of a label set changed (a line was cancelled): bump the counter so the seller's page says "reprint". */
  async touchContents(orderId: string): Promise<void> {
    const group = await this.groupOf(orderId);
    if (group && (await this.parcels.count({ where: { groupId: group.id, voidedAt: IsNull() } }))) await this.db.increment(ParcelGroup, { id: group.id }, 'contentsRev', 1);
  }

  /** The parcel of a return the customer sends back (one box; idempotent per case). */
  async createForReturn(orderId: string, returnId: string): Promise<Parcel> {
    const live = await this.parcels.findOne({ where: { returnId, voidedAt: IsNull() } });
    if (live) return live;
    return this.parcels.save(this.parcels.create({ orderId, sellerId: null, returnId, groupId: null, liveSlot: null, code: await this.newCode(this.db), boxNo: 1, boxCount: 1, voidedAt: null }));
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

  /**
   * A package (or a whole order) will not travel: its labels are void, so a scan of one says so. When the order shared its label
   * set with other orders, the set stays (their goods are in the boxes) and the order only leaves it.
   */
  async voidFor(orderId: string, sellerKeys?: string[]): Promise<number> {
    const group = await this.groupOf(orderId);
    if (group && (await this.db.count(ParcelGroupOrder, { where: { groupId: group.id } })) > 1) {
      await withOrderLocks(this.db, [orderId], (m) => this.leave(m, group, orderId));
      return 0;
    }
    const where = group ? { groupId: group.id, ...(sellerKeys ? { sellerId: In(sellerKeys) } : {}), returnId: IsNull(), voidedAt: IsNull() } : sellerKeys ? { orderId, sellerId: In(sellerKeys), returnId: IsNull(), voidedAt: IsNull() } : { orderId, returnId: IsNull(), voidedAt: IsNull() };
    const r = await this.parcels.update(where, { voidedAt: new Date(), liveSlot: null });
    return r.affected ?? 0;
  }

  /** The destination area printed on a label: commune and city of the delivery address, never the street or the phone. */
  private static areaOf(shipping: string | null): string | null {
    return areaOf(shipping);
  }

  /**
   * What is in the boxes of these groups (one query for the orders, one for the lines): every live line of every order of the set,
   * restricted to the sellers whose boxes the caller looks at (`sellers` null = all).
   */
  private async contentsOfOrders(orderIds: string[], sellers: Set<string> | null, m: EntityManager = this.db): Promise<{ contents: ContentLine[]; refs: OrderRef[] }> {
    if (!orderIds.length) return { contents: [], refs: [] };
    const orders = (await m.find(Order, { where: { id: In(orderIds) }, select: ['id', 'reference', 'createdAt'] as never })).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt) || a.reference.localeCompare(b.reference) || a.id.localeCompare(b.id));
    const lines = await m.find(OrderItem, { where: { orderId: In(orderIds) } });
    const contents: ContentLine[] = [];
    for (const o of orders) {
      for (const i of lines.filter((l) => l.orderId === o.id)) {
        if (i.fulfilment === 'cancelled' || i.productId.startsWith('ext:')) continue;
        if (sellers && i.sellerId && !sellers.has(i.sellerId)) continue;
        contents.push({ name: i.productName, ...(i.productNameFr?.trim() ? { nameFr: i.productNameFr.trim() } : {}), variant: variantLabel(i.variant), ...(variantLabel(i.variant) && i.variantFr?.trim() ? { variantFr: i.variantFr.trim() } : {}), qty: i.qty, orderReference: o.reference });
      }
    }
    return { contents, refs: orders.map((o) => ({ orderId: o.id, reference: o.reference })) };
  }

  private async storeNameOf(sellerKeys: string[], fallback?: string | null): Promise<string> {
    const seller = sellerKeys.length ? await this.sellers.findOne({ where: [{ id: In(sellerKeys) }, { userId: In(sellerKeys) }] }) : null;
    return seller?.name ?? fallback ?? 'KOMORIKO';
  }

  /** The labels of a seller's label set, with whether the box count can still change. Refused once everything in it was delivered. */
  async labelsForGroup(groupId: string, sellerKeys: string[]): Promise<LabelSet> {
    const group = await this.db.findOne(ParcelGroup, { where: { id: groupId } });
    if (!group) throw new NotFoundException('Order not found.');
    const live = await this.liveIn(this.db, group.id, sellerKeys);
    if (!live.length) throw new BadRequestException('Mark the package ready first: the labels are made then.');
    const orderIds = (await this.db.find(ParcelGroupOrder, { where: { groupId } })).map((r) => r.orderId);
    const { contents, refs } = await this.contentsOfOrders(orderIds, new Set(sellerKeys));
    const lines = (await this.items.find({ where: { orderId: In(orderIds), sellerId: In(sellerKeys) } })).filter((i) => i.fulfilment !== 'cancelled');
    if (lines.length && lines.every((i) => i.deliveredAt)) throw new BadRequestException('This package was delivered: its labels can no longer be printed.');
    const anchor = await this.orders.findOne({ where: { id: refs[0]?.orderId ?? live[0].orderId } });
    const area = ParcelsService.areaOf(anchor?.shippingAddress ?? null);
    const store = await this.storeNameOf(sellerKeys, lines[0]?.sellerName);
    return {
      boxCount: live.length,
      locked: await this.isLocked(this.db, group),
      groupId: group.id,
      orders: refs,
      contentsRev: group.contentsRev,
      labels: live.map((p) => ({ code: p.code, boxNo: p.boxNo, boxCount: p.boxCount, orderReference: refs[0]?.reference ?? '', orderRefs: refs.map((r) => r.reference), storeName: store, destinationArea: area, contents, groupId: group.id, contentsRev: group.contentsRev })),
    };
  }

  /** The labels of a seller's package for an order (its label set). */
  async labelsFor(orderId: string, sellerKeys: string[]): Promise<LabelSet> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found.');
    const group = await this.groupOf(orderId);
    if (!group) throw new BadRequestException('Mark the package ready first: the labels are made then.');
    return this.labelsForGroup(group.id, sellerKeys);
  }

  // ── the leg's checklist ──────────────────────────────────────────────────────
  /** The checklists of several legs at once (a few queries for all of them: memberships, boxes, scans, then orders and lines). */
  async checklists(tasks: DeliveryTask[]): Promise<Map<string, Checklist>> {
    const out = new Map<string, Checklist>();
    if (!tasks.length) return out;
    const orderIds = [...new Set(tasks.map((t) => t.orderId))];
    const members = await this.db.find(ParcelGroupOrder, { where: { orderId: In(orderIds) } });
    const groupOf = new Map(members.map((r) => [r.orderId, r.groupId]));
    const groupIds = [...new Set(members.map((r) => r.groupId))];
    const parcels = await this.parcels.find({ where: groupIds.length ? [{ orderId: In(orderIds), voidedAt: IsNull() }, { groupId: In(groupIds), voidedAt: IsNull() }] : { orderId: In(orderIds), voidedAt: IsNull() }, order: { boxNo: 'ASC' } });
    const scans = parcels.length ? await this.scans.find({ where: { taskId: In(tasks.map((t) => t.id)) } }) : [];
    const cargoOf = new Map<string, Parcel[]>();
    for (const t of tasks) {
      const g = groupOf.get(t.orderId);
      cargoOf.set(t.id, parcels.filter((p) => (p.groupId ? p.groupId === g : p.orderId === t.orderId) && cargoMatches(t, p)));
    }
    // What is in the boxes: one read for every label set the legs touch.
    const withCargo = tasks.filter((t) => cargoOf.get(t.id)!.length);
    const setOrders = new Map<string, string[]>();
    if (withCargo.length) {
      const gids = [...new Set(withCargo.map((t) => groupOf.get(t.orderId)).filter((x): x is string => !!x))];
      const all = gids.length ? await this.db.find(ParcelGroupOrder, { where: { groupId: In(gids) } }) : [];
      for (const r of all) setOrders.set(r.groupId, [...(setOrders.get(r.groupId) ?? []), r.orderId]);
    }
    const ordersFor = (t: DeliveryTask) => {
      const g = groupOf.get(t.orderId);
      return g ? (setOrders.get(g) ?? [t.orderId]) : [t.orderId];
    };
    const everyOrder = [...new Set(withCargo.flatMap(ordersFor))];
    const orderRows = everyOrder.length ? await this.db.find(Order, { where: { id: In(everyOrder) }, select: ['id', 'reference', 'createdAt'] as never }) : [];
    const lineRows = everyOrder.length ? await this.items.find({ where: { orderId: In(everyOrder) } }) : [];
    for (const t of tasks) {
      const cargo = cargoOf.get(t.id)!;
      const lines: ParcelLine[] = cargo.map((p) => ({
        code: p.code,
        groupId: p.groupId ?? null,
        boxNo: p.boxNo,
        boxCount: p.boxCount,
        pickupScannedAt: scans.find((s) => s.taskId === t.id && s.parcelId === p.id && s.stage === 'pickup')?.at ?? null,
        dropoffScannedAt: scans.find((s) => s.taskId === t.id && s.parcelId === p.id && s.stage === 'dropoff')?.at ?? null,
      }));
      lines.sort((a, b) => a.boxNo - b.boxNo);
      let contents: ContentLine[] = [];
      let refs: OrderRef[] = [];
      if (cargo.length) {
        const sellers = new Set(cargo.map((p) => p.sellerId).filter((x): x is string => !!x));
        const rows = orderRows.filter((o) => ordersFor(t).includes(o.id)).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt) || a.reference.localeCompare(b.reference) || a.id.localeCompare(b.id));
        refs = rows.map((o) => ({ orderId: o.id, reference: o.reference }));
        for (const o of rows) {
          for (const i of lineRows.filter((l) => l.orderId === o.id)) {
            if (i.fulfilment === 'cancelled' || i.productId.startsWith('ext:')) continue;
            if (sellers.size && i.sellerId && !sellers.has(i.sellerId)) continue;
            contents.push({ name: i.productName, ...(i.productNameFr?.trim() ? { nameFr: i.productNameFr.trim() } : {}), variant: variantLabel(i.variant), ...(variantLabel(i.variant) && i.variantFr?.trim() ? { variantFr: i.variantFr.trim() } : {}), qty: i.qty, orderReference: o.reference });
          }
        }
      }
      out.set(t.id, { parcels: lines, pickupComplete: lines.every((l) => l.pickupScannedAt), dropoffComplete: lines.every((l) => l.dropoffScannedAt), contents, orders: refs });
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
  /** The orders whose goods are in this box: the orders of its label set (just its own order when it has none). */
  private async setOrderIds(parcel: Pick<Parcel, 'groupId' | 'orderId'>): Promise<string[]> {
    if (!parcel.groupId) return [parcel.orderId];
    const ids = (await this.db.find(ParcelGroupOrder, { where: { groupId: parcel.groupId } })).map((r) => r.orderId);
    return ids.length ? ids : [parcel.orderId];
  }

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
      // The first collection of any box locks the label set: its orders and its box count cannot change any more.
      if (stage === 'pickup') await this.lock(this.db, parcel.groupId);
      return 'new';
    } catch (e) {
      // Two scans of the same box at the same instant: the second finds the first.
      if (isUnique(e)) return (await this.scans.findOne({ where: { parcelId: parcel.id, taskId: task.id, stage } }))?.actorId === actor.id ? 'same' : 'other';
      throw e;
    }
  }

  /** The legs of the OTHER orders in the box's label set that carry this box too (same kind, open): one scan serves them all. */
  private async siblingLegs(leg: DeliveryTask, parcel: Parcel): Promise<DeliveryTask[]> {
    const orderIds = (await this.siblingOrderIds(leg.orderId)).filter((id) => id !== leg.orderId);
    if (!orderIds.length) return [];
    const rows = await this.tasks.find({ where: { orderId: In(orderIds), kind: leg.kind, status: In([...OPEN_STATUSES]) } });
    return rows.filter((t) => cargoMatches(t, parcel));
  }

  /** Record the scan on the leg, then on its sibling legs that `fits` (a failure on a sibling never fails the scan itself). */
  private async recordAll(parcel: Parcel, leg: DeliveryTask, stage: ParcelScanStage, actor: ScanActor, extra: { manual: boolean; reason?: string | null; hubId?: string | null }, fits: (t: DeliveryTask) => boolean): Promise<{ result: 'new' | 'same' | 'other'; siblings: DeliveryTask[] }> {
    const result = await this.record(parcel, leg, stage, actor, extra);
    const siblings: DeliveryTask[] = [];
    if (result === 'other') return { result, siblings };
    for (const t of (await this.siblingLegs(leg, parcel)).filter(fits)) {
      try {
        await this.record(parcel, t, stage, actor, { ...extra, hubId: extra.hubId ?? (stage === 'pickup' ? t.fromHubId : t.toHubId) });
        siblings.push(t);
      } catch {
        /* the sibling keeps its own checklist; the desk can scan it itself */
      }
    }
    return { result, siblings };
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
    const lists = [...(await this.checklists(legs)).values()];
    // One line per box: sibling legs (orders packed in the same boxes) list the same box, which counts once; it is scanned when every leg has it.
    const byCode = new Map<string, ParcelLine[]>();
    for (const l of lists.flatMap((c) => c.parcels)) byCode.set(l.code, [...(byCode.get(l.code) ?? []), l]);
    const parcels: ParcelLine[] = [...byCode.values()].map((copies) => ({
      ...copies[0],
      pickupScannedAt: copies.every((c) => c.pickupScannedAt) ? copies[0].pickupScannedAt : null,
      dropoffScannedAt: copies.every((c) => c.dropoffScannedAt) ? copies[0].dropoffScannedAt : null,
    }));
    const refs = new Map<string, OrderRef>();
    for (const r of lists.flatMap((c) => c.orders)) refs.set(r.orderId, r);
    const seen = new Set<string>();
    const contents = lists.flatMap((c) => c.contents).filter((l) => {
      const k = `${l.orderReference}|${l.name}|${l.variant}|${l.qty}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return { parcels, pickupComplete: parcels.every((p) => p.pickupScannedAt), dropoffComplete: parcels.every((p) => p.dropoffScannedAt), contents, orders: [...refs.values()] };
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
    const inSet = parcel ? await this.setOrderIds(parcel) : [];
    const leg = parcel ? open.find((l) => inSet.includes(l.orderId) && cargoMatches(l, parcel)) : undefined;
    if (!parcel || !leg) throw new BadRequestException(notPartOf(code, open[0].kind));
    if (stage === 'dropoff' && !(COLLECTED_STATUSES as readonly string[]).includes(leg.status)) throw new BadRequestException(`Collect ${code} first: this leg is not picked up yet.`);
    const { result } = await this.recordAll(parcel, leg, stage, { id: riderId, role: 'rider' }, { manual: input.manual === true }, (t) => t.riderId === riderId && (stage === 'pickup' || (COLLECTED_STATUSES as readonly string[]).includes(t.status)));
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
  async staffScan(actor: ScanActor, input: { code?: unknown; mode: 'in' | 'out'; hubId: string | null; manual?: boolean }): Promise<{ task: DeliveryTask; checklist: Checklist; complete: boolean; already: boolean; siblings: DeliveryTask[] }> {
    const { code, parcel } = await this.byCode(input.code);
    if (parcel?.voidedAt) throw new BadRequestException(cancelledLabel(code));
    const where = input.mode === 'in' ? 'is not due at your warehouse.' : 'is not waiting to leave your warehouse.';
    if (!parcel) throw new BadRequestException(`${code} ${where}`);
    const inSet = await this.setOrderIds(parcel);
    const legs = (await this.tasks.find({ where: { orderId: In(inSet), status: In([...OPEN_STATUSES]) } })).filter((t) => cargoMatches(t, parcel));
    const fits = (t: DeliveryTask) =>
      input.mode === 'in'
        ? isHubBound(t.kind) && (!input.hubId || t.toHubId === input.hubId) && (COLLECTED_STATUSES as readonly string[]).includes(t.status)
        : (OUTBOUND_KINDS as readonly string[]).includes(t.kind) && (!input.hubId || t.fromHubId === input.hubId) && t.status === 'assigned';
    const leg = legs.find(fits);
    if (!leg) {
      // Say why when the box is on a leg here that is simply not ready for the scan.
      if (input.mode === 'in' && legs.some((t) => isHubBound(t.kind) && (!input.hubId || t.toHubId === input.hubId))) throw new BadRequestException(`A rider must collect ${code} before it can be scanned in.`);
      if (input.mode === 'out' && legs.some((t) => !input.hubId || t.fromHubId === input.hubId)) throw new BadRequestException(`Assign a rider before handing ${code} over.`);
      throw new BadRequestException(`${code} ${where}`);
    }
    const stage: ParcelScanStage = input.mode === 'in' ? 'dropoff' : 'pickup';
    const { result, siblings } = await this.recordAll(parcel, leg, stage, actor, { manual: input.manual === true, hubId: input.hubId ?? (input.mode === 'in' ? leg.toHubId : leg.fromHubId) }, (t) => fits(t));
    const checklist = await this.checklist(leg);
    const done = stage === 'dropoff' ? checklist.dropoffComplete : checklist.pickupComplete;
    return { task: leg, checklist, complete: done || !(await this.required()), already: result !== 'new', siblings };
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
    if (!parcel || !(await this.setOrderIds(parcel)).includes(task.orderId) || !cargoMatches(task, parcel)) throw new BadRequestException(notPartOf(code, task.kind));
    const { result } = await this.recordAll(parcel, task, stage, actor, { manual: true, reason, hubId: actor.hubId ?? null }, (t) => !actor.hubId || touches(t));
    if (result === 'other') throw new BadRequestException(alreadyScanned(code));
    if (result === 'new') {
      void this.audits
        .save(this.audits.create({ actor: actor.name ?? actor.id, role: actor.role, action: 'parcel.marked_by_hand', entity: 'delivery', entityId: task.id, detail: `${task.orderReference}: ${code} marked ${stage} by hand (${reason})` }))
        .then((log) => this.emitter.toRoles(AUDIT_ROLES, 'audit:created', log))
        .catch(() => undefined);
    }
    return this.checklist(task);
  }

  // ── an order's parcels ───────────────────────────────────────────────────────
  /**
   * `parcels:forOrder { orderId }`: the label sets and boxes of an order for the people who manage it: any admin who reads orders
   * (the street is not part of this answer), warehouse staff when a leg of the order touches their warehouse. Sets that hold
   * several orders say so (and list every order's products).
   */
  async forOrder(actor: ScanActor, orderId: string): Promise<OrderParcels> {
    if (actor.role.startsWith('admin')) {
      if (orderAudienceOf(actor.role) === 'none') throw new BadRequestException(ORDER_ACCESS_DENIED);
    } else if (actor.role === 'warehouse_staff') {
      const legs = await this.tasks.find({ where: { orderId }, select: ['id', 'hubId', 'fromHubId', 'toHubId'] });
      if (!actor.hubId || !legs.some((t) => t.hubId === actor.hubId || t.fromHubId === actor.hubId || t.toHubId === actor.hubId)) throw new NotFoundException('Order not found.');
    } else throw new NotFoundException('Order not found.');
    const group = await this.groupOf(orderId);
    const rows = await this.parcels.find({ where: group ? [{ groupId: group.id }, { orderId, returnId: IsNull() }] : { orderId, returnId: IsNull() }, order: { boxNo: 'ASC', createdAt: 'ASC' } });
    if (!rows.length) return { orderId, sets: [] };
    const scans = await this.scans.find({ where: { parcelId: In(rows.map((p) => p.id)) } });
    const orderIds = group ? (await this.refsOf(this.db, group.id)).map((r) => r.orderId) : [orderId];
    const { contents, refs } = await this.contentsOfOrders(orderIds, null);
    const sellerName = new Map<string, string>();
    for (const k of new Set(rows.map((p) => p.sellerId).filter((x): x is string => !!x))) sellerName.set(k, await this.storeNameOf([k]));
    return {
      orderId,
      sets: [
        {
          groupId: group?.id ?? null,
          orders: refs,
          locked: !!group?.lockedAt,
          contentsRev: group?.contentsRev ?? 0,
          contents,
          boxes: rows.map((p) => {
            const mine = scans.filter((x) => x.parcelId === p.id);
            return {
              code: p.code,
              boxNo: p.boxNo,
              boxCount: p.boxCount,
              voided: !!p.voidedAt,
              storeName: p.sellerId ? (sellerName.get(p.sellerId) ?? null) : null,
              pickupScans: mine.filter((x) => x.stage === 'pickup').length,
              dropoffScans: mine.filter((x) => x.stage === 'dropoff').length,
              lastScanAt: mine.map((x) => x.at).sort((a, b) => +new Date(b) - +new Date(a))[0] ?? null,
            };
          }),
        },
      ],
    };
  }

  // ── resolve ──────────────────────────────────────────────────────────────────
  /**
   * `parcels:resolve { code }`: what a scanned box is, as much as the asker may know. Role-scoped (the same "not found" for a box
   * that does not exist and one that is not theirs, so codes cannot be probed):
   *  - a rider: boxes of THEIR legs; the street and phone only when they have a customer delivery leg for it;
   *  - warehouse staff: boxes on a leg that starts, ends or is managed at their warehouse; full address;
   *  - an admin: any box; the address only for the roles that may read orders in full (`orderAudienceOf`);
   *  - a seller: their own boxes; the AREA only, never the street or the phone.
   */
  async resolve(actor: ScanActor, codeRaw: unknown): Promise<ResolvedParcel> {
    const { code, parcel } = await this.byCode(codeRaw);
    const missing = () => new NotFoundException('Parcel not found.');
    if (!parcel) throw missing();
    const orderIds = await this.setOrderIds(parcel);
    const legs = await this.tasks.find({ where: { orderId: In(orderIds) }, order: { createdAt: 'ASC' } });
    const mine = legs.filter((t) => cargoMatches(t, parcel));
    let seen = mine;
    let fullAddress = false;
    let sellerSide: string[] | null = null;
    if (actor.role === 'rider') {
      seen = mine.filter((t) => t.riderId === actor.id);
      if (!seen.length) throw missing();
      fullAddress = seen.some((t) => isCustomerKind(t.kind));
    } else if (actor.role === 'warehouse_staff') {
      if (!actor.hubId) throw missing();
      seen = mine.filter((t) => t.hubId === actor.hubId || t.fromHubId === actor.hubId || t.toHubId === actor.hubId);
      if (!seen.length) throw missing();
      fullAddress = true;
    } else if (actor.role.startsWith('admin')) {
      const audience = orderAudienceOf(actor.role);
      if (audience === 'none') throw new BadRequestException(ORDER_ACCESS_DENIED);
      fullAddress = audience === 'full';
    } else if (actor.role === 'seller' || actor.role === 'seller_staff') {
      const keys = [actor.id, ...(await this.sellers.find({ where: { userId: actor.id } })).map((x) => x.id)];
      if (!parcel.sellerId || !keys.includes(parcel.sellerId)) throw missing();
      sellerSide = keys;
      seen = [];
    } else throw missing();
    const sellers = parcel.sellerId ? new Set([parcel.sellerId]) : null;
    const { contents, refs } = parcel.returnId ? { contents: [] as ContentLine[], refs: [] as OrderRef[] } : await this.contentsOfOrders(orderIds, sellers);
    const order = await this.orders.findOne({ where: { id: parcel.orderId } });
    const a = addressObject(order?.shippingAddress ?? null);
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const area = areaOf(order?.shippingAddress ?? null);
    const group = parcel.groupId ? await this.db.findOne(ParcelGroup, { where: { id: parcel.groupId } }) : null;
    return {
      code,
      boxNo: parcel.boxNo,
      boxCount: parcel.boxCount,
      voided: !!parcel.voidedAt,
      storeName: parcel.sellerId ? await this.storeNameOf([parcel.sellerId]) : null,
      destinationArea: area,
      destination: {
        area,
        address: fullAddress && a ? [str(a.line1), str(a.commune), str(a.city)].filter(Boolean).join(', ') || null : null,
        phone: fullAddress && a ? str(a.phone) : null,
        recipient: fullAddress ? (order?.customerName ?? null) : null,
      },
      contents,
      orders: refs,
      group: group ? { id: group.id, orders: orderIds.length, locked: !!group.lockedAt, contentsRev: group.contentsRev } : null,
      legs: sellerSide ? [] : seen.map((t) => ({ id: t.id, orderId: t.orderId, orderReference: t.orderReference, kind: t.kind, status: t.status })),
    };
  }
}
