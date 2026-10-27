import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Dispute, DisputeItem, Order, OrderItem, Replacement, Seller } from '../database/entities';
import type { ReplacementStatus } from '../database/entities';
import { ADMIN_ROLES, NotificationsService } from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ProductsService } from '../products/products.service';
import { SettingsService } from '../content/settings.service';
import { cleanAttachments, parseAttachments, redactForSeller, storeAttachments } from '../common/attachments';
import { LogisticsBridge } from '../after-sale/logistics-bridge';
import { REPLACEMENT_NEXT, assertStep, sellerForItem, sellerKeys } from './after-sale';
import { AfterSaleNames } from './after-sale-names';

const OPS_ROLES = [...ADMIN_ROLES, 'warehouse_staff'];
const HOUR_MS = 3_600_000;
const STALE = 'This replacement was just updated by someone else. Refresh and try again.';
/** Statuses a delivery can move on to `delivered`. */
const IN_PROGRESS: ReplacementStatus[] = ['approved', 'received', 'allocated', 'dispatched'];

/**
 * A replacement as clients receive it: the stored fields plus the item's name in French (null when it cannot be told)
 * and the customer's photos. `reason` / `condition` are the customer's own words and are never translated.
 */
export type ReplacementView = Omit<Replacement, 'attachments'> & { productNameFr: string | null; attachments: string[] };

/** Like-for-like replacements of defective/returned items. */
@Injectable()
export class ReplacementsService {
  constructor(
    @InjectRepository(Replacement)
    private readonly replacements: Repository<Replacement>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
    private readonly products: ProductsService,
    private readonly names: AfterSaleNames,
    private readonly settings: SettingsService,
    private readonly logistics: LogisticsBridge,
  ) {}

  /** Rows with the French name of their item, looked up for all of them at once. */
  private async serve(rows: Replacement[]): Promise<ReplacementView[]> {
    const fr = await this.names.frenchNames(rows.map((r) => ({ orderId: r.orderId, sku: r.sku, name: r.productName })));
    return rows.map((r, i) => ({ ...r, attachments: parseAttachments(r.attachments), productNameFr: fr[i] }));
  }

  async list(user: { id: string; role: string }, paging?: { limit?: number; offset?: number; status?: string }): Promise<ReplacementView[]> {
    const take = Math.min(1000, Math.max(1, Math.floor(Number(paging?.limit) || (user.role.startsWith('admin') || user.role === 'warehouse_staff' ? 200 : 500))));
    const skip = Math.max(0, Math.floor(Number(paging?.offset) || 0));
    const status = paging?.status ? ({ status: paging.status as ReplacementStatus } as const) : {};
    // Ops (admin roles, warehouse) see all; a seller sees requests about their items (and any they filed);
    // everyone else only their own.
    if (user.role.startsWith('admin') || user.role === 'warehouse_staff') {
      return this.serve(await this.replacements.find({ where: status, order: { createdAt: 'DESC' }, take, skip }));
    }
    if (user.role === 'seller') {
      const keys = await sellerKeys(user.id, this.sellers);
      const rows = await this.serve(
        await this.replacements.find({
          where: [{ sellerId: In(keys), ...status }, { customerId: user.id, ...status }],
          order: { createdAt: 'DESC' },
          take,
          skip,
        }),
      );
      return rows.map((r) => redactForSeller(r, user.id));
    }
    return this.serve(await this.replacements.find({ where: { customerId: user.id, ...status }, order: { createdAt: 'DESC' }, take, skip }));
  }

  /** What this person asked for as a customer (a seller who also shops gets their purchases, not their store's requests). */
  async mine(userId: string, paging?: { limit?: number; offset?: number; status?: string }): Promise<ReplacementView[]> {
    const take = Math.min(1000, Math.max(1, Math.floor(Number(paging?.limit) || 500)));
    const skip = Math.max(0, Math.floor(Number(paging?.offset) || 0));
    const status = paging?.status ? ({ status: paging.status as ReplacementStatus } as const) : {};
    return this.serve(await this.replacements.find({ where: { customerId: userId, ...status }, order: { createdAt: 'DESC' }, take, skip }));
  }

  /** One replacement, for the customer who asked, the seller whose item it is, or staff. */
  async get(user: { id: string; role: string }, id: string): Promise<ReplacementView> {
    const rep = await this.replacements.findOne({ where: { id: String(id ?? '') } });
    const keys = user.role === 'seller' ? await sellerKeys(user.id, this.sellers) : [];
    const allowed = !!rep && (user.role.startsWith('admin') || user.role === 'warehouse_staff' || rep.customerId === user.id || (!!rep.sellerId && keys.includes(rep.sellerId)));
    if (!rep || !allowed) throw new NotFoundException('Replacement not found.');
    const [view] = await this.serve([rep]);
    return user.role === 'seller' ? redactForSeller(view, user.id) : view;
  }

