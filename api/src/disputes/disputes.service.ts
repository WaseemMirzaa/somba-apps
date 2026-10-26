import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import {
  Dispute,
  DisputeItem,
  DisputeMessage,
  DeliveryTask,
  Order,
  OrderItem,
  Seller,
} from '../database/entities';
import type {
  DisputeOutcome,
  DisputeStage,
  DisputeStatus,
  DisputeType,
  ReturnCondition,
} from '../database/entities';
import { cleanAttachments, firstName, parseAttachments, redactForSeller, storeAttachments } from '../common/attachments';
import { pageOf } from '../common/paging';
import { SettingsService } from '../content/settings.service';
import { ADMIN_ROLES, NotificationsService } from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { PaymentsService } from '../payments/payments.service';
import { ProductsService } from '../products/products.service';
import { linesBySeller, sellerUserId } from '../orders/order-sellers';
import { sellerKeys } from '../flows/after-sale';
import { resolutionFr } from '../notifications/localize';
import { pushOrderToOps } from '../logistics/hub-scope';
import { LogisticsBridge } from '../after-sale/logistics-bridge';
import { ReplacementsService } from '../flows/replacements.service';
import { PartialRefundService } from './partial-refund.service';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const SWEEP_MS = Number(process.env.AFTER_SALE_SWEEP_MS ?? 60_000);

export const DISPUTE_CATEGORIES = ['missing', 'damaged', 'wrong_item', 'not_received', 'other'] as const;
export const RETURN_CATEGORIES = ['damaged', 'wrong_item', 'not_as_described', 'changed_mind', 'defective', 'other'] as const;
export const GRADES: readonly ReturnCondition[] = ['resellable', 'damaged', 'unsellable'];
const DECIDE_OUTCOMES = ['refund_full', 'refund_partial', 'replacement', 'reject'] as const;
/** Stages where a return still waits for somebody to say yes or no to it. */
const UNDECIDED: DisputeStage[] = ['awaiting_seller', 'seller_rejected', 'seller_timeout', 'escalated'];
const STALE = 'This request was just updated by someone else. Refresh and try again.';

const cents = (n: number) => Number(n.toFixed(2));
const text = (x: unknown, max: number) => String(x ?? '').trim().slice(0, max);

/** A returned line plus its name and option label in French (from the order line it came from). */
export type DisputeItemView = DisputeItem & { productNameFr: string; variantFr: string | null };

/** A request as clients receive it. `customerId` is dropped and the name cut to a first name for sellers. */
export type DisputeView = Omit<Dispute, 'attachments'> & {
  attachments: string[];
  /** `resolution` in French: stock phrases translated, an agent's own words unchanged. */
  resolutionFr: string | null;
  items: DisputeItemView[];
  siblings?: string[];
  canEscalate: boolean;
  canCancel: boolean;
  messages?: DisputeMessageView[];
  messageCount?: number;
};

export interface DisputeMessageView {
  id: string;
  disputeId: string;
  authorId: string | null;
  authorName: string;
  role: string;
  text: string;
  attachments: string[];
  createdAt: Date;
}

export interface ReturnEligibility {
  eligible: boolean;
  reason: string | null;
  windowDays: number;
  deliveredAt: Date | null;
  endsAt: Date | null;
  items: { itemId: string; productId: string; productName: string; variant: string; qty: number; remaining: number; unitPriceUsd: number; image?: string | null }[];
}

interface Viewer {
  id: string;
  role: string;
  name?: string;
}

