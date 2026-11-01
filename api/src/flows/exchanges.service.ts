import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Exchange, Order, Seller } from '../database/entities';
import type { ExchangeStatus } from '../database/entities';
import { ADMIN_ROLES, NotificationsService } from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ProductsService } from '../products/products.service';
import { SettingsService } from '../content/settings.service';
import { WalletService } from '../wallet/wallet.service';
import { checkVariant, storedVariantGroups } from '../common/variants/variants';
import { cleanAttachments, parseAttachments, redactForSeller, storeAttachments } from '../common/attachments';
import { LogisticsBridge } from '../after-sale/logistics-bridge';
import { EXCHANGE_NEXT, assertStep, sellerForItem, sellerKeys } from './after-sale';
import { AfterSaleNames } from './after-sale-names';

const OPS_ROLES = [...ADMIN_ROLES, 'warehouse_staff'];
const HOUR_MS = 3_600_000;
const cents = (n: number) => Number(n.toFixed(2));
const STALE = 'This exchange was just updated by someone else. Refresh and try again.';
const OPEN: ExchangeStatus[] = ['requested', 'approved', 'received', 'ready', 'dispatched'];

/**
 * An exchange as clients receive it: the stored fields plus the two items' names in French (null when it cannot be
 * told, e.g. `toName` is what the customer typed). `reason` is the customer's own words and is never translated.
 */
export type ExchangeView = Omit<Exchange, 'attachments'> & { fromNameFr: string | null; toNameFr: string | null; attachments: string[] };

/** Exchange one purchased item for another variant/product. */
@Injectable()
export class ExchangesService {
  constructor(
    @InjectRepository(Exchange) private readonly exchanges: Repository<Exchange>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
    private readonly products: ProductsService,
    private readonly names: AfterSaleNames,
    private readonly wallet: WalletService,
    private readonly settings: SettingsService,
    private readonly logistics: LogisticsBridge,
  ) {}

  /** Rows with the French names of their items, looked up for all of them at once. */
  private async serve(rows: Exchange[]): Promise<ExchangeView[]> {
    const fr = await this.names.frenchNames(
      rows.flatMap((x) => [
        { orderId: x.orderId, sku: x.fromSku, name: x.fromName },
        { orderId: x.orderId, sku: x.toSku, name: x.toName },
      ]),
    );
    return rows.map((x, i) => ({ ...x, attachments: parseAttachments(x.attachments), fromNameFr: fr[2 * i], toNameFr: fr[2 * i + 1] }));
  }

  async list(user: { id: string; role: string }, paging?: { limit?: number; offset?: number; status?: string }): Promise<ExchangeView[]> {
    const ops = user.role.startsWith('admin') || user.role === 'warehouse_staff';
    const take = Math.min(1000, Math.max(1, Math.floor(Number(paging?.limit) || (ops ? 200 : 500))));
    const skip = Math.max(0, Math.floor(Number(paging?.offset) || 0));
    const status = paging?.status ? ({ status: paging.status as ExchangeStatus } as const) : {};
    if (ops) return this.serve(await this.exchanges.find({ where: status, order: { createdAt: 'DESC' }, take, skip }));
    // A seller sees exchanges of their items (and any they filed as a customer).
    if (user.role === 'seller') {
      const keys = await sellerKeys(user.id, this.sellers);
      const rows = await this.serve(
        await this.exchanges.find({
          where: [{ sellerId: In(keys), ...status }, { customerId: user.id, ...status }],
          order: { createdAt: 'DESC' },
          take,
          skip,
        }),
      );
      return rows.map((r) => redactForSeller(r, user.id));
    }
    return this.serve(await this.exchanges.find({ where: { customerId: user.id, ...status }, order: { createdAt: 'DESC' }, take, skip }));
  }

  /** What this person asked for as a customer. */
  async mine(userId: string, paging?: { limit?: number; offset?: number; status?: string }): Promise<ExchangeView[]> {
    const take = Math.min(1000, Math.max(1, Math.floor(Number(paging?.limit) || 500)));
    const skip = Math.max(0, Math.floor(Number(paging?.offset) || 0));
    const status = paging?.status ? ({ status: paging.status as ExchangeStatus } as const) : {};
    return this.serve(await this.exchanges.find({ where: { customerId: userId, ...status }, order: { createdAt: 'DESC' }, take, skip }));
  }

  async get(user: { id: string; role: string }, id: string): Promise<ExchangeView> {
    const ex = await this.exchanges.findOne({ where: { id: String(id ?? '') } });
    const keys = user.role === 'seller' ? await sellerKeys(user.id, this.sellers) : [];
    const allowed = !!ex && (user.role.startsWith('admin') || user.role === 'warehouse_staff' || ex.customerId === user.id || (!!ex.sellerId && keys.includes(ex.sellerId)));
    if (!ex || !allowed) throw new NotFoundException('Exchange not found.');
    const [view] = await this.serve([ex]);
    return user.role === 'seller' ? redactForSeller(view, user.id) : view;
  }

