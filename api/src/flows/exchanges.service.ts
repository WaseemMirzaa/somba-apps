import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Exchange, Order, Seller } from '../database/entities';
import type { ExchangeStatus } from '../database/entities';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ProductsService } from '../products/products.service';
import { SettingsService } from '../content/settings.service';
import { WalletService } from '../wallet/wallet.service';
import { checkVariant, storedVariantGroups } from '../common/variants/variants';
import { ROLE_GROUPS, inRoleGroup } from '../common/role-groups';
import { cleanAttachments, parseAttachments, storeAttachments } from '../common/attachments';
import { LogisticsBridge } from '../after-sale/logistics-bridge';
import { EXCHANGE_NEXT, assertStep, sellerForItem } from './after-sale';
import { AfterSaleNames } from './after-sale-names';
import { SellerAfterSaleViewService } from '../sellers/seller-after-sale.service';
import type { SellerCaseView } from '../sellers/seller-case-view';
import { quotedNotice } from '../notifications/quote';
import { TranslationService } from '../translation/translation.service';
import type { SaveTranslation, StoredKind, TextI18n } from '../translation/translation.service';

/** Who follows exchanges live and reads them all: the admin roles that decide them (group `exchangeDecide`) and warehouse staff. */
const OPS_ROLES = [...ROLE_GROUPS.exchangeDecide, 'warehouse_staff'];
const HOUR_MS = 3_600_000;
const cents = (n: number) => Number(n.toFixed(2));
const STALE = 'This exchange was just updated by someone else. Refresh and try again.';
const OPEN: ExchangeStatus[] = ['requested', 'approved', 'received', 'ready', 'dispatched'];
const DESK_REFUND_FILE = "Only finance can file an exchange that refunds money to the customer's wallet.";

/**
 * Who may move an exchange through its steps (and so trigger the wallet credit on delivery): the exchange desk and
 * warehouse staff (the gateway also requires a supervisor tier). C-X4 (A-03), checked here and in `AfterSaleGateway`.
 */
export const canMoveExchange = (role: string): boolean => inRoleGroup(role, 'exchangeDesk') || role === 'warehouse_staff';

/**
 * An exchange as clients receive it: the stored fields plus the two items' names in French (null when it cannot be
 * told, e.g. `toName` is what the customer typed). `reason` and `sellerReason` are people's own words: each is translated
 * before it is stored and served in both languages next to it (`reasonI18n`, `sellerReasonI18n`; absent when no translation
 * is known, then `translate:text` is the fallback).
 */