  /** The seller account behind a replacement (null when the item's seller is unknown). */
  private async sellerUserOf(rep: Pick<Replacement, 'sellerId'>): Promise<string | null> {
    if (!rep.sellerId) return null;
    const store = await this.sellers.findOne({ where: { id: rep.sellerId } });
    return store?.userId ?? rep.sellerId;
  }

  /** Tell everyone who follows a replacement that it changed. */
  private async publish(rep: ReplacementView): Promise<void> {
    this.emitter.toRoles(OPS_ROLES, 'replacement:updated', rep);
    if (rep.customerId) this.emitter.toUser(rep.customerId, 'replacement:updated', rep);
    const sellerUser = await this.sellerUserOf(rep);
    if (sellerUser) this.emitter.toUser(sellerUser, 'replacement:updated', redactForSeller(rep));
  }

  async create(
    actor: { id: string; name: string; role: string },
    input: {
      orderId: string;
      /** The order line's id (`order.items[].id`): replaces `sku` / `productName` and tells two options of one product apart. */
      itemId?: string;
      sku?: string;
      productName?: string;
      reason?: string;
      condition?: string;
      qty?: number;
      attachments?: unknown;
    },
  ): Promise<ReplacementView> {
    const order = await this.orders.findOne({ where: { id: String(input?.orderId ?? '') } });
    const ops = actor.role.startsWith('admin') || actor.role === 'warehouse_staff';
    // Customers may only file for their own DELIVERED orders; ops for any.
    if (!order || (!ops && (order.customerId !== actor.id || order.status !== 'delivered'))) {
      throw new NotFoundException('Order not found or not eligible for a replacement.');
    }
    const live = (order.items ?? []).filter((i) => i.fulfilment !== 'cancelled');
    const byId = input.itemId ? live.find((i) => i.id === String(input.itemId)) : undefined;
    if (input.itemId && !byId) throw new BadRequestException('That item is not on this order.');
    const skuIn = input.sku ?? byId?.productId;
    const nameIn = input.productName ?? byId?.productName;
    if (!String(skuIn ?? '').trim() || !String(nameIn ?? '').trim()) {
      throw new BadRequestException('Say which item needs replacing.');
    }
    const sku = String(skuIn).trim();
    const line = byId ?? live.find((i) => i.productId === sku);
    // C-X1: a customer can only ask for a replacement of something that was on the order.
    if (!ops && !line) throw new BadRequestException('That item is not on this order.');
    const qty = Math.max(1, Math.min(line?.qty ?? 99, Math.trunc(Number(input.qty) || 1)));
    // C-X2: one open request per item.
    const open = await this.replacements.count({
      where: { orderId: order.id, sku, status: In(['requested', 'approved', 'received', 'allocated', 'dispatched'] as ReplacementStatus[]) },
    });
    if (open) throw new BadRequestException('You already asked for a replacement of this item.');
    const photos = cleanAttachments(input.attachments);
    const seller = await sellerForItem(order, sku, this.products, this.sellers);
    const hours = Number(await this.settings.get('sellerResponseHours'));
    const saved = await this.replacements.save(
      this.replacements.create({
        reference: `REP-${Date.now().toString().slice(-8)}`,
        sellerId: seller?.sellerId ?? null,
        orderId: order.id,
        orderReference: order.reference,
        customerId: order.customerId,
        customerName: order.customerName,
        sku: sku.slice(0, 100),
        productName: String(nameIn).slice(0, 200),
        reason: input.reason ? String(input.reason).slice(0, 1000) : null,
        condition: input.condition ? String(input.condition).slice(0, 100) : null,
        qty,
        variant: line?.variant ?? null,
        attachments: storeAttachments(photos),
        sellerDueAt: new Date(Date.now() + (Number.isFinite(hours) && hours > 0 ? hours : 48) * HOUR_MS),
        status: 'requested',
        dispatchStatus: 'pending',
      }),
    );
    const [rep] = await this.serve([saved]);
    await this.publish(rep);
    if (seller) {
      await this.notifications.toUser(seller.userId, {
        title: 'Replacement requested on your item',
        body: `${rep.reference} · ${order.reference} · ${rep.productName}${rep.reason ? `: ${rep.reason.slice(0, 120)}` : ''}`,
        type: 'replacement',
        entityId: rep.id,
      });
    }
    return rep;
  }

