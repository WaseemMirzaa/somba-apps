import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { RETURN_TO_SELLER_ADMINS } from '../common/staff-access';
import { withOrderLock } from '../common/order-lock';
import { cents2, lineShareUsd } from '../common/delivery/split';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt } from 'crypto';
import { EntityManager, In, IsNull, Not, Repository } from 'typeorm';
import {
  AuditLog,
  DeliveryKind,
  DeliveryStatus,
  DeliveryTask,
  Exchange,
  Hub,
  Order,
  OrderItem,
  Payment,
  Product,
  Replacement,
  Seller,
  TransferRun,
  User,
} from '../database/entities';
import { NotificationsService } from '../notifications/notifications.service';
import { AUDIT_ROLES } from '../common/role-groups';
import { isCodeLocked } from '../delivery/delivery-code-lock';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { SettingsService } from '../content/settings.service';
import { parseAddressPin } from '../common/geo/geo';
import { RoutedHub, RoutingService } from './routing.service';
import { LanesService } from './lanes.service';
import { PlannedHop, hubsOnRoute } from './lane-route';
import {
  COLLECTED_STATUSES,
  CUSTOMER_KINDS,
  OPEN_STATUSES,
  OUTBOUND_KINDS,
  canScanInAt,
  canScanOutAt,
  isHubBound,
  isCustomerKind,
  isOpen,
  isOrderFlow,
  kindLabel,
  managingHub,
  movesForward,
  riderFits,
  touchesHub,
} from './leg-rules';
import { DESK_ADMINS_ONLY, DESK_ROLES, isDeskAdmin, tierAllows } from './tiers';
import { HubOpsSettingsService } from './hub-ops-settings.service';
import { AUTO_ASSIGN_KINDS, Candidate, EXPRESS_NOT_RETURNABLE, RETURN_TO_SELLER_REASON, canReturnToSeller, isWorkingNow, pickLeastBusy } from './hub-ops-rules';
import { pushOrderToOps } from './hub-scope';
import { frenchLineNames } from '../translation/line-names';
import { TranslationService } from '../translation/translation.service';

const NO_SELLER = '_none';
/** A leg is tried this many times before it needs a human (orders cancel after the same number of delivery attempts). */
const MAX_ATTEMPTS = () => Number(process.env.DELIVERY_MAX_ATTEMPTS ?? 3);

/** One end of a leg, resolved so clients can draw it on a map. */
export interface TaskEndpoint {
  type: 'seller' | 'hub' | 'customer';
  id: string | null;
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  city?: string | null;
  phone?: string | null;
}

/**
 * One line of what a leg carries (`delivery_tasks.itemsJson`). `name` is the product's name as the order snapshotted
 * it; `nameFr` its French name, so a warehouse desk or a rider reading French sees French. Legs created before
 * `nameFr` existed have none: `viewMany` fills it in when it serves them.
 */
export interface CargoLine {
  orderItemId?: string;
  productId?: string;
  name: string;
  nameFr?: string | null;
  qty: number;
  variant?: string | null;
  sellerId?: string | null;
  [k: string]: unknown;
}

/** What clients receive for a task (never contains the handover code). */
export interface TaskView {
  id: string;
  orderId: string;
  orderReference: string;
  kind: DeliveryKind;
  status: DeliveryStatus;
  riderId: string | null;
  riderName: string | null;
  hubId: string | null;
  fromHubId: string | null;
  toHubId: string | null;
  /** The last warehouse of the transfer chain (= `toHubId` on the last hop and on every single-hop task). */
  finalHubId: string | null;
  sellerId: string | null;
  sellerName: string | null;
  parentTaskId: string | null;
  disputeId: string | null;
  replacementId: string | null;
  exchangeId: string | null;
  attempts: number;
  codAmountUsd: number;
  /** The cash record (C-cod): what the rider confirmed taking, when, and how much of it the warehouse has received. Null before any. */
  codCollectedUsd: number | null;
  codCollectedAt: Date | null;
  codHandedOverUsd: number;
  address: string | null;
  pickupAddress: string | null;
  lat: number | null;
  lng: number | null;
  failureReason: string | null;
  readyAt: Date | null;
  receivedAt: Date | null;
  pickedUpAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  from: TaskEndpoint | null;
  to: TaskEndpoint | null;
  fromHub: TaskEndpoint | null;
  toHub: TaskEndpoint | null;
  items: CargoLine[];
  /** True on legs where the rider also collects the old unit (replacement / exchange). */
  collectOld: boolean;
  /** Does finishing this leg need the customer's 4-digit code? (Only a delivery to the customer, and only while `requireDeliveryCode` is on.) */
  needsCode: boolean;
  /** RD-01: wrong customer codes counted on this task, until when the code step is locked, and whether it is locked right now (a supervisor unlocks it). */
  codeFailures: number;
  codeLockedUntil: Date | null;
  codeLocked: boolean;
  /** Is this a leg of the order's own journey (so it moves the customer's order status)? */
  orderFlow: boolean;
  /** The transfer run (manifest) the parcel travels in, with its reference ("TR-0042"); null when none. */
  runId: string | null;
  runReference: string | null;
  /** Which hop of a multi-warehouse transfer this is (1-based) and how many there are; 1 of 1 for every other leg. */
  hop: number;
  hops: number;
  /** On a customer leg: the sellers whose parcels it carries (null = a legacy leg that carries everything; null on every other leg). */
  sellerIds: (string | null)[] | null;
  /** On a customer leg: does delivering it finish the order (every live line not delivered by another leg is on it)? False on every other leg. */
  completesOrder: boolean;
}

export type LogisticsEventType = 'created' | 'assigned' | 'picked_up' | 'in_transit' | 'scanned_in' | 'delivered' | 'failed' | 'voided';
export interface LogisticsEvent {
  type: LogisticsEventType;
  task: DeliveryTask;
}
export type LogisticsListener = (event: LogisticsEvent) => void | Promise<void>;

export interface ReturnItemInput {
  orderItemId?: string;
  productId?: string;
  qty?: number;
}

/** Who is acting (for the tier / warehouse checks). Admins pass hubId = null. */
export interface Actor {
  id: string;
  role: string;
  name: string;
  hubId?: string | null;
  tier?: string | null;
}

/**
 * The three-leg journey (seller -> origin warehouse -> destination warehouse -> customer) and its reverse. Owns
 * every delivery-task write for the new legs: other modules call these methods and never create tasks themselves.
 */
@Injectable()
export class LogisticsService {
  private readonly logger = new Logger(LogisticsService.name);
  private readonly listeners: LogisticsListener[] = [];