  /** The seller account behind an exchange (null when the item's seller is unknown). */
  private async sellerUserOf(ex: Pick<Exchange, 'sellerId'>): Promise<string | null> {
    if (!ex.sellerId) return null;
    const store = await this.sellers.findOne({ where: { id: ex.sellerId } });
    return store?.userId ?? ex.sellerId;
  }

  private async publish(ex: ExchangeView): Promise<void> {
    this.emitter.toRoles(OPS_ROLES, 'exchange:updated', ex);
    if (ex.customerId) this.emitter.toUser(ex.customerId, 'exchange:updated', ex);
    const sellerUser = await this.sellerUserOf(ex);
    if (sellerUser) this.emitter.toUser(sellerUser, 'exchange:updated', redactForSeller(ex));
  }

  async create(
    actor: { id: string; name: string; role: string },
    input: {
      orderId: string;
      /** The order line's id (`order.items[].id`): replaces `fromSku` / `fromName` and tells two options of one product apart. */
      itemId?: string;
      fromSku?: string;
      fromName?: string;
      toSku: string;
      toName: string;
      toVariant?: string;
      qty?: number;
      priceDiffUsd?: number;
      reason?: string;
      /** Photos of the item (upload URLs, at most 6). */
      attachments?: unknown;
    },
  ): Promise<ExchangeView> {
    const order = await this.orders.findOne({ where: { id: String(input?.orderId ?? '') } });
    const ops = actor.role.startsWith('admin') || actor.role === 'warehouse_staff';
    if (!order || (!ops && (order.customerId !== actor.id || order.status !== 'delivered'))) {
      throw new NotFoundException('Order not found or not eligible for an exchange.');
    }
    const live = (order.items ?? []).filter((i) => i.fulfilment !== 'cancelled');
    const byId = input.itemId ? live.find((i) => i.id === String(input.itemId)) : undefined;
    if (input.itemId && !byId) throw new BadRequestException('That item is not on this order.');
    const named = { fromSku: input.fromSku ?? byId?.productId, fromName: input.fromName ?? byId?.productName, toSku: input.toSku, toName: input.toName };
    for (const k of ['fromSku', 'fromName', 'toSku', 'toName'] as const) {
      if (!String(named[k] ?? '').trim()) throw new BadRequestException('Say which item you want to exchange and for what.');
    }
    const fromSku = String(named.fromSku).trim();
    const toSku = String(named.toSku).trim();
    const line = byId ?? live.find((i) => i.productId === fromSku);
    const photos = cleanAttachments(input.attachments);
    // C-X1: a customer can only exchange something that was on the order.
    if (!ops && !line) throw new BadRequestException('That item is not on this order.');
    const qty = Math.max(1, Math.min(line?.qty ?? 99, Math.trunc(Number(input.qty) || 1)));
    // C-X2: one open exchange per item.
    if (await this.exchanges.count({ where: { orderId: order.id, fromSku, status: In(OPEN) } })) {
      throw new BadRequestException('You already asked to exchange this item.');
    }

    // The new item: its option (the label the order line would carry) and the price difference, worked out here.
    const target = toSku.startsWith('ext:') ? null : await this.products.getRaw(toSku);
    let toVariant: string | null = null;
    let diff = 0;
    if (target) {
      if (target.status !== 'live') throw new BadRequestException('That product is no longer available.');
      const groups = storedVariantGroups(target.variants);
      // A customer must choose the option; staff may file without one (older desks) and settle it by hand.
      if (groups.length && (!ops || input.toVariant)) {
        toVariant = checkVariant(groups, input.toVariant, target.name);
        if (toSku === fromSku && toVariant === line?.variant) throw new BadRequestException('Choose a different option to exchange for.');
      }
      if ((await this.products.availableFor(toSku, toVariant)) < qty) throw new BadRequestException('Not enough stock of that item for an exchange.');
      const unit = (await this.products.get(toSku))?.price ?? target.price;
      diff = cents((unit - (line?.priceUsd ?? unit)) * qty);
    } else if (ops) {
      // Ops may settle an item that is not in the catalogue by hand.
      diff = Number.isFinite(Number(input.priceDiffUsd)) ? Math.max(-100000, Math.min(100000, cents(Number(input.priceDiffUsd)))) : 0;
    }
    // (An item that is not in the catalogue, asked for by a customer, is free text: no price, no stock; staff settle it.)

    const seller = await sellerForItem(order, fromSku, this.products, this.sellers);
    const hours = Number(await this.settings.get('sellerResponseHours'));
    const saved = await this.exchanges.manager.transaction(async (m) => {
      const ex = await m.save(
        m.create(Exchange, {
          reference: `EXC-${Date.now().toString().slice(-8)}`,
          sellerId: seller?.sellerId ?? null,
          orderId: order.id,
          orderReference: order.reference,
          customerId: order.customerId,
          customerName: order.customerName,
          fromSku: fromSku.slice(0, 100),
          fromName: String(named.fromName).slice(0, 200),
          toSku: toSku.slice(0, 100),
          toName: String(named.toName).slice(0, 200),
          attachments: storeAttachments(photos),
          qty,
          fromVariant: line?.variant ?? null,
          toVariant,
          priceDiffUsd: diff,
          heldUsd: !ops && diff > 0 ? diff : 0,
          reason: input.reason ? String(input.reason).slice(0, 1000) : null,
          sellerDueAt: new Date(Date.now() + (Number.isFinite(hours) && hours > 0 ? hours : 48) * HOUR_MS),
          status: 'requested',
        }),
      );
      // C-X3: the customer pays a price difference up front, from the wallet; it comes back if the exchange is refused.
      // (An exchange filed by staff moves no money: finance settles it.)
      if (!ops && diff > 0) {
        try {
          await this.wallet.apply(order.customerId, 'debit', diff, `Exchange ${ex.reference}: price difference`, m);
        } catch (e) {
          if (/Insufficient/i.test((e as Error).message)) {
            throw new BadRequestException(`Your wallet balance is too low for the price difference ($${diff.toFixed(2)}). Top up your wallet and try again.`);
          }
          throw e;
        }
      }
      return ex;
    });
    const [ex] = await this.serve([saved]);
    await this.publish(ex);
    if (seller) {
      await this.notifications.toUser(seller.userId, {
        title: 'Exchange requested on your item',
        body: `${ex.reference} · ${order.reference}: ${ex.fromName} → ${ex.toName}`,
        type: 'exchange',
        entityId: ex.id,
      });
    }
    return ex;
  }