  /** The seller (or support, on their behalf) approves or rejects a replacement. */
  async respond(actor: { id: string; role: string }, id: string, approve: boolean, rawReason: unknown): Promise<ReplacementView> {
    const rep = await this.replacements.findOne({ where: { id: String(id ?? '') } });
    const keys = actor.role === 'seller' ? await sellerKeys(actor.id, this.sellers) : [];
    const mine = !!rep && actor.role === 'seller' && !!rep.sellerId && keys.includes(rep.sellerId);
    if (!rep || !(mine || actor.role.startsWith('admin'))) throw new NotFoundException('Replacement not found.');
    if (rep.status !== 'requested') throw new BadRequestException('This request was already handled.');
    const reason = String(rawReason ?? '').trim().slice(0, 1000);
    if (!approve && reason.length < 5) throw new BadRequestException('Tell the customer why you are rejecting this replacement.');
    return this.move(rep, approve ? 'approved' : 'rejected', reason);
  }

  /** Warehouse / admin steps (the desk buttons). Approving and rejecting go through the same path as the seller's. */
  async setStatus(id: string, status: ReplacementStatus): Promise<ReplacementView> {
    const rep = await this.replacements.findOne({ where: { id } });
    if (!rep) throw new NotFoundException('Replacement not found.');
    assertStep(REPLACEMENT_NEXT, rep.status, status);
    return this.move(rep, status, '');
  }

  /** One step: claim it in a single statement, do what the step needs, tell everyone. */
  private async move(rep: Replacement, status: ReplacementStatus, reason: string): Promise<ReplacementView> {
    assertStep(REPLACEMENT_NEXT, rep.status, status);
    const patch: Partial<Replacement> = { status };
    if (status === 'allocated') patch.dispatchStatus = 'ready';
    if (status === 'dispatched') patch.dispatchStatus = 'dispatched';
    if (status === 'delivered') {
      patch.dispatchStatus = 'delivered';
      patch.deliveredAt = new Date();
    }
    if (status === 'approved' || status === 'rejected') {
      patch.sellerRespondedAt = new Date();
      patch.sellerReason = reason || null;
    }
    // One conditional update, so two clicks at once can't both move it.
    const claim = await this.replacements
      .createQueryBuilder()
      .update(Replacement)
      .set(patch as never)
      .where('id = :id AND status = :from', { id: rep.id, from: rep.status })
      .execute();
    if (!claim.affected) throw new BadRequestException(STALE);
    if (status === 'approved') {
      const ready = await this.takeStockAndSend(rep);
      if (ready !== true) {
        // Out of stock: put the request back so the seller can restock or reject.
        await this.replacements.update({ id: rep.id }, { status: 'requested', dispatchStatus: 'pending', sellerRespondedAt: null, sellerReason: null });
        throw new BadRequestException(ready);
      }
    }
    if (status === 'rejected' && rep.stockTaken > 0 && !rep.sku.startsWith('ext:')) {
      await this.products.restock(rep.sku, rep.stockTaken, { variant: rep.variant, orderId: rep.orderId, reason: 'replacement' });
      await this.replacements.update({ id: rep.id }, { stockTaken: 0 });
    }
    const [saved] = await this.serve([(await this.replacements.findOne({ where: { id: rep.id } }))!]);
    await this.publish(saved);
    await this.tell(saved, status, reason);
    return saved;
  }

  /** The new unit comes from the seller's stock; then logistics is asked to deliver it (and fetch the old one). */
  private async takeStockAndSend(rep: Replacement): Promise<true | string> {
    if (!rep.sku.startsWith('ext:') && (await this.products.getRaw(rep.sku))) {
      if (!(await this.products.reserve(rep.sku, rep.qty, { variant: rep.variant, orderId: rep.orderId, reason: 'replacement' }))) {
        return 'Not enough stock to send a replacement. Restock the item or reject the request.';
      }
      await this.replacements.update({ id: rep.id }, { stockTaken: rep.qty });
    }
    const task = await this.logistics.replacementDelivery({ replacementId: rep.id, orderId: rep.orderId });
    if (task) await this.replacements.update({ id: rep.id }, { deliveryTaskId: task.id, dispatchStatus: 'ready' });
    return true;
  }