@Injectable()
export class DisputesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DisputesService.name);
  private sweeper: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(Dispute) private readonly disputes: Repository<Dispute>,
    @InjectRepository(DisputeItem) private readonly itemsRepo: Repository<DisputeItem>,
    @InjectRepository(DisputeMessage) private readonly messagesRepo: Repository<DisputeMessage>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    @InjectRepository(DeliveryTask) private readonly tasks: Repository<DeliveryTask>,
    private readonly notifications: NotificationsService,
    private readonly payments: PaymentsService,
    private readonly refunds: PartialRefundService,
    private readonly products: ProductsService,
    private readonly settings: SettingsService,
    private readonly emitter: RealtimeEmitter,
    private readonly logistics: LogisticsBridge,
    private readonly replacements: ReplacementsService,
  ) {}

  onModuleInit(): void {
    if (SWEEP_MS > 0) {
      this.sweeper = setInterval(() => void this.sweep().catch((e) => this.logger.warn(`sweep failed: ${(e as Error).message}`)), SWEEP_MS);
      this.sweeper.unref?.();
    }
  }

  onModuleDestroy(): void {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  // ── Settings ───────────────────────────────────────────────────────────────

  async returnWindowDays(): Promise<number> {
    const raw = await this.settings.get('returnWindowDays');
    const n = raw === null || String(raw).trim() === '' ? NaN : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 7;
  }

  async sellerResponseHours(): Promise<number> {
    const n = Number(await this.settings.get('sellerResponseHours'));
    return Number.isFinite(n) && n > 0 ? n : 48;
  }

  // ── Order helpers ──────────────────────────────────────────────────────────

  /** When the goods reached the customer: the delivered task's time, else when the order last changed. */
  private async deliveredAt(order: Order): Promise<Date> {
    const rows = await this.tasks.find({ where: { orderId: order.id, status: 'delivered' }, select: ['id', 'deliveredAt', 'updatedAt'] });
    const times = rows.map((t) => (t.deliveredAt ?? t.updatedAt)?.getTime?.() ?? 0).filter(Boolean);
    return times.length ? new Date(Math.max(...times)) : order.updatedAt;
  }

  /** Units of each order line already asked back (open or paid requests; a rejected or cancelled one frees them). */
  private async requestedQty(orderId: string, excludeDisputeId?: string): Promise<Map<string, number>> {
    const rows = await this.itemsRepo
      .createQueryBuilder('i')
      .innerJoin(Dispute, 'd', 'd.id = i.disputeId')
      .select('i.orderItemId', 'orderItemId')
      .addSelect('SUM(i.qty)', 'qty')
      .where("d.orderId = :orderId AND d.type = 'return' AND d.status != 'rejected'", { orderId })
      .andWhere(excludeDisputeId ? 'd.id != :ex' : '1=1', { ex: excludeDisputeId })
      .groupBy('i.orderItemId')
      .getRawMany<{ orderItemId: string; qty: string }>();
    return new Map(rows.map((r) => [r.orderItemId, Number(r.qty)]));
  }

  /** What the customer may still send back from an order, and whether the return window is open. */
  async eligibility(customerId: string, orderId: string): Promise<ReturnEligibility> {
    const order = await this.orders.findOne({ where: { id: String(orderId ?? '') } });
    if (!order || order.customerId !== customerId) throw new NotFoundException('Order not found.');
    const windowDays = await this.returnWindowDays();
    const taken = await this.requestedQty(order.id);
    const items = (order.items ?? [])
      .filter((i) => i.fulfilment !== 'cancelled' && !i.productId.startsWith('ext:'))
      .map((i) => ({
        itemId: i.id,
        productId: i.productId,
        productName: i.productName,
        variant: i.variant,
        qty: i.qty,
        remaining: Math.max(0, i.qty - (taken.get(i.id) ?? 0)),
        unitPriceUsd: i.priceUsd,
      }));
    if (order.status !== 'delivered') {
      return { eligible: false, reason: 'You can return items once the order has been delivered.', windowDays, deliveredAt: null, endsAt: null, items };
    }
    const deliveredAt = await this.deliveredAt(order);
    const endsAt = new Date(deliveredAt.getTime() + windowDays * DAY_MS);
    if (windowDays <= 0) return { eligible: false, reason: 'Returns are not accepted at the moment.', windowDays, deliveredAt, endsAt, items };
    if (Date.now() > endsAt.getTime()) {
      return { eligible: false, reason: `Returns are accepted within ${windowDays} days of delivery, and that time has passed.`, windowDays, deliveredAt, endsAt, items };
    }
    if (!items.some((i) => i.remaining > 0)) {
      return { eligible: false, reason: 'You already have an open request for this order.', windowDays, deliveredAt, endsAt, items };
    }
    return { eligible: true, reason: null, windowDays, deliveredAt, endsAt, items };
  }

  // ── Views ──────────────────────────────────────────────────────────────────

  private async itemsOf(ids: string[]): Promise<Map<string, DisputeItemView[]>> {
    const out = new Map<string, DisputeItemView[]>();
    if (!ids.length) return out;
    const rows = await this.itemsRepo.find({ where: { disputeId: In(ids) }, order: { createdAt: 'ASC' } });
    // Loading the order lines completes their French names (OrderItemTranslationSubscriber).
    const lineIds = [...new Set(rows.map((r) => r.orderItemId))];
    const lines = lineIds.length ? await this.orders.manager.find(OrderItem, { where: { id: In(lineIds) } }) : [];
    const byLine = new Map(lines.map((l) => [l.id, l]));
    for (const r of rows) {
      const line = byLine.get(r.orderItemId);
      const view: DisputeItemView = { ...r, productNameFr: line?.productNameFr ?? r.productName, variantFr: line?.variantFr ?? null };
      out.set(r.disputeId, [...(out.get(r.disputeId) ?? []), view]);
    }
    return out;
  }

  /** Rows as clients receive them (items + photos decoded + what the customer may do next). */
  async present(rows: Dispute[]): Promise<DisputeView[]> {
    const items = await this.itemsOf(rows.map((r) => r.id));
    return rows.map((d) => ({
      ...d,
      attachments: parseAttachments(d.attachments),
      resolutionFr: resolutionFr(d.resolution),
      items: items.get(d.id) ?? [],
      canEscalate: d.status === 'open' && (d.stage === 'seller_rejected' || d.stage === 'seller_timeout'),
      canCancel: d.status === 'open' && UNDECIDED.includes(d.stage),
    }));
  }

  /** What a seller may see of a request: the customer's first name, never their id. */
  static forSeller<T extends { customerId?: string | null; customerName?: string | null }>(view: T, sellerUserIdOfViewer?: string): T {
    return redactForSeller(view, sellerUserIdOfViewer);
  }

  /** A seller never learns the customer's account id: not from the request, and not from the thread either. */
  private static messageForSeller(m: DisputeMessageView): DisputeMessageView {
    return m.role === 'customer' ? { ...m, authorId: null } : m;
  }

  private async messageViews(disputeId: string): Promise<DisputeMessageView[]> {
    const rows = await this.messagesRepo.find({ where: { disputeId }, order: { createdAt: 'ASC' } });
    return rows.map((m) => ({ ...m, attachments: parseAttachments(m.attachments) }));
  }

  // ── Who is who ─────────────────────────────────────────────────────────────

  /** User ids of the sellers the request concerns. */
  private async sellerUsersOf(d: Pick<Dispute, 'sellerId' | 'orderId'>): Promise<string[]> {
    try {
      if (d.sellerId) return [await sellerUserId(d.sellerId, this.sellers)];
      const order = await this.orders.findOne({ where: { id: d.orderId } });
      if (!order) return [];
      const ids = new Set<string>();
      for (const sellerId of (await linesBySeller(order, this.products)).keys()) ids.add(await sellerUserId(sellerId, this.sellers));
      return [...ids];
    } catch {
      return [];
    }
  }

  private async isSellerOf(user: Viewer, d: Pick<Dispute, 'sellerId' | 'orderId'>): Promise<boolean> {
    if (user.role !== 'seller') return false;
    if (d.sellerId) return (await sellerKeys(user.id, this.sellers)).includes(d.sellerId);
    return (await this.sellerUsersOf(d)).includes(user.id);
  }

  private async canSee(user: Viewer, d: Dispute): Promise<boolean> {
    if (user.role.startsWith('admin')) return true;
    if (user.role === 'warehouse_staff') return d.type === 'return';
    if (d.customerId === user.id) return true;
    return this.isSellerOf(user, d);
  }

  private async loadFor(user: Viewer, id: string): Promise<Dispute> {
    const d = await this.disputes.findOne({ where: { id: String(id ?? '') } });
    // The same answer for "missing" and "not yours", so ids cannot be probed.
    if (!d || !(await this.canSee(user, d))) throw new NotFoundException('Dispute not found.');
    return d;
  }

  // ── Live updates ───────────────────────────────────────────────────────────

  /** The customer, admins, the sellers on the order and, for returns, the warehouse. */
  private async publish(dispute: Dispute, event: 'dispute:created' | 'dispute:updated'): Promise<DisputeView> {
    const [view] = await this.present([dispute]);
    this.emitter.toUser(dispute.customerId, event, view);
    this.emitter.toRoles(dispute.type === 'return' ? [...ADMIN_ROLES, 'warehouse_staff'] : ADMIN_ROLES, event, view);
    for (const id of await this.sellerUsersOf(dispute)) this.emitter.toUser(id, event, DisputesService.forSeller(view, id));
    return view;
  }

  /** Tell the sellers on the order how a request moved. */
  private async tellSellers(dispute: Dispute, sellerIds: string[], title: string, body: string): Promise<void> {
    await this.notifications.toUsers(sellerIds, { title, body, type: dispute.type, entityId: dispute.id });
  }

  // ── Opening ────────────────────────────────────────────────────────────────

  async open(
    customer: { id: string; name: string },
    input: {
      orderId: string;
      type: DisputeType;
      reason: string;
      category?: string;
      items?: { itemId?: string; productId?: string; qty?: number }[];
      attachments?: unknown;
      refundTo?: string;
    },
  ): Promise<DisputeView & { siblings?: string[] }> {
    const order = await this.orders.findOne({ where: { id: String(input?.orderId ?? '') } });
    // Same answer for "missing" and "not yours".
    if (!order || order.customerId !== customer.id) throw new NotFoundException('Order not found.');
    const type: DisputeType = input.type === 'return' ? 'return' : 'dispute';
    const reason = String(input?.reason ?? '').trim();
    if (reason.length < 5) throw new BadRequestException('Please describe the problem (at least a few words).');
    if (['pending', 'cancelled'].includes(order.status)) {
      throw new BadRequestException('This order has not been paid for or was cancelled.');
    }
    const photos = cleanAttachments(input.attachments);
    const allowed: readonly string[] = type === 'return' ? RETURN_CATEGORIES : DISPUTE_CATEGORIES;
    const category = input.category ? text(input.category, 24) : null;
    if (category && !allowed.includes(category)) throw new BadRequestException('Choose what is wrong from the list.');
    const refundTo: 'wallet' | 'phone' = input.refundTo === 'phone' ? 'phone' : 'wallet';
    const dueAt = new Date(Date.now() + (await this.sellerResponseHours()) * HOUR_MS);

    const groups = type === 'return' ? await this.returnGroups(order, input.items) : await this.disputeGroups(order, customer.id, input.items);
    const created: Dispute[] = [];
    for (const group of groups) {
      const dispute = await this.disputes.manager.transaction(async (m) => {
        // Two requests for the same order at the same moment queue up on the order row, and the second one re-checks.
        await this.lockOrder(m, order.id);
        await this.assertRoom(m, order.id, customer.id, type, group.lines);
        const d = await m.save(
          m.create(Dispute, {
            reference: DisputesService.newReference(type),
            orderId: order.id,
            orderReference: order.reference,
            customerId: customer.id,
            customerName: customer.name,
            type,
            category,
            reason: reason.slice(0, 2000),
            status: 'open',
            stage: 'awaiting_seller',
            attachments: storeAttachments(photos),
            sellerId: group.sellerId,
            sellerDueAt: dueAt,
            refundTo,
          }),
        );
        for (const l of group.lines) {
          await m.save(
            m.create(DisputeItem, {
              disputeId: d.id,
              orderItemId: l.item.id,
              productId: l.item.productId,
              productName: l.item.productName,
              variant: l.item.variant,
              qty: l.qty,
              unitPriceUsd: l.item.priceUsd,
            }),
          );
        }
        return d;
      });
      created.push(dispute);
    }

    const views: DisputeView[] = [];
    for (const d of created) {
      views.push(await this.publish(d, 'dispute:created'));
      const sellerIds = await this.sellerUsersOf(d);
      await this.notifications.toRole('admin_support', {
        title: type === 'return' ? 'Return requested' : 'Dispute opened',
        body: `${d.reference} · ${order.reference} · ${firstName(customer.name)}`,
        type,
        entityId: d.id,
      });
      // Sellers learn about a problem on their own items as soon as it is raised.
      await this.tellSellers(
        d,
        sellerIds,
        type === 'return' ? 'Return requested on your order' : 'Dispute opened on your order',
        `${d.reference} · ${order.reference}: ${d.reason.slice(0, 140)}`,
      );
    }
    const [first, ...rest] = views;
    return rest.length ? { ...first, siblings: rest.map((v) => v.id) } : first;
  }

  private async lockOrder(m: EntityManager, orderId: string): Promise<void> {
    if (m.connection.options.type !== 'mysql') return; // SQLite already serialises writers
    await m.createQueryBuilder().select('o.id').from(Order, 'o').where('o.id = :orderId', { orderId }).setLock('pessimistic_write').getRawOne();
  }

  /**
   * C-R2 / one open dispute, checked again inside the transaction that creates the request (the data layer's copy of
   * the rule the controller checks first): never more units than bought, never two open disputes on an order.
   */
  private async assertRoom(m: EntityManager, orderId: string, customerId: string, type: DisputeType, lines: { item: OrderItem; qty: number }[]): Promise<void> {
    if (type === 'dispute') {
      if (await m.count(Dispute, { where: { orderId, customerId, type: 'dispute', status: 'open' } })) {
        throw new BadRequestException('You already have an open request for this order.');
      }
      return;
    }
    const rows = await m
      .createQueryBuilder(DisputeItem, 'i')
      .innerJoin(Dispute, 'd', 'd.id = i.disputeId')
      .select('i.orderItemId', 'orderItemId')
      .addSelect('SUM(i.qty)', 'qty')
      .where("d.orderId = :orderId AND d.type = 'return' AND d.status != 'rejected'", { orderId })
      .groupBy('i.orderItemId')
      .getRawMany<{ orderItemId: string; qty: string }>();
    const taken = new Map(rows.map((r) => [r.orderItemId, Number(r.qty)]));
    for (const l of lines) {
      if ((taken.get(l.item.id) ?? 0) + l.qty > l.item.qty) throw new BadRequestException('You already have an open request for this order.');
    }
  }

  /** A dispute names no lines (the whole order) or some; one open dispute per order. */
  private async disputeGroups(
    order: Order,
    customerId: string,
    wanted: { itemId?: string; productId?: string; qty?: number }[] | undefined,
  ): Promise<{ sellerId: string | null; lines: { item: OrderItem; qty: number }[] }[]> {
    const already = await this.disputes.count({ where: { orderId: order.id, customerId, type: 'dispute', status: 'open' } });
    if (already) throw new BadRequestException('You already have an open request for this order.');
    const bySeller = await linesBySeller(order, this.products);
    const lines: { item: OrderItem; qty: number }[] = [];
    for (const w of wanted ?? []) {
      const item = this.findLine(order, w);
      const qty = Math.max(1, Math.min(item.qty, Math.trunc(Number(w.qty) || item.qty)));
      lines.push({ item, qty });
    }
    const sellerIds = new Set<string>();
    if (lines.length) {
      for (const l of lines) for (const [sid, its] of bySeller) if (its.some((i) => i.id === l.item.id)) sellerIds.add(sid);
    } else if (bySeller.size === 1) sellerIds.add([...bySeller.keys()][0]);
    return [{ sellerId: sellerIds.size === 1 ? [...sellerIds][0] : null, lines }];
  }

  private findLine(order: Order, w: { itemId?: string; productId?: string }): OrderItem {
    const live = (order.items ?? []).filter((i) => i.fulfilment !== 'cancelled' && !i.productId.startsWith('ext:'));
    const hit = w.itemId ? live.find((i) => i.id === w.itemId) : live.find((i) => i.productId === w.productId);
    if (!hit) throw new BadRequestException('One of the items is not on this order.');
    return hit;
  }

  /** The units a return asks for, grouped by seller (one request per seller: each answers for their own goods). */
  private async returnGroups(
    order: Order,
    wanted: { itemId?: string; productId?: string; qty?: number }[] | undefined,
  ): Promise<{ sellerId: string | null; lines: { item: OrderItem; qty: number }[] }[]> {
    // C-R1: only a delivered order, only inside the return window.
    const eligibility = await this.eligibility(order.customerId, order.id);
    if (!eligibility.eligible) throw new BadRequestException(eligibility.reason ?? 'This order cannot be returned.');
    const remaining = new Map(eligibility.items.map((i) => [i.itemId, i.remaining]));
    const lines: { item: OrderItem; qty: number }[] = [];
    if (wanted?.length) {
      const seen = new Set<string>();
      for (const w of wanted) {
        const item = this.findLine(order, w);
        if (seen.has(item.id)) throw new BadRequestException('An item appears twice in the request.');
        seen.add(item.id);
        const left = remaining.get(item.id) ?? 0;
        const qty = w.qty === undefined || w.qty === null ? left : Math.trunc(Number(w.qty));
        // C-R2: never more units than were bought and are not already on another request.
        if (!Number.isFinite(qty) || qty < 1) throw new BadRequestException('Choose how many of each item to return.');
        if (qty > left) {
          throw new BadRequestException(left === 0 ? 'You already have an open request for this order.' : `You can return at most ${left} of "${item.productName}".`);
        }
        lines.push({ item, qty });
      }
    } else {
      for (const item of order.items ?? []) {
        const left = remaining.get(item.id) ?? 0;
        if (left > 0) lines.push({ item, qty: left });
      }
    }
    if (!lines.length) throw new BadRequestException('Choose at least one item to return.');
    const bySeller = await linesBySeller(order, this.products);
    const sellerOf = (itemId: string) => [...bySeller].find(([, its]) => its.some((i) => i.id === itemId))?.[0] ?? null;
    const groups = new Map<string | null, { item: OrderItem; qty: number }[]>();
    for (const l of lines) groups.set(sellerOf(l.item.id), [...(groups.get(sellerOf(l.item.id)) ?? []), l]);
    return [...groups].map(([sellerId, ls]) => ({ sellerId, lines: ls }));
  }

  // ── Reading ────────────────────────────────────────────────────────────────

  async list(
    user: Viewer,
    filter: { status?: string; type?: string; stage?: string; limit?: number; offset?: number } = {},
  ): Promise<DisputeView[]> {
    const { take, skip } = pageOf(filter, { def: user.role === 'customer' ? 500 : 200 });
    const qb = this.disputes.createQueryBuilder('d').orderBy('d.createdAt', 'DESC').take(take).skip(skip);
    if (filter.status) qb.andWhere('d.status = :status', { status: filter.status });
    if (filter.type) qb.andWhere('d.type = :type', { type: filter.type });
    if (filter.stage) qb.andWhere('d.stage = :stage', { stage: filter.stage });
    if (user.role.startsWith('admin')) {
      // everything
    } else if (user.role === 'warehouse_staff') {
      qb.andWhere("d.type = 'return'");
    } else if (user.role === 'seller') {
      const keys = await sellerKeys(user.id, this.sellers);
      // Their store's requests, their own purchases, and requests that name no store on an order holding their goods
      // (by the line's seller, else by the listing's seller on older lines).
      qb.andWhere(
        '(d.sellerId IN (:...keys) OR d.customerId = :me OR (d.sellerId IS NULL AND d.orderId IN (' +
          'SELECT i.orderId FROM order_items i WHERE i.sellerId IN (:...keys) OR (i.sellerId IS NULL AND i.productId IN (SELECT p.id FROM products p WHERE p.sellerId IN (:...keys))))))',
        { keys, me: user.id },
      );
    } else {
      qb.andWhere('d.customerId = :me', { me: user.id });
    }
    const views = await this.present(await qb.getMany());
    return user.role === 'seller' ? views.map((v) => DisputesService.forSeller(v, user.id)) : views;
  }

  /** One request with its thread (parties and staff only). */
  async get(user: Viewer, id: string): Promise<DisputeView> {
    const d = await this.loadFor(user, id);
    const [view] = await this.present([d]);
    const messages = await this.messageViews(d.id);
    if (user.role === 'seller' && d.customerId !== user.id) {
      return DisputesService.forSeller({ ...view, messages: messages.map(DisputesService.messageForSeller), messageCount: messages.length }, user.id);
    }
    return { ...view, messages, messageCount: messages.length };
  }

  // ── The thread ─────────────────────────────────────────────────────────────

  /** A message from the customer, the seller or Somba staff. */
  async reply(user: Viewer & { name: string }, id: string, rawText: unknown, rawAttachments?: unknown): Promise<DisputeMessageView> {
    const d = await this.loadFor(user, id);
    if (user.role === 'warehouse_staff') throw new NotFoundException('Dispute not found.');
    const body = text(rawText, 2000);
    const photos = cleanAttachments(rawAttachments);
    if (body.length < 2 && !photos.length) throw new BadRequestException('Write a message first.');
    if (d.status !== 'open') throw new BadRequestException('This request is closed.');
    const mine = d.customerId === user.id;
    const row = await this.messagesRepo.save(
      this.messagesRepo.create({
        disputeId: d.id,
        authorId: user.id,
        authorName: mine || user.role === 'customer' ? firstName(user.name) : user.name,
        role: user.role,
        text: body,
        attachments: storeAttachments(photos),
      }),
    );
    const msg: DisputeMessageView = { ...row, attachments: photos };
    let nextStage: DisputeStage | null = null;
    if (user.role === 'seller' && d.type === 'dispute' && d.stage === 'awaiting_seller') nextStage = 'seller_replied';
    if (nextStage) {
      await this.disputes.update({ id: d.id, stage: 'awaiting_seller' }, { stage: nextStage, sellerRespondedAt: new Date() });
    }
    const fresh = (await this.disputes.findOne({ where: { id: d.id } }))!;
    const view = await this.publish(fresh, 'dispute:updated');
    // The thread goes to everyone on the request, the author included (their other devices).
    const payload = { disputeId: d.id, message: msg };
    this.emitter.toUser(d.customerId, 'dispute:message', payload);
    this.emitter.toRoles(ADMIN_ROLES, 'dispute:message', payload);
    const sellerIds = await this.sellerUsersOf(d);
    for (const sid of sellerIds) {
      this.emitter.toUser(sid, 'dispute:message', sid === user.id ? payload : { disputeId: d.id, message: DisputesService.messageForSeller(msg) });
    }
    // And a notice to the others.
    const what = d.type === 'return' ? 'Return' : 'Dispute';
    const preview = `${d.reference}: ${(body || '📷').slice(0, 140)}`;
    if (!mine) {
      await this.notifications.toUser(d.customerId, { title: `${what} reply`, body: preview, type: d.type, entityId: d.id });
    }
    if (user.role !== 'seller') await this.tellSellers(d, sellerIds.filter((s) => s !== user.id), `${what} reply`, preview);
    if (!user.role.startsWith('admin')) {
      await this.notifications.toRole('admin_support', { title: `${what} reply`, body: preview, type: d.type, entityId: d.id });
    }
    void view;
    return msg;
  }

  // ── Returns: seller and admin decisions ─────────────────────────────────────

  /** Move an open request from one of `from` to a new stage in ONE statement; nobody else can have moved it. */
  private async advance(id: string, from: DisputeStage[], patch: Partial<Dispute>): Promise<Dispute> {
    const res = await this.disputes
      .createQueryBuilder()
      .update(Dispute)
      .set(patch as never)
      .where("id = :id AND status = 'open' AND stage IN (:...from)", { id, from })
      .execute();
    if (!res.affected) throw new BadRequestException(STALE);
    return (await this.disputes.findOne({ where: { id } }))!;
  }

  /** The seller accepts or rejects a return within the response time. */
  async sellerRespond(user: Viewer, id: string, accept: boolean, rawReason: unknown): Promise<DisputeView> {
    const d = await this.loadFor(user, id);
    if (user.role !== 'seller' || !(await this.isSellerOf(user, d))) throw new NotFoundException('Dispute not found.');
    if (d.type !== 'return') throw new BadRequestException('Only returns need an accept or reject; reply to the customer instead.');
    if (d.status !== 'open' || d.stage !== 'awaiting_seller') {
      throw new BadRequestException(
        d.stage === 'seller_timeout' || d.stage === 'escalated' ? 'The response time has passed; Somba support decides now.' : 'This request was already handled.',
      );
    }
    const reason = text(rawReason, 1000);
    if (!accept && reason.length < 5) throw new BadRequestException('Tell the customer why you are rejecting this return.');
    const saved = await this.advance(d.id, ['awaiting_seller'], {
      stage: accept ? 'approved' : 'seller_rejected',
      sellerRespondedAt: new Date(),
      sellerReason: reason || null,
    });
    if (accept) return this.afterApproval(saved, 'Return accepted');
    const view = await this.publish(saved, 'dispute:updated');
    await this.notifications.toUser(saved.customerId, {
      title: 'Return rejected',
      body: `${saved.reference} · ${saved.orderReference}: ${reason}`,
      type: 'return',
      entityId: saved.id,
    });
    return view;
  }

  /** Somba support approves or refuses a return the seller rejected or let lapse (or any return still undecided). */
  async adminDecideReturn(admin: Viewer, id: string, approve: boolean, rawReason: unknown): Promise<DisputeView> {
    if (!admin.role.startsWith('admin')) throw new BadRequestException('Admins only.');
    const d = await this.disputes.findOne({ where: { id: String(id ?? '') } });
    if (!d) throw new NotFoundException('Dispute not found.');
    if (d.type !== 'return') throw new BadRequestException('Use decide for disputes.');
    if (d.status !== 'open' || !UNDECIDED.includes(d.stage)) throw new BadRequestException(STALE);
    const reason = text(rawReason, 1000);
    if (!approve && reason.length < 5) throw new BadRequestException('Give the customer a reason for refusing the return.');
    if (approve) {
      const saved = await this.advance(d.id, UNDECIDED, { stage: 'approved' });
      return this.afterApproval(saved, 'Return approved', reason);
    }
    return this.close(d, 'rejected', 'reject', reason, UNDECIDED);
  }

  /** The return was said yes to: ask logistics to collect the goods, and tell everyone. */
  private async afterApproval(d: Dispute, kind: 'Return accepted' | 'Return approved', note = ''): Promise<DisputeView> {
    const items = await this.itemsRepo.find({ where: { disputeId: d.id } });
    const task = await this.logistics.returnPickup({
      disputeId: d.id,
      orderId: d.orderId,
      items: items.map((i) => ({ orderItemId: i.orderItemId, productId: i.productId, qty: i.qty })),
    });
    let saved = d;
    if (task) {
      await this.disputes.update({ id: d.id }, { pickupTaskId: task.id, stage: 'pickup' });
      saved = (await this.disputes.findOne({ where: { id: d.id } }))!;
    }
    const view = await this.publish(saved, 'dispute:updated');
    await this.notifications.toUser(saved.customerId, {
      title: kind,
      body: `${saved.reference} · ${saved.orderReference}${note ? `: ${note}` : ''}`,
      type: 'return',
      entityId: saved.id,
    });
    if (kind === 'Return approved') {
      await this.tellSellers(saved, await this.sellerUsersOf(saved), 'Return approved', `${saved.reference} · ${saved.orderReference}${note ? `: ${note}` : ''}`);
    }
    if (!task) {
      // No pickup task (logistics not available): the warehouse collects by hand.
      await this.notifications.toRole('warehouse_staff', { title: 'Return approved', body: `${saved.reference} · ${saved.orderReference}`, type: 'return', entityId: saved.id });
    }
    return view;
  }

  /** The customer takes a rejected or lapsed return to Somba support. */
  async escalate(customer: Viewer, id: string, rawNote?: unknown): Promise<DisputeView> {
    const d = await this.disputes.findOne({ where: { id: String(id ?? '') } });
    if (!d || d.customerId !== customer.id) throw new NotFoundException('Dispute not found.');
    if (d.type !== 'return') throw new BadRequestException('Only returns can be escalated; a dispute is already with Somba support.');
    // C-R4: only after the seller said no or the time ran out.
    if (d.status !== 'open' || !(d.stage === 'seller_rejected' || d.stage === 'seller_timeout')) {
      throw new BadRequestException(d.stage === 'awaiting_seller' ? 'Wait for the seller to answer, or for the response time to pass.' : STALE);
    }
    const saved = await this.advance(d.id, ['seller_rejected', 'seller_timeout'], { stage: 'escalated', escalatedAt: new Date() });
    const note = text(rawNote, 1000);
    if (note) {
      await this.messagesRepo.save(
        this.messagesRepo.create({ disputeId: d.id, authorId: customer.id, authorName: firstName(d.customerName), role: 'customer', text: note, attachments: null }),
      );
    }
    const view = await this.publish(saved, 'dispute:updated');
    const body = `${saved.reference} · ${saved.orderReference}${note ? `: ${note.slice(0, 140)}` : ''}`;
    await this.notifications.toRole('admin_support', { title: 'Return escalated', body, type: 'return', entityId: saved.id });
    await this.tellSellers(saved, await this.sellerUsersOf(saved), 'Return escalated', body);
    return view;
  }

  /** The customer withdraws a request that nobody has acted on yet. */
  async cancel(customer: Viewer, id: string): Promise<DisputeView> {
    const d = await this.disputes.findOne({ where: { id: String(id ?? '') } });
    if (!d || d.customerId !== customer.id) throw new NotFoundException('Dispute not found.');
    if (d.status !== 'open' || !UNDECIDED.includes(d.stage)) throw new BadRequestException(d.status === 'open' ? 'It is too late to cancel: the return is already on its way.' : STALE);
    return this.close(d, 'rejected', 'reject', 'Cancelled by the customer', UNDECIDED, customer.id);
  }

  // ── Disputes: the admin decides ────────────────────────────────────────────

  async decide(
    admin: Viewer & { name: string },
    id: string,
    input: { outcome: string; amountUsd?: number; reason?: string; items?: { itemId?: string; qty?: number }[]; refundTo?: string },
    canRefund: boolean,
  ): Promise<DisputeView> {
    if (!admin.role.startsWith('admin')) throw new BadRequestException('Admins only.');
    const d = await this.disputes.findOne({ where: { id: String(id ?? '') } });
    if (!d) throw new NotFoundException('Dispute not found.');
    if (d.type !== 'dispute') throw new BadRequestException('Returns are approved or refused with returns:decide.');
    if (d.status !== 'open') throw new BadRequestException('This request was already handled.');
    const outcome = input.outcome as (typeof DECIDE_OUTCOMES)[number];
    if (!DECIDE_OUTCOMES.includes(outcome)) throw new BadRequestException(`Outcome must be one of: ${DECIDE_OUTCOMES.join(', ')}.`);
    const reason = text(input.reason, 1000);
    if (outcome === 'reject' && reason.length < 5) throw new BadRequestException('Give the customer a reason for refusing.');
    if ((outcome === 'refund_full' || outcome === 'refund_partial') && !canRefund) {
      throw new BadRequestException('Only admin or finance can issue a refund.');
    }
    const toWallet = (input.refundTo ?? d.refundTo) !== 'phone';
    let refundUsd = 0;
    let replacementNote = '';
    if (outcome === 'refund_full') {
      const left = await this.refunds.outstanding(d.orderId);
      const paid = await this.payments.refund(d.orderId, toWallet); // throws if it cannot be refunded
      refundUsd = paid.refundedUsd ?? left;
    } else if (outcome === 'refund_partial') {
      const amount = cents(Number(input.amountUsd));
      if (!(amount > 0)) throw new BadRequestException('Enter the amount to refund.');
      const done = await this.refunds.refund({ orderId: d.orderId, amountUsd: amount, toWallet, memo: `Refund for ${d.orderReference} (dispute)` });
      refundUsd = done.refundedUsd;
    } else if (outcome === 'replacement') {
      const made = await this.replacements.createFromDispute(d, input.items);
      replacementNote = made.map((r) => r.reference).join(', ');
    }
    const resolution =
      reason ||
      (outcome === 'refund_full' ? 'Refunded to wallet' : outcome === 'refund_partial' ? 'Partially refunded' : outcome === 'replacement' ? 'Replacement approved' : 'Rejected');
    const closed = await this.close(d, outcome === 'reject' ? 'rejected' : 'resolved', outcome, resolution, ['awaiting_seller', 'seller_replied', 'seller_rejected', 'seller_timeout', 'escalated', 'approved', 'pickup', 'received'], undefined, refundUsd);
    void replacementNote;
    return closed;
  }

  /** Close an open request: one conditional update, then the live update and the notices to everyone. */
  private async close(
    d: Dispute,
    status: Exclude<DisputeStatus, 'open'>,
    outcome: DisputeOutcome,
    resolution: string,
    from: DisputeStage[],
    byCustomer?: string,
    refundUsd = 0,
  ): Promise<DisputeView> {
    const res = await this.disputes
      .createQueryBuilder()
      .update(Dispute)
      .set({ status, stage: 'closed', outcome, resolution: resolution.slice(0, 1000), ...(refundUsd ? { refundUsd } : {}) })
      .where("id = :id AND status = 'open' AND stage IN (:...from)", { id: d.id, from })
      .execute();
    if (!res.affected) throw new BadRequestException('This request was already handled.');
    const saved = (await this.disputes.findOne({ where: { id: d.id } }))!;
    const view = await this.publish(saved, 'dispute:updated');
    const what = saved.type === 'return' ? 'Return' : 'Dispute';
    const sellerIds = await this.sellerUsersOf(saved);
    if (!byCustomer) {
      await this.notifications.toUser(saved.customerId, {
        title: status === 'resolved' ? `${what} resolved` : `${what} closed`,
        body: `${saved.reference}: ${saved.resolution}`,
        type: saved.type,
        entityId: saved.id,
      });
    }
    await this.tellSellers(
      saved,
      sellerIds,
      status === 'resolved' ? `${what} resolved` : `${what} closed`,
      `${saved.reference} · ${saved.orderReference}: ${saved.resolution}`,
    );
    return view;
  }

  // ── Legacy admin handlers (kept: the web portals call these) ───────────────

  /**
   * Admin resolves an OPEN request; optionally refunds. Refunding moves money, so it needs finance/admin
   * (`canRefund`) — and if the refund cannot be made the request is NOT marked resolved. A refund on a return pays
   * back the returned items only; on a dispute, everything still outstanding.
   */
  async resolve(
    disputeId: string,
    opts: { resolution?: string; refund?: boolean; force?: boolean },
    canRefund: boolean,
  ): Promise<DisputeView> {
    const dispute = await this.disputes.findOne({ where: { id: disputeId } });
    if (!dispute) throw new NotFoundException('Dispute not found.');
    if (dispute.status !== 'open') throw new BadRequestException('This request was already handled.');
    if (opts.refund && !canRefund) throw new BadRequestException('Only admin or finance can issue a refund.');
    if (opts.refund && dispute.type === 'return' && !dispute.receivedAt && !opts.force) {
      throw new BadRequestException('Mark the returned goods as received at the warehouse before refunding.');
    }
    let refundUsd = 0;
    if (opts.refund) {
      if (dispute.type === 'return') refundUsd = (await this.refundReturnedItems(dispute)).refundedUsd;
      else {
        const paid = await this.payments.refund(dispute.orderId, dispute.refundTo !== 'phone'); // throws if it can't be refunded
        refundUsd = paid.refundedUsd ?? 0;
      }
    }
    return this.close(
      dispute,
      'resolved',
      opts.refund ? (dispute.type === 'return' ? 'return_refund' : 'refund_full') : 'reject',
      String(opts.resolution ?? (opts.refund ? 'Refunded to wallet' : 'Resolved')),
      ['awaiting_seller', 'seller_replied', 'seller_rejected', 'seller_timeout', 'escalated', 'approved', 'pickup', 'received'],
      undefined,
      refundUsd,
    );
  }

  async reject(disputeId: string, resolution?: string): Promise<DisputeView> {
    const dispute = await this.disputes.findOne({ where: { id: disputeId } });
    if (!dispute) throw new NotFoundException('Dispute not found.');
    return this.close(
      dispute,
      'rejected',
      'reject',
      String(resolution ?? 'Rejected'),
      ['awaiting_seller', 'seller_replied', 'seller_rejected', 'seller_timeout', 'escalated', 'approved', 'pickup', 'received'],
    );
  }

  // ── Goods back ─────────────────────────────────────────────────────────────

  /**
   * The warehouse confirms the returned goods arrived. A refund on a return needs this first, so money never goes
   * back while the goods are still with the customer. `restock` (the desk's old button) also puts everything back on
   * the shelf as resellable; the logistics scan-in calls {@link onReturnReceived} and grades afterwards.
   */
  async markReceived(disputeId: string, restock = true): Promise<DisputeView> {
    const dispute = await this.disputes.findOne({ where: { id: disputeId } });
    if (!dispute) throw new NotFoundException('Dispute not found.');
    if (dispute.type !== 'return') throw new BadRequestException('Only returns have goods to receive.');
    if (dispute.status !== 'open') throw new BadRequestException('This request was already handled.');
    const wasApproved = dispute.stage === 'approved' || dispute.stage === 'pickup';
    const claim = await this.disputes
      .createQueryBuilder()
      .update(Dispute)
      .set({ receivedAt: new Date(), stage: 'received' })
      .where("id = :id AND receivedAt IS NULL AND status = 'open'", { id: disputeId })
      .execute();
    if (!claim.affected) throw new BadRequestException('These goods were already marked as received.');
    if (restock) await this.gradeEverything(dispute, 'resellable');
    const saved = (await this.disputes.findOne({ where: { id: disputeId } }))!;
    let view = await this.publish(saved, 'dispute:updated');
    await this.notifications.toUser(saved.customerId, {
      title: 'Return received',
      body: `${saved.reference}: we received your goods. Your request is being reviewed.`,
      type: 'return',
      entityId: saved.id,
    });
    await this.tellSellers(saved, await this.sellerUsersOf(saved), 'Returned goods received', `${saved.reference} · ${saved.orderReference}: the warehouse received the returned goods.`);
    // A return the seller (or support) said yes to is paid as soon as the goods are back.
    if (wasApproved) view = await this.settleReturn(saved);
    return view;
  }

  /** The logistics scan-in of the returned goods at the warehouse (grading follows with `grade`). */
  onReturnReceived(disputeId: string): Promise<DisputeView> {
    return this.markReceived(disputeId, false);
  }

  /** Grade the returned goods; the resellable units go back on the seller's shelf. */
  async grade(
    user: Viewer,
    id: string,
    grades: { itemId: string; condition: string; restockQty?: number }[],
    note?: unknown,
  ): Promise<DisputeView> {
    if (user.role !== 'warehouse_staff' && !user.role.startsWith('admin')) throw new BadRequestException('Warehouse staff only.');
    const d = await this.disputes.findOne({ where: { id: String(id ?? '') } });
    if (!d) throw new NotFoundException('Dispute not found.');
    if (d.type !== 'return') throw new BadRequestException('Only returns have goods to grade.');
    if (!d.receivedAt) throw new BadRequestException('Receive the returned goods first.');
    if (d.gradedAt) throw new BadRequestException('These goods were already graded.');
    if (!Array.isArray(grades) || !grades.length) throw new BadRequestException('Grade each returned item.');
    const items = await this.itemsRepo.find({ where: { disputeId: d.id } });
    const byId = new Map(items.map((i) => [i.id, i]));
    for (const g of grades) {
      const item = byId.get(String(g.itemId));
      if (!item) throw new BadRequestException('One of the items is not part of this return.');
      if (!GRADES.includes(g.condition as ReturnCondition)) throw new BadRequestException(`Condition must be one of: ${GRADES.join(', ')}.`);
      const restock = g.restockQty === undefined ? (g.condition === 'resellable' ? item.qty : 0) : Math.trunc(Number(g.restockQty));
      // C-R5: you cannot shelve more than came back, and only resellable units go back.
      if (!Number.isFinite(restock) || restock < 0 || restock > item.qty) throw new BadRequestException(`Put back between 0 and ${item.qty} of "${item.productName}".`);
      if (g.condition !== 'resellable' && restock > 0) throw new BadRequestException('Only resellable goods go back on the shelf.');
    }
    // Claim the grading in one statement, so two clicks restock once.
    const claim = await this.disputes.createQueryBuilder().update(Dispute).set({ gradedAt: new Date() }).where('id = :id AND gradedAt IS NULL', { id: d.id }).execute();
    if (!claim.affected) throw new BadRequestException('These goods were already graded.');
    for (const g of grades) {
      const item = byId.get(String(g.itemId))!;
      const restock = g.restockQty === undefined ? (g.condition === 'resellable' ? item.qty : 0) : Math.trunc(Number(g.restockQty));
      await this.itemsRepo.update({ id: item.id }, { condition: g.condition as ReturnCondition, restockedQty: restock });
      if (restock > 0 && !item.productId.startsWith('ext:')) {
        await this.products.restock(item.productId, restock, { variant: item.variant, orderId: d.orderId, reason: 'return_restock', actorId: user.id });
      }
    }
    // Anything not named is graded the same as resellable only if the desk says so; leave it ungraded otherwise.
    const noteText = text(note, 500);
    if (noteText) {
      await this.messagesRepo.save(this.messagesRepo.create({ disputeId: d.id, authorId: user.id, authorName: user.name ?? 'Warehouse', role: user.role, text: noteText, attachments: null }));
    }
    const saved = (await this.disputes.findOne({ where: { id: d.id } }))!;
    const view = await this.publish(saved, 'dispute:updated');
    await this.tellSellers(saved, await this.sellerUsersOf(saved), 'Returned goods graded', `${saved.reference} · ${saved.orderReference}`);
    return view;
  }

  /** Every returned item gets one grade and its units go back on the shelf (the old "mark received" button). */
  private async gradeEverything(d: Dispute, condition: ReturnCondition): Promise<void> {
    const items = await this.itemsRepo.find({ where: { disputeId: d.id } });
    if (!items.length) {
      // Old requests carry no lines: the whole order went back.
      const order = await this.orders.findOne({ where: { id: d.orderId } });
      for (const item of order?.items ?? []) {
        if (!item.productId.startsWith('ext:') && item.fulfilment !== 'cancelled') {
          await this.products.restock(item.productId, item.qty, { variant: item.variant, orderId: d.orderId, reason: 'return_restock' });
        }
      }
      await this.disputes.update({ id: d.id }, { gradedAt: new Date() });
      return;
    }
    for (const item of items) {
      const restock = condition === 'resellable' ? item.qty : 0;
      await this.itemsRepo.update({ id: item.id }, { condition, restockedQty: restock });
      if (restock > 0 && !item.productId.startsWith('ext:')) {
        await this.products.restock(item.productId, restock, { variant: item.variant, orderId: d.orderId, reason: 'return_restock' });
      }
    }
    await this.disputes.update({ id: d.id }, { gradedAt: new Date() });
  }

  // ── Money for returned goods ───────────────────────────────────────────────

  /** What the returned units are worth (promo share included), per line, never more than is left on that line. */
  private async returnedValue(d: Dispute): Promise<{ total: number; lines: { orderItemId: string; usd: number; disputeItemId: string }[] }> {
    const order = await this.orders.findOne({ where: { id: d.orderId } });
    const items = await this.itemsRepo.find({ where: { disputeId: d.id } });
    if (!order) return { total: 0, lines: [] };
    // Old requests carry no lines: the whole order's goods.
    const units = items.length
      ? items.map((i) => ({ disputeItemId: i.id, orderItemId: i.orderItemId, unitPriceUsd: i.unitPriceUsd, qty: i.qty }))
      : (order.items ?? []).filter((i) => i.fulfilment !== 'cancelled').map((i) => ({ disputeItemId: '', orderItemId: i.id, unitPriceUsd: i.priceUsd, qty: i.qty }));
    const lines = units.map((u) => {
      const line = (order.items ?? []).find((i) => i.id === u.orderItemId);
      const worth = PartialRefundService.worth(order, [u]);
      const room = line ? Math.max(0, cents(line.priceUsd * line.qty - (line.refundedUsd ?? 0))) : worth;
      return { orderItemId: u.orderItemId, usd: Math.min(worth, room), disputeItemId: u.disputeItemId };
    });
    return { total: cents(lines.reduce((t, l) => t + l.usd, 0)), lines };
  }

  /** Pay back the returned items only (never more than is left on the payment). */
  private async refundReturnedItems(d: Dispute): Promise<{ refundedUsd: number; to: 'wallet' | 'phone' }> {
    const value = await this.returnedValue(d);
    const left = await this.refunds.outstanding(d.orderId);
    const amount = cents(Math.min(value.total, left));
    if (!(amount > 0)) throw new BadRequestException('There is nothing left to refund for these items.');
    // Shrink each line pro rata if the payment holds less than the goods are worth.
    const k = value.total > 0 ? amount / value.total : 1;
    const lines = value.lines.map((l) => ({ orderItemId: l.orderItemId, usd: cents(l.usd * k) }));
    const done = await this.refunds.refund({
      orderId: d.orderId,
      amountUsd: amount,
      toWallet: d.refundTo !== 'phone',
      memo: `Refund for ${d.orderReference} (returned items)`,
      lines,
    });
    for (const l of value.lines) if (l.disputeItemId) await this.itemsRepo.update({ id: l.disputeItemId }, { refundUsd: cents(l.usd * k) });
    await this.markOrderReturned(d.orderId);
    return { refundedUsd: done.refundedUsd, to: done.to };
  }

  /** A delivered order whose every unit was returned becomes `returned`. */
  private async markOrderReturned(orderId: string): Promise<void> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order || order.status !== 'delivered') return;
    const taken = await this.requestedQty(orderId);
    const live = (order.items ?? []).filter((i) => i.fulfilment !== 'cancelled' && !i.productId.startsWith('ext:'));
    if (!live.length || !live.every((i) => (taken.get(i.id) ?? 0) >= i.qty)) return;
    order.status = 'returned';
    await this.orders.save(order);
    this.emitter.toUser(order.customerId, 'order:updated', order);
    pushOrderToOps(this.emitter, ADMIN_ROLES, 'order:updated', order);
  }

  /** Goods are back on an approved return: refund the items and close the request. On failure it waits for finance. */
  private async settleReturn(d: Dispute): Promise<DisputeView> {
    try {
      const paid = await this.refundReturnedItems(d);
      return await this.close(
        (await this.disputes.findOne({ where: { id: d.id } }))!,
        'resolved',
        'return_refund',
        'Refunded to wallet',
        ['received', 'approved', 'pickup'],
        undefined,
        paid.refundedUsd,
      );
    } catch (e) {
      this.logger.warn(`Refund of return ${d.reference} failed: ${(e as Error).message}`);
      await this.notifications.toRole('admin_finance', { title: 'Return refund failed', body: `${d.reference} · ${d.orderReference}: ${(e as Error).message}`, type: 'return', entityId: d.id });
      return (await this.present([(await this.disputes.findOne({ where: { id: d.id } }))!]))[0];
    }
  }

  // ── Time limits ────────────────────────────────────────────────────────────

  /** Returns the seller never answered move to `seller_timeout`: the customer may now escalate. */
  async sweep(now = new Date()): Promise<number> {
    const due = await this.disputes
      .createQueryBuilder('d')
      .where("d.type = 'return' AND d.status = 'open' AND d.stage = 'awaiting_seller' AND d.sellerDueAt IS NOT NULL AND d.sellerDueAt < :now", { now })
      .take(100)
      .getMany();
    let moved = 0;
    for (const d of due) {
      const res = await this.disputes
        .createQueryBuilder()
        .update(Dispute)
        .set({ stage: 'seller_timeout' })
        .where("id = :id AND stage = 'awaiting_seller' AND status = 'open'", { id: d.id })
        .execute();
      if (!res.affected) continue;
      moved++;
      const saved = (await this.disputes.findOne({ where: { id: d.id } }))!;
      await this.publish(saved, 'dispute:updated');
      const body = `${saved.reference} · ${saved.orderReference}`;
      await this.notifications.toUser(saved.customerId, { title: 'Seller did not respond', body, type: 'return', entityId: saved.id });
      await this.tellSellers(saved, await this.sellerUsersOf(saved), 'Seller did not respond', body);
      await this.notifications.toRole('admin_support', { title: 'Seller did not respond', body, type: 'return', entityId: saved.id });
    }
    return moved;
  }

  private static newReference(type: DisputeType): string {
    const prefix = type === 'return' ? 'RET' : 'DP';
    const n = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${Date.now().toString().slice(-6)}${n}`.slice(0, 24);
  }
}