export type ExchangeView = Omit<Exchange, 'attachments'> & {
  fromNameFr: string | null;
  toNameFr: string | null;
  attachments: string[];
  reasonI18n?: TextI18n;
  sellerReasonI18n?: TextI18n;
};

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
    private readonly translations?: TranslationService,
    // The store's read-only view (docs/contracts/admin-controls.md §13): pushes and notices while a section is on.
    @Optional() private readonly sellerView?: SellerAfterSaleViewService,
  ) {}

  /** Translate first, then store (null: stored untranslated, as before). The writer's account language is the hint. */
  private translateFor(text: string, userId?: string): Promise<SaveTranslation | null> {
    if (!text || !this.translations) return Promise.resolve(null);
    return userId ? this.translations.translateForSender(text, userId) : this.translations.translateForSave(text);
  }

  private keep(kind: StoredKind, id: string, saved: SaveTranslation | null): Promise<void> {
    return this.translations?.saveTranslated(kind, id, saved) ?? Promise.resolve();
  }

  /** Rows with the French names of their items and both languages of their notes, looked up for all of them at once. */
  private async serve(rows: Exchange[]): Promise<ExchangeView[]> {
    const fr = await this.names.frenchNames(
      rows.flatMap((x) => [
        { orderId: x.orderId, sku: x.fromSku, name: x.fromName },
        { orderId: x.orderId, sku: x.toSku, name: x.toName },
      ]),
    );
    const t = this.translations;
    const [reasons, replies] = t
      ? await Promise.all([
          t.i18nFor('exchange_reason', rows.map((x) => ({ id: x.id, text: x.reason }))),
          t.i18nFor('exchange_reply', rows.map((x) => ({ id: x.id, text: x.sellerReason }))),
        ])
      : [new Map<string, TextI18n>(), new Map<string, TextI18n>()];
    return rows.map((x, i) => ({
      ...x,
      attachments: parseAttachments(x.attachments),
      fromNameFr: fr[2 * i],
      toNameFr: fr[2 * i + 1],
      ...(reasons.has(x.id) ? { reasonI18n: reasons.get(x.id) } : {}),
      ...(replies.has(x.id) ? { sellerReasonI18n: replies.get(x.id) } : {}),
    }));
  }

  async list(user: { id: string; role: string }, paging?: { limit?: number; offset?: number; status?: string }): Promise<ExchangeView[]> {
    const ops = OPS_ROLES.includes(user.role);
    const take = Math.min(1000, Math.max(1, Math.floor(Number(paging?.limit) || (ops ? 200 : 500))));
    const skip = Math.max(0, Math.floor(Number(paging?.offset) || 0));
    const status = paging?.status ? ({ status: paging.status as ExchangeStatus } as const) : {};
    if (ops) return this.serve(await this.exchanges.find({ where: status, order: { createdAt: 'DESC' }, take, skip }));
    // Everyone else (a seller included) sees only what they asked for themselves.
    return this.serve(await this.exchanges.find({ where: { customerId: user.id, ...status }, order: { createdAt: 'DESC' }, take, skip }));
  }

  /** The store's exchanges, redacted (docs/contracts/admin-controls.md §13). Callers check that the section is on for the store first. */
  async listForStore(sellerId: string, paging?: { limit?: number; offset?: number; status?: string }): Promise<SellerCaseView[]> {
    const take = Math.min(500, Math.max(1, Math.floor(Number(paging?.limit) || 200)));
    const skip = Math.max(0, Math.floor(Number(paging?.offset) || 0));
    const status = paging?.status ? ({ status: paging.status as never } as const) : {};
    const views = await this.serve(await this.exchanges.find({ where: { sellerId, ...status }, order: { createdAt: 'DESC' }, take, skip }));
    return this.sellerView ? this.sellerView.present('exchange', views as unknown as Record<string, unknown>[], sellerId) : [];
  }

  /** One of the store's exchanges, redacted; null when it is not this store's. */
  async getForStore(sellerId: string, id: string): Promise<SellerCaseView | null> {
    const row = await this.exchanges.findOne({ where: { id: String(id ?? ''), sellerId } });
    if (!row || !this.sellerView) return null;
    return (await this.sellerView.present('exchange', (await this.serve([row])) as unknown as Record<string, unknown>[], sellerId))[0] ?? null;
  }

  /** What this person asked for as a customer. */
  async mine(userId: string, paging?: { limit?: number; offset?: number; status?: string }): Promise<ExchangeView[]> {
    const take = Math.min(1000, Math.max(1, Math.floor(Number(paging?.limit) || 500)));
    const skip = Math.max(0, Math.floor(Number(paging?.offset) || 0));
    const status = paging?.status ? ({ status: paging.status as ExchangeStatus } as const) : {};
    return this.serve(await this.exchanges.find({ where: { customerId: userId, ...status }, order: { createdAt: 'DESC' }, take, skip }));
  }

  /** One exchange, for the customer who asked or staff (a seller sees none: support decides). */
  async get(user: { id: string; role: string }, id: string): Promise<ExchangeView> {
    const ex = await this.exchanges.findOne({ where: { id: String(id ?? '') } });
    if (!ex || !(OPS_ROLES.includes(user.role) || ex.customerId === user.id)) throw new NotFoundException('Exchange not found.');
    return (await this.serve([ex]))[0];
  }

  /** The deciding desk, the warehouse and the customer hear about a change; the seller does not. */
  private async publish(ex: ExchangeView, opened = false): Promise<void> {
    this.emitter.toRoles(OPS_ROLES, 'exchange:updated', ex);
    if (ex.customerId) this.emitter.toUser(ex.customerId, 'exchange:updated', ex);
    // The store hears about it too, redacted, while its section is on (never the customer's thread).
    await this.sellerView?.push('exchange', ex as unknown as Record<string, unknown>, opened ? 'opened' : 'updated');
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
    // C-X4 (A-03): the order's own customer, or the exchange desk filing for them. Any other admin department or the
    // warehouse cannot file on someone else's order. Either way the order must have been delivered.
    const ops = !!order && order.customerId !== actor.id && inRoleGroup(actor.role, 'exchangeDesk');
    if (!order || (!ops && order.customerId !== actor.id) || order.status !== 'delivered') {
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
    // C-X1: only something that was on the order can be exchanged (by the desk too: A-03).
    if (!line) throw new BadRequestException('That item is not on this order.');
    const qty = Math.max(1, Math.min(line.qty ?? 1, Math.trunc(Number(input.qty) || 1)));
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
        if (toSku === fromSku && toVariant === line.variant) throw new BadRequestException('Choose a different option to exchange for.');
      }
      if ((await this.products.availableFor(toSku, toVariant)) < qty) throw new BadRequestException('Not enough stock of that item for an exchange.');
      const unit = (await this.products.get(toSku))?.price ?? target.price;
      diff = cents((unit - (line.priceUsd ?? unit)) * qty);
    }
    // An item that is not in the catalogue is free text: no price, no stock, no money moves (finance settles it by hand).
    // The client's `priceDiffUsd` is never read (A-03): the difference is only ever the server's own arithmetic above.
    // C-X5 (A-03): a desk-filed exchange that would refund money to the wallet needs a finance role.
    if (ops && diff < 0 && !inRoleGroup(actor.role, 'finance')) throw new BadRequestException(DESK_REFUND_FILE);

    const seller = await sellerForItem(order, fromSku, this.products, this.sellers);
    // Support's response time (the setting keeps its old key).
    const hours = Number(await this.settings.get('sellerResponseHours'));
    // Translate first, then store: the reason is saved in both languages together.
    const reasonText = input.reason ? String(input.reason).slice(0, 1000) : '';
    const reasonTr = await this.translateFor(reasonText.trim(), actor.id);
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
          fromVariant: line.variant ?? null,
          toVariant,
          priceDiffUsd: diff,
          heldUsd: !ops && diff > 0 ? diff : 0,
          reason: reasonText || null,
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
    await this.keep('exchange_reason', saved.id, reasonTr);
    const [ex] = await this.serve([saved]);
    await this.publish(ex, true);
    // Support decides now: tell them (a desk-filed exchange is theirs already).
    if (!ops) {
      await this.notifications.toRole('admin_support', {
        title: 'Exchange requested',
        body: `${ex.reference} · ${order.reference}: ${ex.fromName} → ${ex.toName}`,
        type: 'exchange',
        entityId: ex.id,
      });
    }
    return ex;
  }

  /**
   * Support (the `exchangeDecide` group: super admin, operations, support) approves or rejects an exchange; sellers take no
   * part, and support has full control including an exchange with a negative price difference (a refund to the customer's
   * wallet on delivery): the rule that only operations could approve it is gone. Other admin departments cannot decide.
   * (Filing an exchange that refunds money still needs finance, C-X5.)
   */
  async respond(actor: { id: string; role: string }, id: string, approve: boolean, rawReason: unknown): Promise<ExchangeView> {
    const ex = await this.exchanges.findOne({ where: { id: String(id ?? '') } });
    if (!ex || !inRoleGroup(actor.role, 'exchangeDecide')) throw new NotFoundException('Exchange not found.');
    if (ex.status !== 'requested') throw new BadRequestException('This request was already handled.');
    const reason = String(rawReason ?? '').trim().slice(0, 1000);
    if (!approve && reason.length < 5) throw new BadRequestException('Tell the customer why you are rejecting this exchange.');
    // Translate first, then store: the decision note is saved in both languages together (in `sellerReason`, as before).
    return this.move(ex, approve ? 'approved' : 'rejected', reason, await this.translateFor(reason, actor.id));
  }

  /** A desk step. C-X4 (A-03): only the exchange desk and the warehouse move an exchange (delivery credits the wallet). */
  async setStatus(id: string, status: ExchangeStatus, actor: { role: string }): Promise<ExchangeView> {
    if (!canMoveExchange(actor?.role ?? '')) throw new BadRequestException('Ops only.');
    const ex = await this.exchanges.findOne({ where: { id } });
    if (!ex) throw new NotFoundException('Exchange not found.');
    assertStep(EXCHANGE_NEXT, ex.status, status);
    return this.move(ex, status, '');
  }

  private async move(ex: Exchange, status: ExchangeStatus, reason: string, reasonTr: SaveTranslation | null = null): Promise<ExchangeView> {
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
    // The seller's reason is stored now (and was not rolled back above): its translation goes with it.
    if (reason && (status === 'approved' || status === 'rejected')) await this.keep('exchange_reply', ex.id, reasonTr);
    const [saved] = await this.serve([(await this.exchanges.findOne({ where: { id: ex.id } }))!]);
    await this.publish(saved);
    if (status === 'approved' || status === 'rejected') await this.sellerView?.decided('exchange', saved as unknown as Record<string, unknown>);
    await this.tell(saved, status, reason, reasonTr);
    return saved;
  }

  /** The new item comes from the seller's stock; then logistics is asked to deliver it (and fetch the old one). */
  private async takeStockAndSend(ex: Exchange): Promise<true | string> {
    if (!ex.toSku.startsWith('ext:') && (await this.products.getRaw(ex.toSku))) {
      if (!(await this.products.reserve(ex.toSku, ex.qty, { variant: ex.toVariant, orderId: ex.orderId, reason: 'replacement' }))) {
        return 'Not enough stock for this exchange. Ask the seller to restock the item, or reject the request.';
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

  private async tell(ex: ExchangeView, status: ExchangeStatus, reason: string, reasonTr: SaveTranslation | null = null): Promise<void> {
    // The seller is told nothing here: the hand-over of the new unit reaches them as "Pickup scheduled" (logistics).
    if (ex.customerId) {
      await this.notifications.toUser(
        ex.customerId,
        quotedNotice({
          title: `Exchange ${status}`,
          body: (q) => `${ex.reference}: ${ex.fromName} → ${ex.toName}${reason ? ` — ${q}` : ''}`,
          text: reason,
          i18n: reasonTr,
          max: 1000,
          type: 'exchange',
          entityId: ex.id,
        }),
      );
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

  /**
   * `translate:text` for `exchange_reason` / `exchange_reply` (id = the exchange). PRIVATE: only people who may read the
   * exchange (`get`: the desk and warehouse, its customer) may translate its notes. Anyone
   * else, and a made-up id, gets "Nothing to translate.".
   */
  async translate(user: { id: string; role: string }, kind: unknown, id: unknown, target: unknown) {
    if (!this.translations) throw new Error('Translation is not available right now. Try again later.');
    const nothing = 'Nothing to translate.';
    if ((kind !== 'exchange_reason' && kind !== 'exchange_reply') || typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error(nothing);
    const ex = await this.exchanges.findOne({ where: { id } });
    if (!ex || !(OPS_ROLES.includes(user.role) || ex.customerId === user.id)) throw new Error(nothing);
    return this.translations.translateStored(kind, id, target, { private: true });
  }
}