  private async tell(rep: ReplacementView, status: ReplacementStatus, reason: string): Promise<void> {
    const sellerUser = await this.sellerUserOf(rep);
    if (sellerUser) {
      await this.notifications.toUser(sellerUser, {
        title: `Replacement ${status}`,
        body: `${rep.reference} · ${rep.orderReference} · ${rep.productName}`,
        type: 'replacement',
        entityId: rep.id,
      });
    }
    if (rep.customerId) {
      await this.notifications.toUser(rep.customerId, {
        title: `Replacement ${status}`,
        body: `${rep.reference}: ${rep.productName}${reason ? ` — ${reason}` : ''}`,
        type: 'replacement',
        entityId: rep.id,
      });
    }
    if (status === 'approved') {
      await this.notifications.toRole('warehouse_staff', {
        title: 'Replacement approved',
        body: `${rep.reference} · ${rep.productName}`,
        type: 'replacement',
        entityId: rep.id,
      });
    }
  }

  /** The delivery task of a replacement moved (logistics calls this): picked up → dispatched, delivered → delivered. */
  async syncFromDelivery(id: string, taskStatus: 'picked_up' | 'in_transit' | 'delivered' | 'failed'): Promise<ReplacementView | null> {
    const rep = await this.replacements.findOne({ where: { id } });
    if (!rep) return null;
    if (taskStatus === 'delivered' && IN_PROGRESS.includes(rep.status)) {
      // Walk the missing steps in one go so the history stays valid.
      return this.forceStatus(rep, 'delivered');
    }
    if ((taskStatus === 'picked_up' || taskStatus === 'in_transit') && ['approved', 'received', 'allocated'].includes(rep.status)) {
      return this.forceStatus(rep, 'dispatched');
    }
    return (await this.serve([rep]))[0];
  }

  private async forceStatus(rep: Replacement, status: ReplacementStatus): Promise<ReplacementView> {
    const patch: Partial<Replacement> = { status, dispatchStatus: status === 'delivered' ? 'delivered' : 'dispatched', ...(status === 'delivered' ? { deliveredAt: new Date() } : {}) };
    const claim = await this.replacements.createQueryBuilder().update(Replacement).set(patch as never).where('id = :id AND status = :from', { id: rep.id, from: rep.status }).execute();
    const [saved] = await this.serve([(await this.replacements.findOne({ where: { id: rep.id } }))!]);
    if (claim.affected) {
      await this.publish(saved);
      await this.tell(saved, status, '');
    }
    return saved;
  }

  /**
   * An admin decided on a replacement while closing a dispute: one replacement per item (the dispute's own, or the
   * ones the admin names), already approved, stock taken, delivery requested.
   */
  async createFromDispute(dispute: Dispute, picks?: { itemId?: string; qty?: number }[]): Promise<ReplacementView[]> {
    const order = await this.orders.findOne({ where: { id: dispute.orderId } });
    if (!order) throw new NotFoundException('Order not found.');
    const disputeItems = await this.replacements.manager.find(DisputeItem, { where: { disputeId: dispute.id } });
    const live = (order.items ?? []).filter((i) => i.fulfilment !== 'cancelled' && !i.productId.startsWith('ext:'));
    let wanted: { line: OrderItem; qty: number }[] = [];
    if (picks?.length) {
      wanted = picks.map((p) => {
        const line = live.find((i) => i.id === p.itemId);
        if (!line) throw new BadRequestException('One of the items is not on this order.');
        return { line, qty: Math.max(1, Math.min(line.qty, Math.trunc(Number(p.qty) || line.qty))) };
      });
    } else if (disputeItems.length) {
      wanted = disputeItems.map((d) => ({ line: live.find((i) => i.id === d.orderItemId)!, qty: d.qty })).filter((w) => w.line);
    } else if (live.length === 1) {
      wanted = [{ line: live[0], qty: live[0].qty }];
    }
    if (!wanted.length) throw new BadRequestException('Pick the item to replace.');
    const out: ReplacementView[] = [];
    for (const w of wanted) {
      const seller = await sellerForItem(order, w.line.productId, this.products, this.sellers);
      const saved = await this.replacements.save(
        this.replacements.create({
          reference: `REP-${Date.now().toString().slice(-8)}${out.length || ''}`.slice(0, 24),
          sellerId: seller?.sellerId ?? null,
          orderId: order.id,
          orderReference: order.reference,
          customerId: order.customerId,
          customerName: order.customerName,
          sku: w.line.productId,
          productName: w.line.productName,
          reason: dispute.reason.slice(0, 1000),
          condition: null,
          qty: w.qty,
          variant: w.line.variant,
          attachments: dispute.attachments,
          status: 'requested',
          dispatchStatus: 'pending',
          disputeId: dispute.id,
        }),
      );
      // It is the admin's decision: approve at once (the same path as an approval by the seller).
      out.push(await this.move(saved, 'approved', ''));
    }
    return out;
  }
}