  constructor(
    @InjectRepository(DeliveryTask) private readonly tasks: Repository<DeliveryTask>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderItem) private readonly items: Repository<OrderItem>,
    @InjectRepository(Hub) private readonly hubs: Repository<Hub>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(AuditLog) private readonly audits: Repository<AuditLog>,
    private readonly routing: RoutingService,
    private readonly lanes: LanesService,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
    private readonly settings?: SettingsService,
    @Optional() private readonly translations?: TranslationService,
    @Optional() private readonly hubOps?: HubOpsSettingsService,
  ) {}

  // ── listeners (after-sale and others follow the legs) ────────────────────────
  /** Be told when a leg is created, assigned, picked up, scanned in, delivered or failed. Errors in a listener are logged, never thrown. */
  registerListener(fn: LogisticsListener): void {
    this.listeners.push(fn);
  }

  private async fire(type: LogisticsEventType, task: DeliveryTask): Promise<void> {
    for (const fn of this.listeners) {
      try {
        await fn({ type, task });
      } catch (e) {
        this.logger.warn(`listener failed on ${type} ${task.id}: ${(e as Error).message}`);
      }
    }
  }

  // ── small lookups ────────────────────────────────────────────────────────────
  private async allHubs(): Promise<Map<string, Hub>> {
    return new Map((await this.hubs.find()).map((h) => [h.id, h]));
  }

  /** The store row behind a seller id (a store id, or the owner's user id on demo data). */
  private async sellerRow(id: string | null | undefined): Promise<Seller | null> {
    if (!id) return null;
    return (await this.sellers.findOne({ where: { id } })) ?? (await this.sellers.findOne({ where: { userId: id } }));
  }

  private async sellerUser(id: string | null | undefined): Promise<string | null> {
    if (!id) return null;
    return (await this.sellerRow(id))?.userId ?? id;
  }

  /** Active warehouse staff of a warehouse. */
  async staffIds(hubId: string | null | undefined, minTier?: 'supervisor' | 'manager'): Promise<string[]> {
    if (!hubId) return [];
    const rows = await this.users.find({ where: { role: 'warehouse_staff', active: true, hubId }, select: ['id', 'warehouseTier', 'role'] });
    return rows.filter((u) => !minTier || tierAllows(u.role, u.warehouseTier, minTier === 'manager' ? 'manage' : 'assign')).map((u) => u.id);
  }

  /** The 4-digit handover code (a select:false column). */
  async proofCodeOf(taskId: string): Promise<string | null> {
    const row = await this.tasks.createQueryBuilder('t').addSelect('t.proofCode').where('t.id = :id', { id: taskId }).getOne();
    return row?.proofCode ?? null;
  }

  private audit(actor: Actor | null, action: string, task: DeliveryTask, detail?: string): void {
    if (!actor) return;
    void this.audits
      .save(this.audits.create({ actor: actor.name, role: actor.role, action, entity: 'delivery', entityId: task.id, detail: detail ?? `${task.orderReference} ${task.kind}` }))
      .then((log) => this.emitter.toRoles(AUDIT_ROLES, 'audit:created', log))
      .catch(() => undefined);
  }

  /** A line of an order as a leg carries it. */
  private static cargoLine(i: Pick<OrderItem, 'id' | 'productId' | 'productName' | 'qty'>, nameFr?: string | null): CargoLine {
    return { orderItemId: i.id, productId: i.productId, name: i.productName, ...(nameFr?.trim() ? { nameFr: nameFr.trim() } : {}), qty: i.qty };
  }

  /** What a task carries, parsed from `itemsJson` (a broken value is no cargo). */
  private static cargoOf(t: Pick<DeliveryTask, 'itemsJson'>): CargoLine[] {
    try {
      const v = t.itemsJson ? (JSON.parse(t.itemsJson) as unknown) : [];
      return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as CargoLine[]) : [];
    } catch {
      return [];
    }
  }

  /**
   * Legs made before `nameFr` was kept have only the English name. Serve the French one anyway: the order's own line
   * (matched by its id, else by product, else by name) knows it from the snapshot taken at checkout. A line nothing can
   * name keeps its base name, which clients show in both languages.
   */
  private static withFrenchNames(items: CargoLine[], order: Order | undefined): CargoLine[] {
    const lines = order?.items ?? [];
    return items.map((it) => {
      if (typeof it.nameFr === 'string' && it.nameFr.trim()) return it;
      const line =
        (it.orderItemId ? lines.find((l) => l.id === it.orderItemId) : undefined) ??
        (it.productId ? lines.find((l) => l.productId === it.productId) : undefined) ??
        lines.find((l) => l.productName === it.name);
      const nameFr = line?.productNameFr?.trim();
      return nameFr ? { ...it, nameFr } : it;
    });
  }

  // ── views ────────────────────────────────────────────────────────────────────
  /** Tasks as clients see them: endpoints resolved, the handover code never included. */
  async viewMany(tasks: DeliveryTask[], audience: 'ops' | 'seller' = 'ops'): Promise<TaskView[]> {
    if (!tasks.length) return [];
    const hubs = await this.allHubs();
    // The handover code is only asked for when the platform requires it (`requireDeliveryCode`), and only on the delivery to the customer.
    const codeRequired = (await this.settings?.get('requireDeliveryCode')) === 'true';
    const sellerKeys = [...new Set(tasks.map((t) => t.sellerId).filter((x): x is string => !!x))];
    const sellers = sellerKeys.length ? await this.sellers.find({ where: [{ id: In(sellerKeys) }, { userId: In(sellerKeys) }] }) : [];
    const sellerOf = (id: string | null) => (id ? (sellers.find((s) => s.id === id) ?? sellers.find((s) => s.userId === id) ?? null) : null);
    const orderIds = [...new Set(tasks.map((t) => t.orderId))];
    const orders = new Map((await this.orders.find({ where: { id: In(orderIds) } })).map((o) => [o.id, o]));
    const runIds = [...new Set(tasks.map((t) => t.runId).filter((x): x is string => !!x))];
    const runRefs = runIds.length ? new Map((await this.tasks.manager.find(TransferRun, { where: { id: In(runIds) }, select: ['id', 'reference'] })).map((r) => [r.id, r.reference])) : new Map<string, string>();
    const riderIds = [...new Set(tasks.map((t) => t.riderId).filter((x): x is string => !!x))];
    const riders = riderIds.length ? new Map((await this.users.find({ where: { id: In(riderIds) }, select: ['id', 'name'] })).map((u) => [u.id, u.name])) : new Map<string, string>();

    const hubEp = (id: string | null): TaskEndpoint | null => {
      if (!id) return null;
      const h = hubs.get(id);
      return { type: 'hub', id, name: h?.name ?? null, address: h?.address ?? h?.city ?? null, lat: h?.lat ?? null, lng: h?.lng ?? null, city: h?.city ?? null };
    };
    const sellerEp = (t: DeliveryTask): TaskEndpoint => {
      const s = sellerOf(t.sellerId);
      return { type: 'seller', id: s?.id ?? t.sellerId, name: s?.name ?? null, address: s?.pickupAddress ?? t.pickupAddress ?? null, lat: s?.pickupLat ?? null, lng: s?.pickupLng ?? null };
    };
    const customerEp = (t: DeliveryTask): TaskEndpoint => {
      const o = orders.get(t.orderId);
      const raw = t.address ?? o?.shippingAddress ?? null;
      let text: string | null = raw;
      let phone: string | null = null;
      let city: string | null = null;
      try {
        const a = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
        if (a && typeof a === 'object') {
          text = [a.line1, a.line2, a.commune, a.city].filter((x) => typeof x === 'string' && x).join(', ') || raw;
          phone = typeof a.phone === 'string' ? a.phone : null;
          city = typeof a.city === 'string' ? a.city : null;
        }
      } catch {
        /* free-text address */
      }
      const pin = parseAddressPin(raw).point;
      return { type: 'customer', id: o?.customerId ?? null, name: o?.customerName ?? null, address: text, lat: pin?.lat ?? null, lng: pin?.lng ?? null, city, phone };
    };

    // Does each customer leg finish its order? (Read once per order, from the lines it still has to deliver.)
    const completes = new Map<string, boolean>();
    for (const t of tasks) {
      if (!isCustomerKind(t.kind ?? 'delivery') || !isOrderFlow({ kind: t.kind ?? 'delivery', disputeId: t.disputeId, replacementId: t.replacementId, exchangeId: t.exchangeId })) continue;
      const o = orders.get(t.orderId);
      completes.set(t.id, !o || (await this.completesFor(t, o)));
    }

    return tasks.map((t) => {
      let from: TaskEndpoint | null = null;
      let to: TaskEndpoint | null = null;
      switch (isCustomerKind(t.kind) ? 'customer' : t.kind) {
        case 'pickup':
          from = sellerEp(t);
          to = hubEp(t.toHubId);
          break;
        case 'transfer':
        case 'return_transfer':
          from = hubEp(t.fromHubId);
          to = hubEp(t.toHubId);
          break;
        case 'customer':
        case 'replacement_delivery':
          // An express leg starts at the seller (no warehouse at either end); every other customer leg starts at its warehouse.
          from = t.kind === 'express' ? sellerEp(t) : hubEp(t.fromHubId ?? t.hubId);
          to = customerEp(t);
          break;
        case 'return_pickup':
          from = customerEp(t);
          to = hubEp(t.toHubId);
          break;
        case 'return_to_seller':
          from = hubEp(t.fromHubId ?? t.hubId);
          to = sellerEp(t);
          break;
      }
      const items = LogisticsService.withFrenchNames(LogisticsService.cargoOf(t), orders.get(t.orderId));
      const base: TaskView = {
        id: t.id,
        orderId: t.orderId,
        orderReference: t.orderReference,
        kind: t.kind ?? 'delivery',
        status: t.status,
        riderId: t.riderId,
        riderName: t.riderId ? (riders.get(t.riderId) ?? null) : null,
        hubId: t.hubId ?? null,
        fromHubId: t.fromHubId ?? null,
        toHubId: t.toHubId ?? null,
        finalHubId: t.finalHubId ?? t.toHubId ?? null,
        sellerId: t.sellerId ?? null,
        sellerName: sellerOf(t.sellerId)?.name ?? null,
        parentTaskId: t.parentTaskId ?? null,
        disputeId: t.disputeId ?? null,
        replacementId: t.replacementId ?? null,
        exchangeId: t.exchangeId ?? null,
        attempts: t.attempts,
        codAmountUsd: t.codAmountUsd,
        codCollectedUsd: t.codCollectedUsd ?? null,
        codCollectedAt: t.codCollectedAt ?? null,
        codHandedOverUsd: t.codHandedOverUsd ?? 0,
        address: t.address,
        pickupAddress: t.pickupAddress,
        lat: t.lat,
        lng: t.lng,
        failureReason: t.failureReason,
        readyAt: t.readyAt,
        receivedAt: t.receivedAt,
        pickedUpAt: t.pickedUpAt,
        deliveredAt: t.deliveredAt,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        from,
        to,
        fromHub: hubEp(t.fromHubId ?? null),
        toHub: hubEp(t.toHubId ?? null),
        items,
        collectOld: t.kind === 'replacement_delivery',
        needsCode: codeRequired && isCustomerKind(t.kind ?? 'delivery'),
        codeFailures: t.codeFailures ?? 0,
        codeLockedUntil: t.codeLockedUntil ?? null,
        codeLocked: isCodeLocked(t, Date.now()),
        orderFlow: isOrderFlow({ kind: t.kind ?? 'delivery', disputeId: t.disputeId, replacementId: t.replacementId, exchangeId: t.exchangeId }),
        runId: t.runId ?? null,
        runReference: t.runId ? (runRefs.get(t.runId) ?? null) : null,
        hop: t.hop ?? 1,
        hops: t.hops ?? 1,
        sellerIds: isCustomerKind(t.kind ?? 'delivery') ? (t.sellerIds ?? null) : null,
        completesOrder: completes.get(t.id) ?? false,
      };
      if (audience === 'seller') {
        // A seller sees where their parcel is, never the customer.
        return { ...base, sellerIds: null, codeFailures: 0, codeLockedUntil: null, codeLocked: false, address: null, codAmountUsd: 0, codCollectedUsd: null, codCollectedAt: null, codHandedOverUsd: 0, lat: null, lng: null, from: base.from?.type === 'customer' ? null : base.from, to: base.to?.type === 'customer' ? null : base.to, riderName: base.riderName ? base.riderName.split(' ')[0] : null };
      }
      return base;
    });
  }

  async view(task: DeliveryTask, audience: 'ops' | 'seller' = 'ops'): Promise<TaskView> {
    return (await this.viewMany([task], audience))[0];
  }

  /**
   * Push a changed task to everyone who follows it: the warehouses at its ends (`task:updated`), admins, the assigned
   * rider and, on legs that touch a seller, the seller. (`delivery:updated` carries the same payload for older clients.)
   */
  async emitTask(task: DeliveryTask): Promise<void> {
    try {
      const fresh = (await this.tasks.findOne({ where: { id: task.id } })) ?? task;
      const view = await this.view(fresh);
      const hubIds = [...new Set([fresh.hubId, fresh.fromHubId, fresh.toHubId].filter((x): x is string => !!x))];
      for (const ev of ['task:updated', 'delivery:updated']) {
        for (const h of hubIds) this.emitter.toHub(h, ev, view);
        this.emitter.toRoles(DESK_ROLES, ev, view);
        if (fresh.riderId) this.emitter.toUser(fresh.riderId, ev, view);
      }
      // The customer follows their parcel: the order goes out again, and their view of it (OrdersService.customerViews)
      // carries the journey, so a leg that moved shows up without a refresh. Only legs of the order's own journey.
      if (isOrderFlow(fresh)) {
        const order = await this.orders.findOne({ where: { id: fresh.orderId } });
        if (order) this.emitter.toUser(order.customerId, 'order:updated', order);
      }
      if (fresh.sellerId && ['pickup', 'express', 'return_to_seller', 'transfer', 'return_transfer'].includes(fresh.kind)) {
        const sellerUser = await this.sellerUser(fresh.sellerId);
        if (sellerUser) this.emitter.toUser(sellerUser, 'task:updated', await this.view(fresh, 'seller'));
      }
    } catch (e) {
      this.logger.warn(`emitTask ${task.id} failed: ${(e as Error).message}`);
    }
  }

  // ── creating legs ────────────────────────────────────────────────────────────
  private async make(base: Partial<DeliveryTask> & Pick<DeliveryTask, 'kind' | 'orderId' | 'orderReference'>, m?: EntityManager): Promise<DeliveryTask> {
    const hubId = base.hubId ?? managingHub(base.kind, base.fromHubId, base.toHubId);
    const repo = m ? m.getRepository(DeliveryTask) : this.tasks;
    const row = repo.create({
      status: 'unassigned',
      attempts: 1,
      codAmountUsd: 0,
      fromHubId: null,
      toHubId: null,
      sellerId: null,
      parentTaskId: null,
      disputeId: null,
      replacementId: null,
      exchangeId: null,
      ...base,
      hubId,
      // Only the customer delivery of an order is protected by the 4-digit code.
      proofCode: isCustomerKind(base.kind) ? (base.proofCode ?? String(randomInt(1000, 10000))) : null,
    });
    const saved = await repo.save(row);
    saved.proofCode = null; // the code lives in the database only; the object we hand around must never carry it
    return saved;
  }

  /**
   * Tell the managing warehouse (and the live feeds) that a leg is waiting for a rider. When the warehouse switched
   * auto-assignment on and is open, the leg is given to its least busy rider right away instead (no "task to assign" notice:
   * there is nothing left for staff to do).
   */
  private async announce(task: DeliveryTask): Promise<void> {
    await this.emitTask(task);
    await this.fire('created', task);
    // An express leg exists from the moment of the order but cannot be collected before the seller packs it: nobody is asked to assign it
    // yet. `markSellerReady` tells the warehouse and auto-assigns it then.
    if (task.kind === 'express' && !task.readyAt) return;
    if (await this.autoAssign(task)) return;
    try {
      const staff = await this.staffIds(task.hubId, 'supervisor');
      const all = staff.length ? staff : await this.staffIds(task.hubId);
      await this.notifications.toUsers(all, {
        title: 'Task to assign',
        body: `${task.orderReference}: ${kindLabel(task.kind)} needs a rider.`,
        type: 'task',
        entityId: task.id,
        extra: { orderId: task.orderId, kind: task.kind },
      });
    } catch {
      /* best effort: the task is already in the queue */
    }
  }

  private async groupBySeller(order: Order): Promise<Map<string, OrderItem[]>> {
    const groups = new Map<string, OrderItem[]>();
    for (const item of order.items ?? []) {
      if (item.fulfilment === 'cancelled') continue;
      let key = item.sellerId;
      if (!key && !item.productId.startsWith('ext:')) key = (await this.products.findOne({ where: { id: item.productId }, select: ['id', 'sellerId'] }))?.sellerId ?? null;
      const k = key ?? NO_SELLER;
      groups.set(k, [...(groups.get(k) ?? []), item]);
    }
    return groups;
  }

  private async hubAddressText(hubId: string | null): Promise<string> {
    const h = hubId ? await this.hubs.findOne({ where: { id: hubId } }) : null;
    return h ? [h.name, h.address ?? h.city].filter(Boolean).join(' — ') : 'KOMORIKO hub';
  }

  /** The cash to collect at the door (0 for prepaid; follows partial refunds that lowered the payment). */
  private async codFor(order: Order): Promise<number> {
    if (order.paymentMethod !== 'cod') return 0;
    const pay = await this.tasks.manager.findOne(Payment, { where: { orderId: order.id } });
    if (!pay) return order.totalUsd;
    return pay.status === 'pending' ? pay.amountUsd : 0;
  }

  /**
   * Create the next transfer hop of a parcel that now stands at `fromHubId` and must end at `finalHubId`: the first hop of the
   * shortest chain of active lanes (direct when there are no lanes, or none connects: admins are told in that case).
   * `kind` is `transfer` on the way to the customer, `return_transfer` on the way back to the seller. `preferred` is an
   * already-chosen chain (a return runs the order's route in reverse) used while its first hop starts here.
   */
  private async makeHop(
    parent: DeliveryTask,
    kind: 'transfer' | 'return_transfer',
    fromHubId: string,
    finalHubId: string,
    extra: Partial<DeliveryTask> = {},
    preferred: PlannedHop[] | null = null,
  ): Promise<DeliveryTask> {
    let hops: PlannedHop[];
    if (preferred?.length && preferred[0].fromHubId === fromHubId && preferred[preferred.length - 1].toHubId === finalHubId) hops = preferred;
    else {
      const plan = await this.lanes.route(fromHubId, finalHubId);
      hops = plan.hops;
      if (!plan.connected) await this.alertUnconnected(parent.orderReference, fromHubId, finalHubId, parent.id);
    }
    const first = hops[0];
    const done = parent.kind === kind ? (parent.hop ?? 1) : 0;
    const t = await this.make({
      kind,
      orderId: parent.orderId,
      orderReference: parent.orderReference,
      fromHubId,
      toHubId: first?.toHubId ?? finalHubId,
      finalHubId,
      hubId: fromHubId,
      hop: done + 1,
      hops: done + Math.max(1, hops.length),
      sellerId: parent.sellerId,
      parentTaskId: parent.id,
      disputeId: parent.disputeId,
      replacementId: parent.replacementId,
      exchangeId: parent.exchangeId,
      itemsJson: parent.itemsJson,
      pickupAddress: await this.hubAddressText(fromHubId),
      address: await this.hubAddressText(first?.toHubId ?? finalHubId),
      ...extra,
    });
    await this.announce(t);
    return t;
  }

  /** Lanes exist but none connects two warehouses a parcel must travel between: it goes direct and admins are told. */
  private async alertUnconnected(orderReference: string, fromHubId: string, toHubId: string, taskId: string): Promise<void> {
    try {
      const names = await this.allHubs();
      await this.notifications.toAdmins({
        title: 'Warehouses not connected',
        body: `${orderReference}: no lane connects ${names.get(fromHubId)?.name ?? 'a warehouse'} to ${names.get(toHubId)?.name ?? 'another'}, so the parcel goes direct.`,
        type: 'task',
        entityId: taskId,
      }, 'logisticsDesk');
    } catch {
      /* best effort */
    }
  }

  /**
   * An order was paid (or is cash on delivery): create one pickup task per seller, from that seller's origin
   * warehouse. The next legs appear as the parcels are scanned in (see {@link onScanIn}). Safe to call twice.
   */
  async planOrder(order: Order): Promise<DeliveryTask[]> {
    const full = order.items?.length ? order : ((await this.orders.findOne({ where: { id: order.id } })) ?? order);
    // Idempotent: an order that already has its first legs (a pickup per seller, or its one express leg) is not planned again (a payment
    // webhook after the create, a retry). The mode recorded at checkout decides which; planning never decides again (conditions may
    // have changed during a mobile-money confirmation).
    const existing = await this.tasks.find({ where: { orderId: full.id, kind: In(['pickup', 'express']), disputeId: IsNull(), replacementId: IsNull(), exchangeId: IsNull() } });
    if (existing.length) return existing;

    const groups = await this.groupBySeller(full);
    const hubs = await this.routing.hubsWithRiders();
    if (full.deliveryMode === 'express') {
      const express = await this.planExpress(full, groups, hubs);
      if (express) return express;
      // The recorded hub is gone (deleted since checkout): the order is a standard one after all.
      await this.orders.update({ id: full.id }, { deliveryMode: 'standard' });
      full.deliveryMode = 'standard';
    }
    // The route recorded when the order was placed (and the fee quoted) wins while that warehouse still works; only an
    // order from before routes were recorded is routed now. Nothing already in progress is rerouted.
    let destination: RoutedHub | undefined = full.destinationHubId ? hubs.find((h) => h.id === full.destinationHubId && h.active) : undefined;
    if (!destination) {
      const route = await this.routing.route({
        shippingAddress: full.shippingAddress,
        sellerIds: [...groups.keys()].map((k) => (k === NO_SELLER ? null : k)),
      });
      destination = hubs.find((h) => h.id === route.destinationHubId) as RoutedHub;
    }
    const created: DeliveryTask[] = [];
    const originIds: string[] = [];
    const originBySeller: Record<string, string> = {};
    // The cargo carries each product's French name too (the order may have been passed in unsaved lines: read them back).
    const frNames = await frenchLineNames(this.items.manager, [...groups.values()].flatMap((ls) => ls.map((i) => i.id)));
    for (const [key, lines] of groups) {
      const seller = key === NO_SELLER ? null : await this.sellerRow(key);
      const origin = await this.routing.originFor(seller, destination, hubs, full.originBySeller?.[key]);
      originIds.push(origin.id);
      originBySeller[key] = origin.id;
      const pickupText = seller
        ? `${seller.name} — ${seller.pickupAddress || 'address not provided, contact the seller'}`
        : await this.hubAddressText(origin.id);
      created.push(
        await this.make({
          kind: 'pickup',
          orderId: full.id,
          orderReference: full.reference,
          toHubId: origin.id,
          hubId: origin.id,
          sellerId: key === NO_SELLER ? null : key,
          pickupAddress: pickupText,
          address: await this.hubAddressText(origin.id),
          itemsJson: JSON.stringify(lines.map((i) => LogisticsService.cargoLine(i, frNames.get(i.id)?.nameFr ?? i.productNameFr))),
        }),
      );
    }
    // The planned chain of warehouses of each parcel (recorded at checkout; planned now for an order from before routes were kept).
    const routeBySeller: Record<string, string[]> = { ...(full.routeBySeller ?? {}) };
    for (const [key, hubId] of Object.entries(originBySeller)) {
      if (!routeBySeller[key]) routeBySeller[key] = hubsOnRoute((await this.lanes.route(hubId, destination.id)).hops, hubId);
    }
    await this.orders.update({ id: full.id }, { destinationHubId: destination.id, originHubIds: originIds, originBySeller, routeBySeller });
    for (const t of created) await this.announce(t);
    return created;
  }

  /**
   * An EXPRESS order: ONE leg from the seller to the customer, managed by the warehouse the route recorded (origin = destination).
   * It carries the whole order, the full cash to collect (it always completes the order), a handover code and, like every customer
   * leg, a proof photo. It is not auto-assigned until the seller marks the package ready (see {@link markSellerReady}).
   * Returns null when the order's warehouse no longer exists (the caller then plans it as a standard order).
   */
  private async planExpress(order: Order, groups: Map<string, OrderItem[]>, hubs: RoutedHub[]): Promise<DeliveryTask[] | null> {
    const hub = order.destinationHubId ? hubs.find((h) => h.id === order.destinationHubId) : undefined;
    const keys = [...groups.keys()];
    if (!hub || keys.length !== 1 || keys[0] === NO_SELLER) return null;
    const key = keys[0];
    const seller = await this.sellerRow(key);
    if (!seller) return null;
    const lines = groups.get(key) ?? [];
    const frNames = await frenchLineNames(this.items.manager, lines.map((i) => i.id));
    const leg = await this.make({
      kind: 'express',
      orderId: order.id,
      orderReference: order.reference,
      hubId: hub.id,
      sellerId: key,
      sellerIds: [key],
      address: order.shippingAddress,
      pickupAddress: `${seller.name} — ${seller.pickupAddress || 'address not provided, contact the seller'}`,
      codAmountUsd: await this.codFor(order),
      itemsJson: JSON.stringify(lines.map((i) => LogisticsService.cargoLine(i, frNames.get(i.id)?.nameFr ?? i.productNameFr))),
    });
    // C14: after-sale (returns, replacements) runs through this warehouse, so the route is recorded as origin = destination = the managing warehouse.
    await this.orders.update({ id: order.id }, { destinationHubId: hub.id, originHubIds: [hub.id], originBySeller: { [key]: hub.id }, routeBySeller: { [key]: [hub.id] } });
    await this.announce(leg);
    return [leg];
  }

  // ── the customer leg: one open at a time, merged while it waits, split after the limit ───────
  /** A seller's key on an order's lines and legs (`null` ids are lines no seller owns). */
  private static keyOf(id: string | null | undefined): string {
    return id ?? NO_SELLER;
  }

  /**
   * Does a customer leg finish its order? True when every live line that no OTHER leg delivered belongs to one of the leg's
   * sellers (a legacy leg, `sellerIds` null, carries everything). Computed from the lines each time: a partial leg becomes
   * the last one when another seller cancels, or when the rest arrives and merges into it.
   */
  private async completesFor(task: Pick<DeliveryTask, 'id' | 'sellerIds'>, order: Order): Promise<boolean> {
    if (!task.sellerIds) return true;
    const mine = new Set(task.sellerIds.map((k) => LogisticsService.keyOf(k)));
    const groups = await this.groupBySeller(order);
    for (const [key, lines] of groups) {
      if (lines.some((l) => !l.deliveredAt || l.deliveryTaskId === task.id) && !mine.has(key)) return false;
    }
    return true;
  }

  /** Public: does delivering this customer leg finish its order? (Anything that is not a customer leg of the order's own journey counts as yes.) */
  async completesOrder(task: DeliveryTask): Promise<boolean> {
    if (!isCustomerKind(task.kind) || !isOrderFlow(task)) return true;
    const order = await this.orders.findOne({ where: { id: task.orderId } });
    return order ? this.completesFor(task, order) : true;
  }

  /**
   * The cash a customer leg collects at the door (0 for prepaid). A leg that finishes the order takes the REMAINDER (what the
   * payment still asks, after the cash earlier legs collected), so rounding can never leave the payment a cent apart. Any other
   * leg takes its sellers' lines (the same pro-rata discount a seller's part-cancel refunds by) plus the delivery fee when no
   * customer leg has delivered yet. A payment that is not pending any more asks for nothing.
   */
  private async codShare(m: EntityManager, order: Order, leg: Pick<DeliveryTask, 'id' | 'sellerIds'>, legs: DeliveryTask[], cargo: OrderItem[], completes: boolean): Promise<number> {
    if (order.paymentMethod !== 'cod') return 0;
    const pay = await m.findOne(Payment, { where: { orderId: order.id } });
    if (pay && pay.status !== 'pending') return 0;
    const total = pay ? pay.amountUsd : order.totalUsd;
    const delivered = legs.filter((t) => isCustomerKind(t.kind) && t.status === 'delivered' && t.id !== leg.id);
    const collected = cents2(delivered.reduce((t, x) => t + (x.codCollectedUsd ?? 0), 0));
    const left = Math.max(0, cents2(total - collected));
    if (completes) return left;
    const value = cargo.reduce((t, i) => t + i.priceUsd * i.qty, 0);
    const fee = delivered.length ? 0 : (order.deliveryFeeUsd ?? 0);
    return Math.min(left, cents2(lineShareUsd(order, value) + fee));
  }

  /** The live lines of these sellers that have not reached the customer. */
  private static undelivered(groups: Map<string, OrderItem[]>, keys: Iterable<string>): OrderItem[] {
    const out: OrderItem[] = [];
    for (const k of keys) for (const l of groups.get(k) ?? []) if (!l.deliveredAt) out.push(l);
    return out;
  }

  /**
   * ONE pass of customer-leg planning for an order, run inside {@link withOrderLock}: read the order's legs and lines, decide, then
   * create, merge into, or leave the open customer leg. It only decides from the current state, so running it twice (a scan-in and
   * the sweeper at the same moment, a retry after a crash) changes nothing the second time.
   *
   *  - There is at most ONE open customer leg per order. While it is unassigned or assigned, parcels that arrive are merged into it
   *    (its sellers, cargo and cash change). While it is on the road they wait; when it ends, the next pass plans the next leg.
   *  - With none open: once every parcel with goods left is at the destination, the leg is planned for all of them; before that,
   *    only when the oldest waiting parcel has waited `splitAfterHours` (0 = never) and then only for the parcels that arrived.
   *  - `retryOf`: a failed leg is planned again at once (with everything at the warehouse), keeping its proof code.
   */
  private async planCustomerLeg(m: EntityManager, orderId: string, opts: { now: Date; splitHours: number; retryOf?: DeliveryTask | null }): Promise<{ created: DeliveryTask | null; merged: DeliveryTask | null; shipped: boolean; finished: boolean; cod: DeliveryTask | null }> {
    const none = { created: null, merged: null, shipped: false, finished: false, cod: null };
    const order = await m.findOne(Order, { where: { id: orderId } });
    if (!order || ['cancelled', 'returned', 'delivered'].includes(order.status)) return none;
    const all = await m.find(DeliveryTask, { where: { orderId, disputeId: IsNull(), replacementId: IsNull(), exchangeId: IsNull() }, order: { createdAt: 'ASC' } });
    // The latest attempt of each seller's pickup; one that was voided (seller cancelled) no longer counts.
    const latest = new Map<string, DeliveryTask>();
    for (const t of all.filter((x) => x.kind === 'pickup')) {
      const k = LogisticsService.keyOf(t.sellerId);
      const cur = latest.get(k);
      if (!cur || t.attempts >= cur.attempts) latest.set(k, t);
    }
    const pickups = new Map([...latest].filter(([, p]) => !(p.status === 'failed' && !p.parentTaskId && /cancel/i.test(p.failureReason ?? ''))));
    if (!pickups.size) return none;
    const firstTransfer = all.find((t) => t.kind === 'transfer');
    const dest = order.destinationHubId ?? firstTransfer?.finalHubId ?? firstTransfer?.toHubId ?? [...pickups.values()][0].toHubId;
    if (!dest) return none;
    const shipped = [...pickups.values()].every((p) => p.status === 'delivered');

    // A parcel is at the destination when its pickup was scanned in there, or the last hop of its transfer chain was: that scan is the arrival.
    const kids = (id: string) => all.filter((t) => t.parentTaskId === id && t.kind === 'transfer');
    const arrival = (p: DeliveryTask): DeliveryTask | null => {
      if (p.toHubId === dest) return p.status === 'delivered' ? p : null;
      const stack = [p];
      while (stack.length) {
        const cur = stack.pop() as DeliveryTask;
        for (const k of kids(cur.id)) {
          if (k.toHubId === dest && k.status === 'delivered') return k;
          stack.push(k);
        }
      }
      return null;
    };

    const customer = all.filter((t) => isCustomerKind(t.kind));
    // Goods a "return to seller" sent back are not waiting for the customer any more.
    const sentBack = new Set<string>();
    for (const t of customer) {
      if (t.status !== 'failed' || t.failureReason !== RETURN_TO_SELLER_REASON) continue;
      for (const k of t.sellerIds ?? [...pickups.keys()]) sentBack.add(LogisticsService.keyOf(k));
    }
    const groups = await this.groupBySeller(order);
    const pending = [...groups.keys()].filter((k) => pickups.has(k) && !sentBack.has(k) && groups.get(k)!.some((l) => !l.deliveredAt));
    const arrived = pending.filter((k) => arrival(pickups.get(k) as DeliveryTask));
    const open = customer.find((t) => isOpen(t.status)) ?? null;
    const everyLineSettled = [...groups.values()].every((ls) => ls.every((l) => !!l.deliveredAt)) && [...groups.values()].some((ls) => ls.length);
    const finished = !open && !pending.length && everyLineSettled;

    if (open) {
      let merged: DeliveryTask | null = null;
      if (open.sellerIds && ['unassigned', 'assigned'].includes(open.status) && !open.runId) {
        const have = new Set(open.sellerIds.map((k) => LogisticsService.keyOf(k)));
        const add = arrived.filter((k) => !have.has(k));
        if (add.length) {
          const keys = [...have, ...add];
          const cargo = LogisticsService.undelivered(groups, keys);
          const frNames = await frenchLineNames(m, cargo.map((i) => i.id));
          await m.update(DeliveryTask, { id: open.id }, { sellerIds: keys.map((k) => (k === NO_SELLER ? null : k)), itemsJson: JSON.stringify(cargo.map((i) => LogisticsService.cargoLine(i, frNames.get(i.id)?.nameFr ?? i.productNameFr))) });
          merged = (await m.findOne(DeliveryTask, { where: { id: open.id } }))!;
        }
      }
      const cod = await this.recomputeOpenCod(m, order, groups, merged ?? open, all);
      return { ...none, shipped, merged, cod };
    }
    if (!arrived.length) return { ...none, shipped, finished };

    const complete = arrived.length === pending.length;
    if (!complete && !opts.retryOf) {
      // Not everything is here: wait, unless the oldest waiting parcel has waited past the limit.
      const oldest = Math.min(...arrived.map((k) => (arrival(pickups.get(k) as DeliveryTask)?.receivedAt ?? opts.now).getTime()));
      if (!(opts.splitHours > 0) || oldest > opts.now.getTime() - opts.splitHours * 3_600_000) return { ...none, shipped };
    }
    const cargo = LogisticsService.undelivered(groups, arrived);
    const frNames = await frenchLineNames(m, cargo.map((i) => i.id));
    const leg: Pick<DeliveryTask, 'id' | 'sellerIds'> = { id: '', sellerIds: arrived.map((k) => (k === NO_SELLER ? null : k)) };
    // An express attempt that failed after the rider collected the parcel came back to the warehouse as a pickup: it was an attempt at the
    // customer, so the delivery that follows is the next one (and the order is not given a fresh set of tries).
    // (`attempts` of that express leg already counts the tries before it: a leg re-opened before collection carries them.)
    const expressTries = Math.max(0, ...all.filter((t) => t.kind === 'express' && t.status === 'failed' && all.some((k) => k.kind === 'pickup' && k.parentTaskId === t.id)).map((t) => t.attempts));
    const created = await this.make(
      {
        kind: 'delivery',
        attempts: 1 + expressTries,
        orderId: order.id,
        orderReference: order.reference,
        fromHubId: dest,
        hubId: dest,
        address: order.shippingAddress,
        sellerIds: leg.sellerIds,
        codAmountUsd: await this.codShare(m, order, leg, all, cargo, complete),
        itemsJson: JSON.stringify(cargo.map((i) => LogisticsService.cargoLine(i, frNames.get(i.id)?.nameFr ?? i.productNameFr))),
        pickupAddress: await this.hubAddressText(dest),
        // A retry keeps the proof code and counts as the next attempt; a new leg gets a new code (the first leg's rider has heard the old one).
        ...(opts.retryOf ? { attempts: opts.retryOf.attempts + 1, proofCode: (await this.proofCodeOf(opts.retryOf.id)) ?? undefined, readyAt: opts.retryOf.readyAt, receivedAt: opts.retryOf.receivedAt } : {}),
      },
      m,
    );
    return { ...none, created, shipped };
  }

  /** Re-work the open customer leg's cash from the current lines and payment (shares are recomputed on create, merge, re-plan and part-cancel). Returns the leg when its figure changed. */
  private async recomputeOpenCod(m: EntityManager, order: Order, groups: Map<string, OrderItem[]>, leg: DeliveryTask, all: DeliveryTask[]): Promise<DeliveryTask | null> {
    if (!isOpen(leg.status)) return null;
    const keys = leg.sellerIds ? leg.sellerIds.map((k) => LogisticsService.keyOf(k)) : [...groups.keys()];
    const cargo = LogisticsService.undelivered(groups, keys);
    const completes = await this.completesFor(leg, order);
    const due = await this.codShare(m, order, leg, all, cargo, completes);
    // An express leg exists while its seller can still cancel lines: what it carries follows the live lines.
    let itemsJson: string | null = null;
    if (leg.kind === 'express') {
      const frNames = await frenchLineNames(m, cargo.map((i) => i.id));
      const json = JSON.stringify(cargo.map((i) => LogisticsService.cargoLine(i, frNames.get(i.id)?.nameFr ?? i.productNameFr)));
      if (json !== leg.itemsJson) itemsJson = json;
    }
    if (Math.abs(due - leg.codAmountUsd) < 0.005 && !itemsJson) return null;
    await m.update(DeliveryTask, { id: leg.id }, { codAmountUsd: due, ...(itemsJson ? { itemsJson } : {}) });
    return (await m.findOne(DeliveryTask, { where: { id: leg.id } })) ?? null;
  }

  /** Recompute what the open customer leg of an order collects (after a part-cancel lowered the payment, say) and tell the rider. */
  async recomputeCod(orderId: string): Promise<void> {
    const changed = await withOrderLock(this.tasks.manager, orderId, async (m) => {
      const order = await m.findOne(Order, { where: { id: orderId } });
      if (!order) return null;
      const all = await m.find(DeliveryTask, { where: { orderId, disputeId: IsNull(), replacementId: IsNull(), exchangeId: IsNull() }, order: { createdAt: 'ASC' } });
      const open = all.find((t) => isCustomerKind(t.kind) && isOpen(t.status));
      return open ? this.recomputeOpenCod(m, order, await this.groupBySeller(order), open, all) : null;
    });
    if (changed) await this.emitTask(changed);
  }

  /**
   * A pickup was voided / finished, or a leg ended: plan what comes next for the customer. For an order's own journey this takes the
   * order's turn ({@link withOrderLock}) and creates / merges the open customer leg ({@link planCustomerLeg}); what has to be announced
   * is announced after the commit. A replacement or an exchange has its own single delivery leg once its parcel is at the destination.
   */
  private async progressChain(anchor: { orderId: string; replacementId?: string | null; exchangeId?: string | null }, opts: { now?: Date; retryOf?: DeliveryTask | null } = {}): Promise<DeliveryTask[]> {
    if (anchor.replacementId || anchor.exchangeId) return this.progressSide(anchor);
    const splitHours = await this.routing.splitAfterHours();
    const out = await withOrderLock(this.tasks.manager, anchor.orderId, (m) => this.planCustomerLeg(m, anchor.orderId, { now: opts.now ?? new Date(), splitHours, retryOf: opts.retryOf }));
    // "Every parcel is at a warehouse" moves the order to shipped when the parcels arrive; planning a failed leg again must not push an order
    // that went back to `confirmed` forward (the re-opened leg does that when its rider picks it up).
    if (out.shipped && !opts.retryOf) await this.advanceOrder(anchor.orderId, 'shipped', { notice: 'warehouse' });
    if (out.merged) await this.afterMerge(out.merged);
    else if (out.cod) await this.emitTask(out.cod);
    if (out.created) await this.announce(out.created);
    if (out.finished) await this.finishOrder(anchor.orderId);
    return out.created ? [out.created] : [];
  }

  /** The replacement / exchange side: its one `replacement_delivery` leg is created once the replacement parcel is at the destination. */
  private async progressSide(anchor: { orderId: string; replacementId?: string | null; exchangeId?: string | null }): Promise<DeliveryTask[]> {
    const where = anchor.replacementId ? { replacementId: anchor.replacementId } : { exchangeId: anchor.exchangeId as string };
    const all = await this.tasks.find({ where, order: { createdAt: 'ASC' } });
    const latest = new Map<string, DeliveryTask>();
    for (const t of all.filter((x) => x.kind === 'pickup')) {
      const k = LogisticsService.keyOf(t.sellerId);
      const cur = latest.get(k);
      if (!cur || t.attempts >= cur.attempts) latest.set(k, t);
    }
    const pickups = [...latest.values()].filter((p) => !(p.status === 'failed' && !p.parentTaskId && /cancel/i.test(p.failureReason ?? '')));
    if (!pickups.length) return [];
    const order = await this.orders.findOne({ where: { id: anchor.orderId } });
    if (!order) return [];
    const firstTransfer = all.find((t) => t.kind === 'transfer');
    const dest = firstTransfer?.finalHubId ?? firstTransfer?.toHubId ?? pickups[0].toHubId;
    if (!dest) return [];
    const kids = (id: string) => all.filter((t) => t.parentTaskId === id && t.kind === 'transfer');
    const reachedDest = (p: DeliveryTask): boolean => {
      if (p.toHubId === dest) return p.status === 'delivered';
      const stack = [p];
      while (stack.length) {
        const cur = stack.pop() as DeliveryTask;
        for (const k of kids(cur.id)) {
          if (k.toHubId === dest && k.status === 'delivered') return true;
          stack.push(k);
        }
      }
      return false;
    };
    if (!pickups.every(reachedDest)) return [];
    if (all.some((t) => t.kind === 'replacement_delivery')) return [];
    const last = await this.make({
      kind: 'replacement_delivery',
      orderId: order.id,
      orderReference: order.reference,
      fromHubId: dest,
      hubId: dest,
      address: order.shippingAddress,
      replacementId: anchor.replacementId ?? null,
      exchangeId: anchor.exchangeId ?? null,
      itemsJson: pickups[0].itemsJson,
      pickupAddress: await this.hubAddressText(dest),
    });
    await this.announce(last);
    return [last];
  }

  /** Plan the order's next customer leg now (a leg ended or was given up): the same locked planning a scan-in runs. Returns the legs it created. */
  planNext(orderId: string): Promise<DeliveryTask[]> {
    return this.progressChain({ orderId });
  }

  /** The order's live lines by seller key (`_none` for lines no seller owns). */
  linesBySellerKey(order: Order): Promise<Map<string, OrderItem[]>> {
    return this.groupBySeller(order);
  }

  /** Parcels were merged into a leg that is still at the warehouse: the feeds update and its rider is told ("Task updated"). */
  private async afterMerge(task: DeliveryTask): Promise<void> {
    await this.emitTask(task);
    if (task.riderId) {
      await this.notifications
        .toUser(task.riderId, { title: 'Task updated', body: `${task.orderReference}: ${kindLabel(task.kind)} now carries more parcels.`, type: 'task', entityId: task.id, extra: { orderId: task.orderId, view: 'active', kind: task.kind } })
        .catch(() => undefined);
    }
  }

  /**
   * Every line of the order has now reached the customer or was cancelled (a seller or a failed attempt took the last waiting parcel
   * out): the order is delivered and its cash is settled. Idempotent.
   */
  private async finishOrder(orderId: string): Promise<void> {
    await this.advanceOrder(orderId, 'delivered', { notice: 'update' });
    try {
      await this.completion?.(orderId);
    } catch (e) {
      this.logger.warn(`settling ${orderId} failed: ${(e as Error).message}`);
    }
  }

  private completion: ((orderId: string) => Promise<void>) | null = null;
  /** DeliveryService settles the cash when an order completes without a rider finishing it (the last waiting parcel was cancelled). */
  registerCompletionHandler(fn: (orderId: string) => Promise<void>): void {
    this.completion = fn;
  }

  /**
   * The sweeper's step: for every order whose parcels are at the destination warehouse with no customer leg open, run the same
   * locked planning as a scan-in. It starts a partial leg once the oldest waiting parcel is older than `splitDeliveryAfterHours`,
   * and also plans an order whose parcels all arrived but whose leg was never created (a scan-in that failed half way). Idempotent.
   * Returns how many customer legs it created.
   */
  async planWaiting(now: Date = new Date()): Promise<number> {
    const rows = await this.tasks
      .createQueryBuilder('t')
      .innerJoin(Order, 'o', 'o.id = t.orderId')
      .select('t.orderId', 'orderId')
      .addSelect('MIN(t.receivedAt)', 'since')
      .where("t.status = 'delivered' AND t.kind IN ('pickup','transfer') AND t.disputeId IS NULL AND t.replacementId IS NULL AND t.exchangeId IS NULL")
      .andWhere('t.toHubId = o.destinationHubId')
      .andWhere("o.status NOT IN ('cancelled','returned','delivered')")
      .andWhere(`NOT EXISTS (SELECT 1 FROM delivery_tasks c WHERE c.orderId = t.orderId AND c.kind IN (${CUSTOMER_KINDS.map((k) => `'${k}'`).join(',')}) AND c.status IN ('unassigned','assigned','picked_up','in_transit'))`)
      .andWhere("EXISTS (SELECT 1 FROM order_items i WHERE i.orderId = t.orderId AND i.fulfilment <> 'cancelled' AND i.deliveredAt IS NULL)")
      .groupBy('t.orderId')
      .orderBy('since', 'ASC')
      .limit(200)
      .getRawMany<{ orderId: string }>();
    let created = 0;
    for (const r of rows) {
      try {
        created += (await this.progressChain({ orderId: r.orderId }, { now })).length;
      } catch (e) {
        this.logger.warn(`planning ${r.orderId} failed: ${(e as Error).message}`);
      }
    }
    return created;
  }

  /**
   * Scanning is warehouse work: a desk admin (any warehouse) or warehouse staff of THAT warehouse. The gateways already build
   * the actor that way; this is the same rule where the work is done, so no other caller (and no other admin role) can scan.
   * A call with no actor is the system itself (seed, demo, jobs).
   */
  private assertMayScan(actor: Actor | null, hubId: string): void {
    if (!actor) return;
    if (!tierAllows(actor.role, actor.tier, 'scan')) throw new BadRequestException(DESK_ADMINS_ONLY);
    if (!isDeskAdmin(actor.role) && actor.hubId !== hubId) throw new BadRequestException('This parcel is not due at your warehouse.');
  }

  /**
   * Staff of `hubId` scanned a parcel in. A hub-bound leg is finished ("delivered" = at the warehouse) and the next
   * leg is created when it is due: pickup scanned at the origin -> a transfer to the destination (when they differ);
   * the delivery leg once EVERY parcel of the order is at the destination; return legs run back the other way.
   */
  async onScanIn(taskId: string, hubId: string, actor: Actor | null = null): Promise<{ task: DeliveryTask; next: DeliveryTask[] }> {
    this.assertMayScan(actor, hubId);
    const task = await this.tasks.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Delivery task not found.');
    if (!isHubBound(task.kind)) throw new BadRequestException('This task is finished by the rider, not scanned in.');
    if (task.toHubId !== hubId) throw new BadRequestException('This parcel is not due at your warehouse.');
    if (task.status === 'delivered') throw new BadRequestException('This parcel was already scanned in.');
    if (task.status === 'failed') throw new BadRequestException('A failed task cannot be scanned in.');
    // A parcel can only arrive after a rider collected it.
    if (!COLLECTED_STATUSES.includes(task.status)) throw new BadRequestException('A rider must collect this parcel before it can be scanned in.');
    const now = new Date();
    const claim = await this.tasks
      .createQueryBuilder()
      .update(DeliveryTask)
      .set({ status: 'delivered', receivedAt: now, deliveredAt: now })
      .where("id = :id AND status IN ('picked_up','in_transit')", { id: task.id })
      .execute();
    if (!claim.affected) throw new BadRequestException('This delivery was just updated. Refresh and try again.');
    const saved = (await this.tasks.findOne({ where: { id: task.id } }))!;
    this.audit(actor, 'parcel.received', saved);

    const next: DeliveryTask[] = [];
    try {
      const orderFlowPickup = saved.kind === 'pickup' && isOrderFlow(saved);
      if (orderFlowPickup) await this.markPackageReceived(saved, now);
      switch (saved.kind) {
        case 'pickup':
        case 'transfer': {
          const order = await this.orders.findOne({ where: { id: saved.orderId } });
          const live = order && !(isOrderFlow(saved) && ['cancelled', 'returned', 'delivered'].includes(order.status));
          // Where the chain ends: the order's destination (a transfer carries it as `finalHubId`).
          const dest = saved.kind === 'transfer' ? (saved.finalHubId ?? saved.toHubId) : ((isOrderFlow(saved) ? order?.destinationHubId : null) ?? (await this.chainDestination(saved)));
          if (dest && saved.toHubId !== dest && live) {
            // Not there yet: the next hop starts from this warehouse (the route is re-planned now, over today's lanes).
            const t = await this.makeHop(saved, 'transfer', saved.toHubId as string, dest);
            next.push(t);
            await this.recordRoute(saved, t);
          }
          next.push(...(await this.progressChain({ orderId: saved.orderId, replacementId: saved.replacementId, exchangeId: saved.exchangeId })));
          break;
        }
        case 'return_pickup':
          next.push(...(await this.returnLegsAfterPickup(saved)));
          break;
        case 'return_transfer': {
          const final = saved.finalHubId ?? saved.toHubId;
          if (final && saved.toHubId !== final) {
            next.push(await this.makeHop(saved, 'return_transfer', saved.toHubId as string, final));
            break;
          }
          const t = await this.make({
            kind: 'return_to_seller',
            orderId: saved.orderId,
            orderReference: saved.orderReference,
            fromHubId: saved.toHubId,
            hubId: saved.toHubId,
            sellerId: saved.sellerId,
            parentTaskId: saved.id,
            disputeId: saved.disputeId,
            itemsJson: saved.itemsJson,
            pickupAddress: await this.hubAddressText(saved.toHubId),
            address: (await this.sellerRow(saved.sellerId))?.pickupAddress ?? null,
          });
          next.push(t);
          await this.announce(t);
          break;
        }
        default:
          break;
      }
    } catch (e) {
      // The scan itself stands; a leg that could not be created is logged and shown to admins.
      this.logger.error(`next leg after ${saved.id} failed: ${(e as Error).message}`);
      await this.notifications
        .toAdmins({ title: 'Task needs attention', body: `${saved.orderReference}: ${kindLabel(saved.kind)} was scanned in but the next leg could not be created.`, type: 'task', entityId: saved.id }, 'logisticsDesk')
        .catch(() => undefined);
    }

    await this.emitTask(saved);
    await this.tellSellerArrived(saved);
    await this.fire('scanned_in', saved);
    return { task: saved, next };
  }

  /** Where a replacement / exchange chain must end: the order's destination warehouse. */
  private async chainDestination(task: DeliveryTask): Promise<string | null> {
    const order = await this.orders.findOne({ where: { id: task.orderId } });
    return order?.destinationHubId ?? null;
  }

  /**
   * Keep the order's planned chain for the seller up to date with what really happened: the warehouses already passed,
   * then the (possibly re-planned) rest. Only an order's own journey records it.
   */
  private async recordRoute(arrived: DeliveryTask, hop: DeliveryTask): Promise<void> {
    if (!isOrderFlow(arrived) || !arrived.sellerId || !hop.finalHubId) return;
    try {
      const order = await this.orders.findOne({ where: { id: arrived.orderId } });
      if (!order) return;
      const plan = await this.lanes.route(hop.fromHubId as string, hop.finalHubId);
      const rest = hubsOnRoute(plan.hops, hop.fromHubId as string);
      const planned = order.routeBySeller?.[arrived.sellerId] ?? [];
      const at = planned.indexOf(hop.fromHubId as string);
      const passed = at >= 0 ? planned.slice(0, at) : arrived.kind === 'transfer' && arrived.fromHubId ? [arrived.fromHubId] : [];
      await this.orders.update({ id: order.id }, { routeBySeller: { ...(order.routeBySeller ?? {}), [arrived.sellerId]: [...passed, ...rest] } });
    } catch {
      /* the route record is informative; the hop itself is what matters */
    }
  }

  /** The seller's lines on the order are now at the warehouse. */
  private async markPackageReceived(task: DeliveryTask, at: Date): Promise<void> {
    const order = await this.orders.findOne({ where: { id: task.orderId } });
    if (!order) return;
    const groups = await this.groupBySeller(order);
    const lines = groups.get(task.sellerId ?? NO_SELLER) ?? [];
    const ids = lines.filter((i) => i.fulfilment === 'open' || i.fulfilment === 'ready').map((i) => i.id);
    if (ids.length) await this.items.update({ id: In(ids) }, { fulfilment: 'received', receivedAt: at });
  }

  private async tellSellerArrived(task: DeliveryTask): Promise<void> {
    if (task.kind !== 'pickup' || !task.sellerId) return;
    try {
      const user = await this.sellerUser(task.sellerId);
      if (user) await this.notifications.toUser(user, { title: 'Package at the warehouse', body: `${task.orderReference}: your package reached the warehouse.`, type: 'delivery', entityId: task.orderId });
    } catch {
      /* best effort */
    }
  }

  // ── returns ──────────────────────────────────────────────────────────────────
  /** The returned lines of an order, resolved from ids; no ids = every live line. */
  private resolveReturnItems(order: Order, items?: ReturnItemInput[]): (CargoLine & { orderItemId: string; productId: string; sellerId: string | null })[] {
    const live = (order.items ?? []).filter((i) => i.fulfilment !== 'cancelled');
    const want: ReturnItemInput[] = items?.length ? items : live.map((i) => ({ orderItemId: i.id, qty: i.qty }));
    const out: (CargoLine & { orderItemId: string; productId: string; sellerId: string | null })[] = [];
    for (const w of want) {
      const line = live.find((i) => (w.orderItemId && i.id === w.orderItemId) || (!w.orderItemId && w.productId && i.productId === w.productId));
      if (!line) throw new BadRequestException('One of the returned items is not on this order.');
      const qty = Math.min(line.qty, Math.max(1, Math.floor(Number(w.qty ?? line.qty))));
      out.push({ ...LogisticsService.cargoLine(line, line.productNameFr), orderItemId: line.id, productId: line.productId, qty, sellerId: line.sellerId ?? null });
    }
    return out;
  }

  /**
   * A return was approved: a rider of the destination warehouse collects the goods from the customer and brings them
   * to the warehouse (leg 1 of 3 back). Scanning them in creates the way back to each seller.
   */
  async createReturnPickup(input: { disputeId: string; orderId: string; items?: ReturnItemInput[] }): Promise<DeliveryTask> {
    const order = await this.orders.findOne({ where: { id: input.orderId } });
    if (!order) throw new NotFoundException('Order not found.');
    const dest = order.destinationHubId ?? (await this.tasks.findOne({ where: { orderId: order.id, kind: In([...CUSTOMER_KINDS]) }, order: { createdAt: 'DESC' } }))?.hubId ?? null;
    if (!dest) throw new BadRequestException('This order has no destination warehouse.');
    const existing = await this.tasks.findOne({ where: { disputeId: input.disputeId, kind: 'return_pickup', status: Not('failed') } });
    if (existing) return existing;
    const lines = this.resolveReturnItems(order, input.items);
    const task = await this.make({
      kind: 'return_pickup',
      orderId: order.id,
      orderReference: order.reference,
      toHubId: dest,
      hubId: dest,
      disputeId: input.disputeId,
      address: order.shippingAddress,
      pickupAddress: order.shippingAddress,
      itemsJson: JSON.stringify(lines),
    });
    await this.announce(task);
    return task;
  }

  /** Goods are at the destination warehouse: send each seller's share back (via their origin warehouse when it differs). */
  private async returnLegsAfterPickup(pickup: DeliveryTask): Promise<DeliveryTask[]> {
    const order = await this.orders.findOne({ where: { id: pickup.orderId } });
    const dest = pickup.toHubId as string;
    let lines: { sellerId: string | null; [k: string]: unknown }[] = [];
    try {
      lines = pickup.itemsJson ? JSON.parse(pickup.itemsJson) : [];
    } catch {
      lines = [];
    }
    const hubs = await this.routing.hubsWithRiders();
    const destination = hubs.find((h) => h.id === dest);
    if (!destination || !order) return [];
    const bySeller = new Map<string, typeof lines>();
    for (const l of lines) {
      let key = l.sellerId;
      if (!key && typeof l.productId === 'string' && !l.productId.startsWith('ext:')) key = (await this.products.findOne({ where: { id: l.productId }, select: ['id', 'sellerId'] }))?.sellerId ?? null;
      bySeller.set(key ?? NO_SELLER, [...(bySeller.get(key ?? NO_SELLER) ?? []), { ...l, sellerId: key ?? null }]);
    }
    const out: DeliveryTask[] = [];
    for (const [key, part] of bySeller) {
      const seller = key === NO_SELLER ? null : await this.sellerRow(key);
      const origin = await this.routing.originFor(seller, destination, hubs, order.originBySeller?.[key]);
      const common = {
        orderId: order.id,
        orderReference: order.reference,
        sellerId: key === NO_SELLER ? null : key,
        parentTaskId: pickup.id,
        disputeId: pickup.disputeId,
        itemsJson: JSON.stringify(part),
      };
      let t: DeliveryTask;
      if (origin.id === dest) {
        t = await this.make({ ...common, kind: 'return_to_seller', fromHubId: dest, hubId: dest, pickupAddress: await this.hubAddressText(dest), address: seller?.pickupAddress ?? null });
        await this.announce(t);
      } else {
        // The way back follows the order's route in reverse when its lanes still exist, else the shortest chain today.
        const recorded = order.routeBySeller?.[key];
        const reversed = recorded && recorded.length > 1 ? await this.lanes.reverse(recorded) : null;
        t = await this.makeHop(pickup, 'return_transfer', dest, origin.id, { itemsJson: common.itemsJson, sellerId: common.sellerId }, reversed);
      }
      out.push(t);
    }
    return out;
  }

  // ── replacements / exchanges ─────────────────────────────────────────────────
  /**
   * A replacement or exchange was approved: bring the new unit from the seller to the customer through the same
   * legs (pickup -> transfer -> `replacement_delivery`). The rider of the last leg also collects the old unit. Returns
   * the FIRST leg; every leg carries the `replacementId` / `exchangeId`, and the last one has kind `replacement_delivery`.
   */
  async createReplacementDelivery(input: { replacementId?: string; exchangeId?: string; orderId: string }): Promise<DeliveryTask> {
    if (!input.replacementId && !input.exchangeId) throw new BadRequestException('A replacement or an exchange is required.');
    const order = await this.orders.findOne({ where: { id: input.orderId } });
    if (!order) throw new NotFoundException('Order not found.');
    const em = this.tasks.manager;
    const rep = input.replacementId ? await em.findOne(Replacement, { where: { id: input.replacementId } }) : null;
    const exc = !rep && input.exchangeId ? await em.findOne(Exchange, { where: { id: input.exchangeId } }) : null;
    const subject = rep ?? exc;
    if (!subject) throw new NotFoundException('Replacement not found.');
    const key = rep ? { replacementId: rep.id } : { exchangeId: (exc as Exchange).id };
    const existing = await this.tasks.findOne({ where: { ...key, kind: 'pickup' }, order: { createdAt: 'ASC' } });
    if (existing) return existing;

    const dest = order.destinationHubId ?? (await this.tasks.findOne({ where: { orderId: order.id, kind: In([...CUSTOMER_KINDS]) }, order: { createdAt: 'DESC' } }))?.hubId ?? null;
    if (!dest) throw new BadRequestException('This order has no destination warehouse.');
    const hubs = await this.routing.hubsWithRiders();
    const destination = hubs.find((h) => h.id === dest);
    if (!destination) throw new BadRequestException('This order has no destination warehouse.');
    const seller = await this.sellerRow(subject.sellerId);
    const origin = await this.routing.originFor(seller, destination, hubs, order.originBySeller?.[subject.sellerId ?? '']);
    const qty = subject.qty ?? 1;
    const name = rep ? rep.productName : (exc as Exchange).toName;
    const nameFr = await this.replacementNameFr(order, rep, exc);
    const task = await this.make({
      kind: 'pickup',
      orderId: order.id,
      orderReference: order.reference,
      toHubId: origin.id,
      hubId: origin.id,
      sellerId: subject.sellerId ?? null,
      ...key,
      pickupAddress: seller ? `${seller.name} — ${seller.pickupAddress || 'address not provided, contact the seller'}` : await this.hubAddressText(origin.id),
      address: await this.hubAddressText(origin.id),
      itemsJson: JSON.stringify([{ name, ...(nameFr ? { nameFr } : {}), qty, variant: rep ? rep.variant : (exc as Exchange).toVariant }]),
    });
    await this.announce(task);
    return task;
  }

  /** The French name of what a replacement (the order's own line again) or an exchange (another product) sends. */
  private async replacementNameFr(order: Order, rep: Replacement | null, exc: Exchange | null): Promise<string | null> {
    if (rep) return order.items?.find((i) => i.productName === rep.productName)?.productNameFr?.trim() || null;
    if (!exc || !this.translations) return null;
    try {
      const product = await this.products.findOne({ where: { sku: exc.toSku, ...(exc.sellerId ? { sellerId: exc.sellerId } : {}) } });
      if (!product) return null;
      return (await this.translations.present('product', [product])).get(product.id)?.texts.nameFr?.trim() || null;
    } catch {
      return null; // decoration: a leg is never held up by a translation
    }
  }

  // ── assigning, scanning out, rider progress ──────────────────────────────────
  /** May `actor` manage (see / assign) this task's warehouse? */
  private actorManages(actor: Actor, task: DeliveryTask): boolean {
    if (isDeskAdmin(actor.role)) return true;
    return !!actor.hubId && task.hubId === actor.hubId;
  }

  /**
   * Staff give a task to a rider of the right warehouse (supervisor tier or above; admins from anywhere). The rider
   * must be an active rider of the task's warehouse (a transfer may use the riders of either end).
   */
  async assign(taskId: string, riderId: string, actor: Actor): Promise<DeliveryTask> {
    if (!tierAllows(actor.role, actor.tier, 'assign')) throw new BadRequestException('Only supervisors and managers can assign riders.');
    const task = await this.tasks.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Delivery task not found.');
    if (!this.actorManages(actor, task)) throw new BadRequestException('This task belongs to another warehouse.');
    if (task.runId) throw new BadRequestException('This parcel is part of a transfer run. Manage it from the run.');
    const rider = await this.users.findOne({ where: { id: riderId } });
    if (!rider || rider.role !== 'rider' || !rider.active) throw new BadRequestException('Choose an active rider.');
    if (!riderFits(task, rider.hubId)) throw new BadRequestException('This rider works at another warehouse.');
    if (!['unassigned', 'assigned'].includes(task.status)) throw new BadRequestException('This delivery is no longer available.');
    return this.giveTo(task, rider, actor);
  }

  /** Give an open task to a rider (the checks are the caller's): claim it atomically, tell the old rider, audit, announce. */
  private async giveTo(task: DeliveryTask, rider: Pick<User, 'id' | 'name'>, actor: Actor, opts: { onlyUnassigned?: boolean } = {}): Promise<DeliveryTask> {
    // The system only fills an empty slot: a supervisor who assigned the leg while the sweep was working keeps their choice.
    const open = opts.onlyUnassigned ? "status = 'unassigned' AND runId IS NULL" : "status IN ('unassigned','assigned')";
    const claim = await this.tasks
      .createQueryBuilder()
      .update(DeliveryTask)
      .set({ riderId: rider.id, status: 'assigned' })
      .where(`id = :id AND ${open}`, { id: task.id })
      .execute();
    if (!claim.affected) throw new BadRequestException('This delivery is no longer available.');
    const saved = (await this.tasks.findOne({ where: { id: task.id } }))!;
    // The rider who had it before is told it left their list (a minimal payload: nothing about the new rider).
    if (task.riderId && task.riderId !== rider.id) {
      const gone = { id: saved.id, orderId: saved.orderId, orderReference: saved.orderReference, kind: saved.kind, status: 'unassigned', removed: true, reason: 'reassigned' };
      for (const ev of ['task:updated', 'delivery:updated']) this.emitter.toUser(task.riderId, ev, gone);
    }
    this.audit(actor, 'task.assigned', saved, `${saved.orderReference} ${saved.kind} -> ${rider.name}`);
    await this.afterAssigned(saved, rider);
    return saved;
  }

  // ── auto-assignment ──────────────────────────────────────────────────────────
  /** Who the system acts as when it assigns (audit trail). */
  static readonly AUTO_ACTOR: Actor = { id: 'system:auto-assign', role: 'system', name: 'Auto-assignment', hubId: null, tier: null };

  /**
   * Riders of a warehouse that can take work, with what they carry now: active riders of THAT warehouse (riders have no on-duty
   * switch and never accept or refuse; a rider who is switched off is not offered work). Sorted into {@link Candidate}s.
   */
  private async candidatesFor(task: DeliveryTask): Promise<Candidate[]> {
    const riders = (await this.users.find({ where: { role: 'rider', active: true, hubId: task.hubId as string } })).filter((r) => riderFits(task, r.hubId));
    if (!riders.length) return [];
    const ids = riders.map((r) => r.id);
    const open = await this.tasks.find({ where: { riderId: In(ids), status: In(['assigned', 'picked_up', 'in_transit']) }, select: ['id', 'riderId'] });
    const since = new Date(Date.now() - 86_400_000);
    const recent = await this.tasks.createQueryBuilder('t').select('t.riderId', 'riderId').addSelect('COUNT(*)', 'n').where('t.riderId IN (:...ids) AND t.createdAt >= :since', { ids, since }).groupBy('t.riderId').getRawMany<{ riderId: string; n: string }>();
    return riders.map((r) => ({ id: r.id, name: r.name, open: open.filter((t) => t.riderId === r.id).length, recent: Number(recent.find((x) => x.riderId === r.id)?.n ?? 0) }));
  }

  /**
   * The warehouse's auto-assignment (when it is switched on and open now): give an unassigned leg to the least busy active rider
   * of the warehouse. Returns the assigned task, or null when it did nothing (off, closed, not a kind it handles, in a transfer run,
   * already taken, nobody to give it to). Safe to call again and again (it only ever acts on an unassigned leg) and never throws.
   */
  async autoAssign(task: DeliveryTask, at: Date = new Date()): Promise<DeliveryTask | null> {
    try {
      if (!this.hubOps || !task.hubId || task.status !== 'unassigned' || task.runId || !AUTO_ASSIGN_KINDS.includes(task.kind)) return null;
      // An express parcel is still being packed until the seller marks it ready: a rider sent earlier would only wait at the door.
      if (task.kind === 'express' && !task.readyAt) return null;
      const ops = await this.hubOps.ops(task.hubId);
      if (!ops.autoAssign || !isWorkingNow(ops, at)) return null;
      const rider = pickLeastBusy(await this.candidatesFor(task));
      if (!rider) return null;
      return await this.giveTo(task, { id: rider.id, name: rider.name }, LogisticsService.AUTO_ACTOR, { onlyUnassigned: true });
    } catch (e) {
      // Someone else (or a second sweep) got there first, or the rider vanished: the leg stays in the queue for staff.
      this.logger.debug(`auto-assign ${task.id}: ${(e as Error).message}`);
      return null;
    }
  }

  /** Auto-assign the legs already waiting (made while the warehouse was closed or the switch was off). Returns how many were given out. */
  async autoAssignWaiting(at: Date = new Date()): Promise<number> {
    if (!this.hubOps) return 0;
    const saved = await this.hubOps.allSaved();
    let given = 0;
    for (const [hubId, ops] of saved) {
      if (!ops.autoAssign || !isWorkingNow(ops, at)) continue;
      const waiting = await this.tasks.find({ where: { hubId, status: 'unassigned', runId: IsNull(), kind: In([...AUTO_ASSIGN_KINDS]) }, order: { createdAt: 'ASC' }, take: 500 });
      for (const t of waiting) if ((t.kind !== 'express' || t.readyAt) && (await this.autoAssign(t, at))) given++;
    }
    return given;
  }

  // ── return to seller (aged parcels) ──────────────────────────────────────────
  /**
   * Send a parcel that nobody could deliver back to its seller(s): the stuck customer leg is closed ("Returned to seller") and a
   * `return_to_seller` leg is opened from this warehouse for each seller's share of the goods, for the warehouse to give a rider.
   * Supervisors and managers of the warehouse that manages the leg (admins any). Only a customer-bound leg that no rider has
   * collected yet can go back; doing it twice returns the same legs. The order itself is NOT cancelled or refunded here: the admins
   * are told to decide (money is never touched by the warehouse desk).
   */
  async returnToSeller(taskId: string, actor: Actor): Promise<{ closed: DeliveryTask; legs: DeliveryTask[] }> {
    if (actor.role.startsWith('admin') && !RETURN_TO_SELLER_ADMINS.includes(actor.role)) throw new BadRequestException('Only the super admin and the operations admin can return a parcel to its seller.');
    if (!tierAllows(actor.role, actor.tier, 'oversee')) throw new BadRequestException('Only supervisors and managers can return a parcel to its seller.');
    const task = await this.tasks.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Delivery task not found.');
    if (!this.actorManages(actor, task)) throw new BadRequestException('This task belongs to another warehouse.');
    // An express parcel never sat at a warehouse: it is still with the seller (or in the rider's hands). Nothing to send back.
    if (task.kind === 'express') throw new BadRequestException(EXPRESS_NOT_RETURNABLE);
    const already = await this.tasks.find({ where: { parentTaskId: task.id, kind: 'return_to_seller' }, order: { createdAt: 'ASC' } });
    if (already.length) return { closed: task, legs: already };
    if (task.runId) throw new BadRequestException('This parcel is part of a transfer run. Manage it from the run.');
    if (!canReturnToSeller(task)) {
      throw new BadRequestException(
        isCustomerKind(task.kind) || task.kind === 'replacement_delivery' ? 'A rider already has this parcel, or it is closed. Only a parcel still at the warehouse can be returned.' : 'Only the delivery to the customer can be returned to the seller.',
      );
    }
    if (!task.hubId) throw new BadRequestException('This parcel is not tied to a warehouse.');
    const order = await this.orders.findOne({ where: { id: task.orderId } });
    if (!order) throw new NotFoundException('Order not found.');
    // Who gets what, worked out BEFORE anything is closed so a problem leaves the parcel untouched.
    const groups = new Map<string, CargoLine[]>();
    // What goes back is what THIS leg carries: a split order's other parcels (still at their sellers, or already delivered) stay where they are.
    let lines: CargoLine[];
    if (task.kind === 'replacement_delivery') lines = LogisticsService.cargoOf(task);
    else {
      const byKey = await this.groupBySeller(order);
      const keys = task.sellerIds ? task.sellerIds.map((k) => LogisticsService.keyOf(k)) : [...byKey.keys()];
      lines = LogisticsService.undelivered(byKey, keys).map((i) => ({ ...LogisticsService.cargoLine(i, i.productNameFr), sellerId: i.sellerId ?? null }));
    }
    for (const l of lines) {
      let key = l.sellerId ?? null;
      if (!key && typeof l.productId === 'string' && !l.productId.startsWith('ext:')) key = (await this.products.findOne({ where: { id: l.productId }, select: ['id', 'sellerId'] }))?.sellerId ?? null;
      groups.set(key ?? NO_SELLER, [...(groups.get(key ?? NO_SELLER) ?? []), { ...l, sellerId: key }]);
    }
    if (!groups.size) groups.set(NO_SELLER, []);

    const claim = await this.tasks
      .createQueryBuilder()
      .update(DeliveryTask)
      .set({ status: 'failed', failureReason: RETURN_TO_SELLER_REASON })
      .where("id = :id AND status IN ('unassigned','assigned') AND runId IS NULL", { id: task.id })
      .execute();
    if (!claim.affected) throw new BadRequestException('This parcel was just updated. Refresh and try again.');
    const closed = (await this.tasks.findOne({ where: { id: task.id } }))!;
    if (task.riderId) {
      const gone = { id: closed.id, orderId: closed.orderId, orderReference: closed.orderReference, kind: closed.kind, status: 'unassigned', removed: true, reason: 'reassigned' };
      for (const ev of ['task:updated', 'delivery:updated']) this.emitter.toUser(task.riderId, ev, gone);
    }
    const hubAddress = await this.hubAddressText(task.hubId);
    const legs: DeliveryTask[] = [];
    for (const [key, part] of groups) {
      const seller = key === NO_SELLER ? null : await this.sellerRow(key);
      const leg = await this.make({
        kind: 'return_to_seller',
        orderId: order.id,
        orderReference: order.reference,
        sellerId: key === NO_SELLER ? null : key,
        parentTaskId: task.id,
        fromHubId: task.hubId,
        hubId: task.hubId,
        pickupAddress: hubAddress,
        address: seller?.pickupAddress ?? null,
        itemsJson: JSON.stringify(part),
      });
      legs.push(leg);
    }
    this.audit(actor, 'parcel.returned_to_seller', closed, `${closed.orderReference} ${closed.kind} -> ${legs.length} return leg${legs.length === 1 ? '' : 's'}`);
    await this.emitTask(closed);
    await this.fire('voided', closed);
    for (const leg of legs) await this.announce(leg);
    await this.notifications
      .toAdmins({ title: 'Parcel returned to seller', body: `${closed.orderReference}: the customer parcel is going back to the seller. Review the order.`, type: 'task', entityId: closed.id }, 'logisticsDesk')
      .catch(() => undefined);
    if (isCustomerKind(closed.kind)) {
      await this.notifications
        .toUser(order.customerId, { title: 'Order update', body: `${order.reference} could not be delivered and is going back to the seller. Our team will contact you about your order.`, type: 'order', entityId: order.id })
        .catch(() => undefined);
    }
    return { closed, legs };
  }

  /**
   * A customer leg that nobody could deliver was given up (its lines were cancelled and refunded): the goods are at the warehouse, so
   * a `return_to_seller` leg per seller carries them back, for the warehouse to give a rider. The failed leg stays as it is.
   */
  async returnCargoToSellers(failed: DeliveryTask, lines: OrderItem[]): Promise<DeliveryTask[]> {
    if (!failed.hubId || !lines.length) return [];
    const order = await this.orders.findOne({ where: { id: failed.orderId } });
    if (!order) return [];
    const bySeller = new Map<string, OrderItem[]>();
    for (const i of lines) {
      let key = i.sellerId ?? null;
      if (!key && !i.productId.startsWith('ext:')) key = (await this.products.findOne({ where: { id: i.productId }, select: ['id', 'sellerId'] }))?.sellerId ?? null;
      bySeller.set(LogisticsService.keyOf(key), [...(bySeller.get(LogisticsService.keyOf(key)) ?? []), i]);
    }
    const hubAddress = await this.hubAddressText(failed.hubId);
    const frNames = await frenchLineNames(this.items.manager, lines.map((i) => i.id));
    const legs: DeliveryTask[] = [];
    for (const [key, part] of bySeller) {
      const seller = key === NO_SELLER ? null : await this.sellerRow(key);
      legs.push(
        await this.make({
          kind: 'return_to_seller',
          orderId: order.id,
          orderReference: order.reference,
          sellerId: key === NO_SELLER ? null : key,
          parentTaskId: failed.id,
          fromHubId: failed.hubId,
          hubId: failed.hubId,
          pickupAddress: hubAddress,
          address: seller?.pickupAddress ?? null,
          itemsJson: JSON.stringify(part.map((i) => ({ ...LogisticsService.cargoLine(i, frNames.get(i.id)?.nameFr ?? i.productNameFr), sellerId: key === NO_SELLER ? null : key }))),
        }),
      );
    }
    for (const leg of legs) await this.announce(leg);
    return legs;
  }

  private async afterAssigned(task: DeliveryTask, rider: Pick<User, 'id' | 'name'>): Promise<void> {
    const orderFlow = isOrderFlow(task);
    if (orderFlow && (task.kind === 'pickup' || task.kind === 'express')) await this.advanceOrder(task.orderId, 'processing');
    if (orderFlow && isCustomerKind(task.kind)) {
      const order = await this.orders.findOne({ where: { id: task.orderId } });
      if (order && !['cancelled', 'returned', 'delivered'].includes(order.status)) {
        await this.orders.update({ id: order.id }, { riderId: rider.id });
        const saved = (await this.orders.findOne({ where: { id: order.id } }))!;
        this.emitter.toUser(saved.customerId, 'order:updated', saved);
        pushOrderToOps(this.emitter, 'order:updated', saved);
        await this.notifications.toUser(saved.customerId, { title: 'Rider assigned', body: `${rider.name} is handling ${saved.reference}.`, type: 'delivery', entityId: saved.id });
      }
    }
    if ((task.kind === 'pickup' || task.kind === 'express') && task.sellerId) {
      const user = await this.sellerUser(task.sellerId);
      if (user) await this.notifications.toUser(user, { title: 'Pickup scheduled', body: `${task.orderReference}: a rider will collect your package.`, type: 'delivery', entityId: task.orderId }).catch(() => undefined);
    }
    await this.notifications
      .toUser(rider.id, {
        title: 'New task assigned to you',
        body: `${task.orderReference}: ${kindLabel(task.kind)} is now in your tasks.`,
        type: 'task',
        entityId: task.id,
        extra: { orderId: task.orderId, view: 'active', kind: task.kind },
      })
      .catch(() => undefined);
    await this.emitTask(task);
    await this.fire('assigned', task);
  }

  /** Staff hand the parcel to its rider at the warehouse ("scan out"): assigned -> picked_up. */
  async scanOut(taskId: string, hubId: string, actor: Actor | null = null): Promise<DeliveryTask> {
    this.assertMayScan(actor, hubId);
    const task = await this.tasks.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Delivery task not found.');
    if (!OUTBOUND_KINDS.includes(task.kind) || task.fromHubId !== hubId) throw new BadRequestException('This parcel does not leave from your warehouse.');
    if (task.runId) throw new BadRequestException('This parcel is part of a transfer run. Manage it from the run.');
    if (!canScanOutAt(task, hubId)) throw new BadRequestException('Assign a rider before handing the parcel over.');
    const claim = await this.tasks
      .createQueryBuilder()
      .update(DeliveryTask)
      .set({ status: 'picked_up', pickedUpAt: new Date() })
      .where("id = :id AND status = 'assigned'", { id: task.id })
      .execute();
    if (!claim.affected) throw new BadRequestException('This delivery was just updated. Refresh and try again.');
    const saved = (await this.tasks.findOne({ where: { id: task.id } }))!;
    this.audit(actor, 'parcel.dispatched', saved);
    await this.afterRiderStatus(saved, 'picked_up');
    return saved;
  }

  /**
   * A rider moved a task (picked up, on the way, delivered): the customer's order follows on the order's own legs, the
   * feeds update and listeners hear about it. Failures go through {@link reopen} instead.
   */
  async afterRiderStatus(task: DeliveryTask, status: DeliveryStatus): Promise<void> {
    let next = false;
    if (isOrderFlow(task)) {
      if (isCustomerKind(task.kind)) {
        // Only the leg that finishes the order moves the order's status; a partial leg tells the customer about its part instead.
        const completes = await this.completesOrder(task);
        if (status === 'delivered') await this.stampDelivered(task);
        if (completes) {
          if (status === 'picked_up') await this.advanceOrder(task.orderId, 'shipped', { notice: 'update' });
          if (status === 'in_transit') await this.advanceOrder(task.orderId, 'out_for_delivery', { notice: 'update' });
          if (status === 'delivered') await this.advanceOrder(task.orderId, 'delivered', { notice: 'update' });
        } else if (status === 'picked_up' || status === 'delivered') {
          await this.tellPartial(task, status);
        }
        next = status === 'delivered' && !completes;
      }
    }
    // Express: the rider holds the parcel now, so the seller can no longer cancel it (C5) and is told it left.
    if (task.kind === 'express' && status === 'picked_up' && isOrderFlow(task)) await this.onExpressCollected(task);
    await this.emitTask(task);
    if (status === 'picked_up' || status === 'in_transit' || status === 'delivered') await this.fire(status, task);
    // The leg ended: the parcels that waited for it are planned now (a leg that failed is planned again by `reopen`).
    if (next) await this.progressChain({ orderId: task.orderId }).catch((e) => this.logger.warn(`next leg of ${task.orderReference} failed: ${(e as Error).message}`));
  }

  /** An express rider collected the parcel from the seller: its lines are `received` (no more seller cancel) and the seller is told. */
  private async onExpressCollected(task: DeliveryTask): Promise<void> {
    try {
      await this.markPackageReceived(task, task.pickedUpAt ?? new Date());
      const user = await this.sellerUser(task.sellerId);
      if (user) {
        await this.notifications
          .toUser(user, { title: 'Package collected', body: `${task.orderReference}: the rider collected your package and is taking it to the customer.`, type: 'delivery', entityId: task.orderId })
          .catch(() => undefined);
      }
      const order = await this.orders.findOne({ where: { id: task.orderId } });
      if (user && order) this.emitter.toUser(user, 'order:updated', order);
    } catch (e) {
      this.logger.warn(`express pickup of ${task.orderReference}: ${(e as Error).message}`);
    }
  }

  /** The lines a delivered customer leg carried reached the customer: stamp them (`deliveredAt`, `deliveryTaskId`). Their fulfilment stays `received`. */
  private async stampDelivered(task: DeliveryTask): Promise<void> {
    const order = await this.orders.findOne({ where: { id: task.orderId } });
    if (!order) return;
    const groups = await this.groupBySeller(order);
    const keys = task.sellerIds ? task.sellerIds.map((k) => LogisticsService.keyOf(k)) : [...groups.keys()];
    const ids = LogisticsService.undelivered(groups, keys).map((i) => i.id);
    if (ids.length) await this.items.update({ id: In(ids) }, { deliveredAt: task.deliveredAt ?? new Date(), deliveryTaskId: task.id });
  }

  /** A partial leg is on its way / delivered: the customer is told which part (the order itself keeps its status). */
  private async tellPartial(task: DeliveryTask, status: 'picked_up' | 'delivered'): Promise<void> {
    const order = await this.orders.findOne({ where: { id: task.orderId } });
    if (!order) return;
    await this.notifications
      .toUser(order.customerId, {
        title: status === 'picked_up' ? 'Part of your order is on its way' : 'Part of your order was delivered',
        body: status === 'picked_up' ? `${order.reference}: part of your order is on its way. The rest will follow.` : `${order.reference}: part of your order was delivered. The rest will follow.`,
        type: 'delivery',
        entityId: order.id,
      })
      .catch(() => undefined);
  }

  /**
   * Move the customer's order forward (never back, never when cancelled / returned) and tell them. `notice` picks
   * the wording: a plain status update or the "parcel at our warehouse" message.
   */
  async advanceOrder(orderId: string, target: 'processing' | 'shipped' | 'out_for_delivery' | 'delivered', opts: { notice?: 'update' | 'warehouse' | null } = {}): Promise<Order | null> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order || order.status === 'cancelled' || order.status === 'returned') return order;
    if (!movesForward(order.status, target)) return order;
    const claim = await this.orders.createQueryBuilder().update(Order).set({ status: target }).where('id = :id AND status = :cur', { id: order.id, cur: order.status }).execute();
    if (!claim.affected) return order;
    const saved = (await this.orders.findOne({ where: { id: order.id } }))!;
    this.emitter.toUser(saved.customerId, 'order:updated', saved);
    pushOrderToOps(this.emitter, 'order:updated', saved);
    if (opts.notice === 'warehouse') {
      await this.notifications
        .toUser(saved.customerId, { title: 'Parcel at our warehouse', body: `${saved.reference} reached the KOMORIKO warehouse and will be on its way soon.`, type: 'delivery', entityId: saved.id })
        .catch(() => undefined);
    } else if (opts.notice === 'update') {
      await this.notifications
        .toUser(saved.customerId, { title: 'Delivery update', body: `${saved.reference} is now ${target.replace(/_/g, ' ')}.`, type: 'delivery', entityId: saved.id })
        .catch(() => undefined);
    }
    return saved;
  }

  // ── failures, voiding, readiness ─────────────────────────────────────────────
  /** A task failed: open a fresh copy for another attempt (same legs, same warehouses). */
  async reopen(failed: DeliveryTask): Promise<DeliveryTask> {
    if (failed.kind === 'express' && isOrderFlow(failed)) return this.reopenExpress(failed);
    // A customer leg is planned again with everything that is at the warehouse now (the same code, the next attempt).
    if (isCustomerKind(failed.kind) && isOrderFlow(failed)) {
      const [planned] = await this.progressChain({ orderId: failed.orderId }, { retryOf: failed });
      if (planned) return planned;
    }
    const next = await this.make({
      kind: failed.kind,
      orderId: failed.orderId,
      orderReference: failed.orderReference,
      address: failed.address,
      pickupAddress: failed.pickupAddress,
      hubId: failed.hubId,
      fromHubId: failed.fromHubId,
      toHubId: failed.toHubId,
      sellerId: failed.sellerId,
      parentTaskId: failed.parentTaskId,
      disputeId: failed.disputeId,
      replacementId: failed.replacementId,
      exchangeId: failed.exchangeId,
      itemsJson: failed.itemsJson,
      codAmountUsd: failed.codAmountUsd,
      readyAt: failed.readyAt,
      receivedAt: failed.receivedAt,
      finalHubId: failed.finalHubId,
      hop: failed.hop,
      hops: failed.hops,
      attempts: failed.attempts + 1,
      proofCode: isCustomerKind(failed.kind) ? ((await this.proofCodeOf(failed.id)) ?? undefined) : undefined,
      sellerIds: failed.sellerIds,
    });
    await this.announce(next);
    return next;
  }

  /**
   * An express attempt failed (C4).
   *  - Before the rider collected the parcel (`pickedUpAt` empty): it is still with the seller, so the same express leg opens again (next
   *    attempt, same code, same readiness: it is auto-assigned straight away).
   *  - After: the parcel is in the rider's hands, so a new rider must not be sent to the seller. A `pickup` leg is created for the SAME
   *    rider, already `picked_up`, taking the parcel to the managing warehouse (its `parentTaskId` is the express leg). Staff scan it in
   *    and the ordinary chain plans a normal `delivery` leg from there (see {@link planCustomerLeg}, which counts the failed attempt).
   */
  private async reopenExpress(failed: DeliveryTask): Promise<DeliveryTask> {
    if (!failed.pickedUpAt) {
      const next = await this.make({
        kind: 'express',
        orderId: failed.orderId,
        orderReference: failed.orderReference,
        address: failed.address,
        pickupAddress: failed.pickupAddress,
        hubId: failed.hubId,
        sellerId: failed.sellerId,
        sellerIds: failed.sellerIds,
        itemsJson: failed.itemsJson,
        codAmountUsd: failed.codAmountUsd,
        readyAt: failed.readyAt,
        attempts: failed.attempts + 1,
        proofCode: (await this.proofCodeOf(failed.id)) ?? undefined,
      });
      await this.announce(next);
      return next;
    }
    const pickup = await this.make({
      kind: 'pickup',
      orderId: failed.orderId,
      orderReference: failed.orderReference,
      sellerId: failed.sellerId,
      riderId: failed.riderId,
      status: 'picked_up',
      pickedUpAt: failed.pickedUpAt,
      readyAt: failed.readyAt,
      toHubId: failed.hubId,
      hubId: failed.hubId,
      parentTaskId: failed.id,
      pickupAddress: failed.pickupAddress,
      address: await this.hubAddressText(failed.hubId),
      itemsJson: failed.itemsJson,
    });
    await this.emitTask(pickup);
    await this.fire('created', pickup);
    return pickup;
  }

  /** Tasks that exhausted their attempts but do not cancel the order (transfers, returns, replacements): staff and admins decide. */
  async alertExhausted(task: DeliveryTask, reason: string): Promise<void> {
    await this.notifications
      .toAdmins({ title: 'Task needs attention', body: `${task.orderReference}: ${kindLabel(task.kind)} failed after ${task.attempts} attempts (${reason}).`, type: 'task', entityId: task.id }, 'logisticsDesk')
      .catch(() => undefined);
    await this.notifications
      .toUsers(await this.staffIds(task.hubId), { title: 'Task needs attention', body: `${task.orderReference}: ${kindLabel(task.kind)} failed after ${task.attempts} attempts (${reason}).`, type: 'task', entityId: task.id })
      .catch(() => undefined);
  }

  /**
   * RD-01: a rider keeps typing a wrong customer code (3rd wrong try on, and again when the step locks). The warehouse and the
   * admins are told so someone can phone the customer. `lock` is what the latest wrong try triggered, if anything.
   */
  async alertCodeFailures(task: DeliveryTask, riderName: string, failures: number, lock: { supervisor: boolean; minutes: number } | null): Promise<void> {
    const notice = {
      title: lock ? 'Delivery code locked' : 'Wrong delivery codes',
      body: lock
        ? lock.supervisor
          ? `${task.orderReference}: ${riderName} entered ${failures} wrong delivery codes. The code step is locked until a supervisor unlocks it. Call the customer to check the code.`
          : `${task.orderReference}: ${riderName} entered ${failures} wrong delivery codes. The code step is locked for ${lock.minutes} minutes. Call the customer to check the code.`
        : `${task.orderReference}: ${riderName} entered a wrong delivery code ${failures} times. Call the customer to check the code.`,
      type: 'task',
      entityId: task.id,
    };
    await this.notifications.toAdmins(notice, 'logisticsDesk').catch(() => undefined);
    await this.notifications.toUsers(await this.staffIds(task.hubId), notice).catch(() => undefined);
  }

  /** A supervisor unlocked the delivery code: the rider is told they can type it again. */
  async alertCodeUnlocked(task: DeliveryTask): Promise<void> {
    if (!task.riderId) return;
    await this.notifications
      .toUser(task.riderId, { title: 'Delivery code unlocked', body: `${task.orderReference}: you can enter the delivery code again.`, type: 'task', entityId: task.id, extra: { orderId: task.orderId, kind: task.kind } })
      .catch(() => undefined);
  }

  /** Is another attempt still allowed? */
  canRetry(task: DeliveryTask): boolean {
    return task.attempts < MAX_ATTEMPTS();
  }

  /** The order was cancelled: every open task of it is voided. */
  async voidOrderTasks(orderId: string, reason = 'Order cancelled'): Promise<DeliveryTask[]> {
    const open = await this.tasks.find({ where: { orderId, status: In([...OPEN_STATUSES]) } });
    for (const t of open) {
      await this.tasks.update({ id: t.id }, { status: 'failed', failureReason: reason });
      const saved = (await this.tasks.findOne({ where: { id: t.id } }))!;
      await this.emitTask(saved);
      await this.fire('voided', saved);
    }
    return open;
  }

  /** A seller cancelled all their lines: their parcel legs are voided and the remaining parcels may now be complete. */
  async onSellerCancelled(orderId: string, sellerKeys: string[]): Promise<void> {
    const open = await this.tasks.find({
      where: { orderId, sellerId: In(sellerKeys), status: In([...OPEN_STATUSES]), disputeId: IsNull(), replacementId: IsNull(), exchangeId: IsNull() },
    });
    for (const t of open) {
      await this.tasks.update({ id: t.id }, { status: 'failed', failureReason: 'Seller cancelled' });
      const saved = (await this.tasks.findOne({ where: { id: t.id } }))!;
      await this.emitTask(saved);
      await this.fire('voided', saved);
    }
    await this.progressChain({ orderId });
  }

  /** The seller packed their lines: their pickup is ready for the rider. Returns the seller's pickup task (null when none). */
  async markSellerReady(orderId: string, sellerKeys: string[]): Promise<DeliveryTask | null> {
    // A pickup to the warehouse, or the express leg that goes straight to the customer: both wait for the seller to pack.
    const pickups = await this.tasks.find({
      where: { orderId, kind: In(['pickup', 'express']), sellerId: In(sellerKeys), disputeId: IsNull(), replacementId: IsNull(), exchangeId: IsNull() },
      order: { createdAt: 'DESC' },
    });
    if (!pickups.length) return null;
    for (const t of pickups.filter((p) => isOpen(p.status) && !p.readyAt)) {
      await this.tasks.update({ id: t.id }, { readyAt: new Date() });
      const saved = (await this.tasks.findOne({ where: { id: t.id } }))!;
      await this.emitTask(saved);
      // The origin warehouse's staff know the parcel can be collected.
      await this.notifications
        .toUsers(await this.staffIds(saved.hubId), { title: 'Parcel ready for pickup', body: `${saved.orderReference} is packed and ready.`, type: 'task', entityId: saved.id })
        .catch(() => undefined);
      // Express legs were held back until now (C6): give it to a rider at once when the warehouse auto-assigns.
      if (saved.kind === 'express') await this.autoAssign(saved);
    }
    return (await this.tasks.findOne({ where: { id: pickups[0].id } })) ?? pickups[0];
  }

  // ── desk reads ───────────────────────────────────────────────────────────────
  /** The warehouse's task list: legs it manages, sends or receives. `hubId` null = every warehouse (admins). */
  async queue(hubId: string | null, opts: { kind?: string; status?: string; take: number; skip: number }): Promise<{ tasks: DeliveryTask[]; counts: { byKind: Record<string, number>; byStatus: Record<string, number> } }> {
    const statusFilter = !opts.status || opts.status === 'open' ? In([...OPEN_STATUSES]) : opts.status === 'all' ? undefined : (opts.status as DeliveryStatus);
    const base: Record<string, unknown> = {};
    if (statusFilter) base.status = statusFilter;
    if (opts.kind) base.kind = opts.kind;
    const where = hubId ? [{ ...base, hubId }, { ...base, fromHubId: hubId }, { ...base, toHubId: hubId }] : [base];
    const tasks = await this.tasks.find({ where: where as never, order: { createdAt: 'DESC' }, take: opts.take, skip: opts.skip });

    const countsQb = this.tasks.createQueryBuilder('t').select('t.kind', 'kind').addSelect('t.status', 'status').addSelect('COUNT(*)', 'n').groupBy('t.kind').addGroupBy('t.status');
    if (hubId) countsQb.where('(t.hubId = :h OR t.fromHubId = :h OR t.toHubId = :h)', { h: hubId });
    const rows = await countsQb.getRawMany<{ kind: string; status: string; n: string }>();
    const byKind: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const r of rows) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + Number(r.n);
      if (OPEN_STATUSES.includes(r.status as DeliveryStatus)) byKind[r.kind ?? 'delivery'] = (byKind[r.kind ?? 'delivery'] ?? 0) + Number(r.n);
    }
    return { tasks, counts: { byKind, byStatus } };
  }

  /** What a staff member may do with each task (for the buttons on the desk). */
  desk(task: Pick<DeliveryTask, 'kind' | 'status' | 'hubId' | 'fromHubId' | 'toHubId' | 'riderId'>, actor: Actor): { assign: boolean; scanIn: boolean; scanOut: boolean } {
    const hubId = isDeskAdmin(actor.role) ? (null as string | null) : (actor.hubId ?? null);
    const manages = isDeskAdmin(actor.role) || (!!hubId && task.hubId === hubId);
    return {
      assign: manages && tierAllows(actor.role, actor.tier, 'assign') && ['unassigned', 'assigned'].includes(task.status),
      scanIn: tierAllows(actor.role, actor.tier, 'scan') && (hubId ? canScanInAt(task, hubId) : isHubBound(task.kind) && COLLECTED_STATUSES.includes(task.status)),
      scanOut: tierAllows(actor.role, actor.tier, 'scan') && (hubId ? canScanOutAt(task, hubId) : OUTBOUND_KINDS.includes(task.kind) && task.status === 'assigned'),
    };
  }

  /**
   * The parcels in a warehouse's custody: `inbound` (on their way to it), `onHand` (scanned in and not yet taken out
   * by a rider) and `outbound` (assigned or on the road away from it).
   */
  async custody(hubId: string): Promise<{
    inbound: TaskView[];
    onHand: (TaskView & { since: Date | null; waitingFor: string; splitAt: Date | null })[];
    outbound: TaskView[];
    counts: { inbound: number; onHand: number; outbound: number };
  }> {
    const open = [...OPEN_STATUSES];
    const inboundTasks = await this.tasks.find({ where: { toHubId: hubId, status: In(open) }, order: { createdAt: 'ASC' }, take: 500 });
    const outboundTasks = await this.tasks.find({ where: { fromHubId: hubId, status: In(open) }, order: { createdAt: 'ASC' }, take: 500 });
    const since = new Date(Date.now() - 60 * 86_400_000);
    const arrived = (await this.tasks.find({ where: { toHubId: hubId, status: 'delivered' }, order: { receivedAt: 'DESC' }, take: 1000 })).filter((t) => isHubBound(t.kind) && (t.receivedAt ?? t.updatedAt) >= since);
    // A parcel is still on hand until its next leg has been taken out by a rider.
    const orderIds = [...new Set(arrived.map((t) => t.orderId))];
    const related = orderIds.length ? await this.tasks.find({ where: { orderId: In(orderIds) } }) : [];
    const onHandTasks: { task: DeliveryTask; waitingFor: string }[] = [];
    for (const t of arrived) {
      const children = related.filter((x) => x.parentTaskId === t.id);
      let successors = children;
      if (!children.length && (t.kind === 'pickup' || t.kind === 'transfer')) {
        const side = !!(t.replacementId || t.exchangeId);
        // On a split order a customer leg only carries the sellers it lists: another seller's parcel is not on it.
        successors = related.filter(
          (x) =>
            (side ? x.kind === 'replacement_delivery' : isCustomerKind(x.kind)) &&
            x.orderId === t.orderId &&
            x.kind !== 'express' && // an express leg that failed after collection is what brought this parcel back, not what carries it on
            (x.replacementId ?? null) === (t.replacementId ?? null) &&
            (x.exchangeId ?? null) === (t.exchangeId ?? null) &&
            (side || !x.sellerIds || x.sellerIds.some((k) => LogisticsService.keyOf(k) === LogisticsService.keyOf(t.sellerId))),
        );
      }
      const left = successors.some((s) => ['picked_up', 'in_transit', 'delivered'].includes(s.status));
      if (left) continue;
      const next = successors.find((s) => s.status !== 'failed');
      onHandTasks.push({ task: t, waitingFor: next ? `${next.kind}:${next.status}` : t.kind === 'pickup' || t.kind === 'transfer' ? 'other_parcels' : 'next_leg' });
    }
    const [inbound, outbound, onHandViews] = await Promise.all([
      this.viewMany(inboundTasks),
      this.viewMany(outboundTasks),
      this.viewMany(onHandTasks.map((x) => x.task)),
    ]);
    // When a parcel waiting for the others is due to go on without them (the oldest of the order's waiting parcels + the split limit).
    const splitHours = await this.routing.splitAfterHours();
    const oldestOf = new Map<string, number>();
    for (const x of onHandTasks) {
      if (x.waitingFor !== 'other_parcels') continue;
      const at = (x.task.receivedAt ?? x.task.updatedAt).getTime();
      oldestOf.set(x.task.orderId, Math.min(at, oldestOf.get(x.task.orderId) ?? at));
    }
    const onHand = onHandViews.map((v, i) => {
      const oldest = oldestOf.get(onHandTasks[i].task.orderId);
      const splitAt = splitHours > 0 && onHandTasks[i].waitingFor === 'other_parcels' && oldest !== undefined ? new Date(oldest + splitHours * 3_600_000) : null;
      return { ...v, since: onHandTasks[i].task.receivedAt, waitingFor: onHandTasks[i].waitingFor, splitAt };
    });
    return { inbound, onHand, outbound, counts: { inbound: inbound.length, onHand: onHand.length, outbound: outbound.length } };
  }

  /** Active riders a task can be given to, with their open workload. */
  async ridersFor(task: DeliveryTask): Promise<{ id: string; name: string; phone: string | null; hubId: string | null; activeTasks: number }[]> {
    const riders = await this.users.find({ where: { role: 'rider', active: true } });
    const fit = riders.filter((r) => riderFits(task, r.hubId));
    if (!fit.length) return [];
    const open = await this.tasks.find({ where: { riderId: In(fit.map((r) => r.id)), status: In(['assigned', 'picked_up', 'in_transit']) }, select: ['id', 'riderId'] });
    return fit.map((r) => ({ id: r.id, name: r.name, phone: r.phone, hubId: r.hubId ?? null, activeTasks: open.filter((t) => t.riderId === r.id).length }));
  }

  /** Does a warehouse see this task? */
  touches(task: DeliveryTask, hubId: string): boolean {
    return touchesHub(task, hubId);
  }

  /** The task for staff/riders by id. */
  async getTask(id: string): Promise<DeliveryTask> {
    const t = await this.tasks.findOne({ where: { id } });
    if (!t) throw new NotFoundException('Delivery task not found.');
    return t;
  }
}