  /** The seller (or support, on their behalf) approves or rejects an exchange. */
  async respond(actor: { id: string; role: string }, id: string, approve: boolean, rawReason: unknown): Promise<ExchangeView> {
    const ex = await this.exchanges.findOne({ where: { id: String(id ?? '') } });
    const keys = actor.role === 'seller' ? await sellerKeys(actor.id, this.sellers) : [];
    const mine = !!ex && actor.role === 'seller' && !!ex.sellerId && keys.includes(ex.sellerId);
    if (!ex || !(mine || actor.role.startsWith('admin'))) throw new NotFoundException('Exchange not found.');
    if (ex.status !== 'requested') throw new BadRequestException('This request was already handled.');
    const reason = String(rawReason ?? '').trim().slice(0, 1000);
    if (!approve && reason.length < 5) throw new BadRequestException('Tell the customer why you are rejecting this exchange.');
    return this.move(ex, approve ? 'approved' : 'rejected', reason);
  }

  async setStatus(id: string, status: ExchangeStatus): Promise<ExchangeView> {
    const ex = await this.exchanges.findOne({ where: { id } });
    if (!ex) throw new NotFoundException('Exchange not found.');
    assertStep(EXCHANGE_NEXT, ex.status, status);
    return this.move(ex, status, '');
  }

  private async move(ex: Exchange, status: ExchangeStatus, reason: string): Promise<ExchangeView> {
    assertStep(EXCHANGE_NEXT, ex.status, status);
    const patch: Partial<Exchange> = { status };
    if (status === 'delivered') patch.deliveredAt = new Date();
    if (status === 'approved' || status === 'rejected') {
      patch.sellerRespondedAt = new Date();
      patch.sellerReason = reason || null;
    }
    const claim = await this.exchanges
      .createQueryBuilder()
      .update(Exchange)
      .set(patch as never)
      .where('id = :id AND status = :from', { id: ex.id, from: ex.status })
      .execute();
    if (!claim.affected) throw new BadRequestException(STALE);
    if (status === 'approved') {
      const ready = await this.takeStockAndSend(ex);
      if (ready !== true) {
        await this.exchanges.update({ id: ex.id }, { status: 'requested', sellerRespondedAt: null, sellerReason: null });
        throw new BadRequestException(ready);
      }
    }
    if (status === 'rejected') await this.giveBack(ex);
    if (status === 'delivered') await this.settleDifference(ex);
    const [saved] = await this.serve([(await this.exchanges.findOne({ where: { id: ex.id } }))!]);
    await this.publish(saved);
    await this.tell(saved, status, reason);
    return saved;
  }

  /** The new item comes from the seller's stock; then logistics is asked to deliver it (and fetch the old one). */
  private async takeStockAndSend(ex: Exchange): Promise<true | string> {
    if (!ex.toSku.startsWith('ext:') && (await this.products.getRaw(ex.toSku))) {
      if (!(await this.products.reserve(ex.toSku, ex.qty, { variant: ex.toVariant, orderId: ex.orderId, reason: 'replacement' }))) {
        return 'Not enough stock for this exchange. Restock the item or reject the request.';
      }
      await this.exchanges.update({ id: ex.id }, { stockTaken: ex.qty });
    }
    const task = await this.logistics.replacementDelivery({ exchangeId: ex.id, orderId: ex.orderId });
    if (task) await this.exchanges.update({ id: ex.id }, { deliveryTaskId: task.id });
    return true;
  }

  /** A refused exchange returns what it held: the price difference and the reserved stock (each exactly once). */
  private async giveBack(ex: Exchange): Promise<void> {
    if (ex.stockTaken > 0 && !ex.toSku.startsWith('ext:')) {
      const freed = await this.exchanges.createQueryBuilder().update(Exchange).set({ stockTaken: 0 }).where('id = :id AND stockTaken > 0', { id: ex.id }).execute();
      if (freed.affected) await this.products.restock(ex.toSku, ex.stockTaken, { variant: ex.toVariant, orderId: ex.orderId, reason: 'replacement' });
    }
    if (ex.heldUsd > 0 && ex.customerId) {
      const freed = await this.exchanges.createQueryBuilder().update(Exchange).set({ heldUsd: 0 }).where('id = :id AND heldUsd > 0', { id: ex.id }).execute();
      if (freed.affected) await this.wallet.apply(ex.customerId, 'refund', ex.heldUsd, `Exchange ${ex.reference} rejected: price difference returned`);
    }
  }

  /** The new item arrived: a cheaper item pays the difference back to the wallet. */
  private async settleDifference(ex: Exchange): Promise<void> {
    if (ex.priceDiffUsd < 0 && ex.customerId) {
      await this.wallet.apply(ex.customerId, 'refund', Math.abs(ex.priceDiffUsd), `Exchange ${ex.reference}: price difference refunded`);
    }
  }

  private async tell(ex: ExchangeView, status: ExchangeStatus, reason: string): Promise<void> {
    const sellerUser = await this.sellerUserOf(ex);
    if (sellerUser) {
      await this.notifications.toUser(sellerUser, {
        title: `Exchange ${status}`,
        body: `${ex.reference} · ${ex.orderReference}: ${ex.fromName} → ${ex.toName}`,
        type: 'exchange',
        entityId: ex.id,
      });
    }
    if (ex.customerId) {
      await this.notifications.toUser(ex.customerId, {
        title: `Exchange ${status}`,
        body: `${ex.reference}: ${ex.fromName} → ${ex.toName}${reason ? ` — ${reason}` : ''}`,
        type: 'exchange',
        entityId: ex.id,
      });
    }
    if (status === 'approved') {
      await this.notifications.toRole('warehouse_staff', {
        title: 'Exchange approved',
        body: `${ex.reference} · ${ex.fromName} → ${ex.toName}`,
        type: 'exchange',
        entityId: ex.id,
      });
    }
  }

  /** The delivery task moved (logistics calls this): picked up → dispatched, delivered → delivered. */
  async syncFromDelivery(id: string, taskStatus: 'picked_up' | 'in_transit' | 'delivered' | 'failed'): Promise<ExchangeView | null> {
    const ex = await this.exchanges.findOne({ where: { id } });
    if (!ex) return null;
    if (taskStatus === 'delivered' && ['approved', 'received', 'ready', 'dispatched'].includes(ex.status)) return this.force(ex, 'delivered');
    if ((taskStatus === 'picked_up' || taskStatus === 'in_transit') && ['approved', 'received', 'ready'].includes(ex.status)) return this.force(ex, 'dispatched');
    return (await this.serve([ex]))[0];
  }

  private async force(ex: Exchange, status: ExchangeStatus): Promise<ExchangeView> {
    const claim = await this.exchanges
      .createQueryBuilder()
      .update(Exchange)
      .set({ status, ...(status === 'delivered' ? { deliveredAt: new Date() } : {}) })
      .where('id = :id AND status = :from', { id: ex.id, from: ex.status })
      .execute();
    if (claim.affected && status === 'delivered') await this.settleDifference(ex);
    const [saved] = await this.serve([(await this.exchanges.findOne({ where: { id: ex.id } }))!]);
    if (claim.affected) {
      await this.publish(saved);
      await this.tell(saved, status, '');
    }
    return saved;
  }
}
