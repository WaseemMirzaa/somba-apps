import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { Conversation, ConversationMessage, Order, Product, Seller } from '../database/entities';
import type { ChatSide } from '../database/entities';
import { inRoleGroup } from '../common/role-groups';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { TranslationService } from '../translation/translation.service';
import type { TextI18n } from '../translation/translation.service';
import { pageOf } from '../common/paging';

/** What `chat:start` and `chat:send` answer now (customers contact support; docs/contracts/admin-controls.md). */
export const CHAT_CLOSED = 'Messaging sellers is closed. Contact support from your account.';

export interface ChatCaller {
  id: string;
  role: string;
  name: string;
}

export interface ConversationView {
  id: string;
  /** Which side the viewer is on in this conversation. */
  side: ChatSide;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  storeName: string;
  storeLogo: string | null;
  productId: string | null;
  productName: string | null;
  /** The product's French name (null without a product). The header chip shows the viewer's language and falls back to `productName`. */
  productNameFr: string | null;
  productImage: string | null;
  orderId: string | null;
  orderReference: string | null;
  lastMessageAt: Date | null;
  lastMessagePreview: string;
  /** The last message's preview in both languages (same rows as `textI18n`, cut like the preview); absent when unknown. */
  lastMessageI18n?: TextI18n;
  /** Messages the viewer has not read. */
  unread: number;
}

export interface MessageView {
  id: string;
  conversationId: string;
  senderId: string;
  senderSide: ChatSide;
  senderName: string;
  text: string;
  attachments: string[];
  createdAt: Date;
  /** Both languages of `text`; absent when no translation is known (use `translate:text`). */
  textI18n?: TextI18n;
}

const previewOf = (text: string) => text.trim().replace(/\s+/g, ' ').slice(0, 140);
const preview = (text: string, attachments: number) => (text.trim() ? previewOf(text) : attachments ? '📷' : '');

/** A strictly increasing time for each message, so history paging (`before`) has an exact order even within one millisecond. */
let lastStamp = 0;
export function stamp(now = Date.now()): Date {
  lastStamp = Math.max(now, lastStamp + 1);
  return new Date(lastStamp);
}

/** A conversation as the support desk reads it: both parties, the store, the context, how long the thread is. Read-only. */
export interface AdminConversationView extends Omit<ConversationView, 'side' | 'unread'> {
  messageCount: number;
}

/**
 * Customer <-> seller chat, CLOSED (docs/contracts/admin-controls.md): nobody can start or send a message any more, the
 * customer contacts support instead. What was written stays stored: the customer still reads their own old chats, the
 * support desk (admin and support) reads every conversation (read-only), and the store's staff see none.
 */
@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Conversation) private readonly convs: Repository<Conversation>,
    @InjectRepository(ConversationMessage) private readonly msgs: Repository<ConversationMessage>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly emitter: RealtimeEmitter,
    private readonly translations?: TranslationService,
  ) {}

  /** Support staff (the super admin and support) may read every conversation. */
  static readsAll(role: string): boolean {
    return inRoleGroup(role, 'support');
  }

  // ── Who may read ───────────────────────────────────────────────────────

  /** The shopper's own conversation, or null: the same answer for "no such chat" and "not yours". */
  private async mine(user: ChatCaller, id: unknown): Promise<Conversation> {
    const conv = await this.convs.findOne({ where: { id: String(id ?? '') } });
    if (!conv || conv.buyerId !== user.id) throw new Error('Conversation not found.');
    return conv;
  }

  // ── Views ───────────────────────────────────────────────────────────────
  private async views(rows: Conversation[], sideFor: (c: Conversation) => ChatSide): Promise<ConversationView[]> {
    if (!rows.length) return [];
    const stores = new Map((await this.sellers.find({ where: { id: In([...new Set(rows.map((c) => c.sellerId))]) } })).map((s) => [s.id, s]));
    const pids = [...new Set(rows.map((c) => c.productId).filter((x): x is string => !!x))];
    const oids = [...new Set(rows.map((c) => c.orderId).filter((x): x is string => !!x))];
    const prods = new Map((pids.length ? await this.products.find({ where: { id: In(pids) } }) : []).map((p) => [p.id, p]));
    // Both languages of each product's name (a product written in French has its English from the translator).
    const shown = this.translations && prods.size ? await this.translations.present('product', [...prods.values()]) : new Map();
    const lastI18n = await this.lastMessagesI18n(rows);
    const ords = new Map((oids.length ? await this.orders.find({ where: { id: In(oids) } }) : []).map((o) => [o.id, o]));
    return rows.map((c) => {
      const side = sideFor(c);
      const store = stores.get(c.sellerId);
      const p = c.productId ? prods.get(c.productId) : undefined;
      const names = p ? shown.get(p.id)?.texts : undefined;
      return {
        id: c.id,
        side,
        buyerId: c.buyerId,
        buyerName: c.buyerName,
        sellerId: c.sellerId,
        storeName: store?.name ?? 'Store',
        storeLogo: store?.logoUrl ?? null,
        productId: c.productId,
        productName: names?.name || p?.name || null,
        productNameFr: names?.nameFr || p?.name || null,
        productImage: p?.image ?? null,
        orderId: c.orderId,
        orderReference: c.orderId ? (ords.get(c.orderId)?.reference ?? null) : null,
        lastMessageAt: c.lastMessageAt,
        lastMessagePreview: c.lastMessagePreview,
        ...(lastI18n.has(c.id) ? { lastMessageI18n: lastI18n.get(c.id) } : {}),
        unread: side === 'buyer' ? c.buyerUnread : c.sellerUnread,
      };
    });
  }

  /**
   * The last message of each conversation, in both languages, cut like `lastMessagePreview`. Two queries for the whole
   * list (the latest message per thread, then the translation rows): nothing per conversation.
   */
  private async lastMessagesI18n(rows: Conversation[]): Promise<Map<string, TextI18n>> {
    const out = new Map<string, TextI18n>();
    const ids = rows.filter((c) => c.lastMessageAt).map((c) => c.id);
    if (!this.translations || !ids.length) return out;
    try {
      const last = await this.msgs
        .createQueryBuilder('m')
        .innerJoin(
          (qb) => qb.select('s.conversationId', 'cid').addSelect('MAX(s.createdAt)', 'mx').from(ConversationMessage, 's').where('s.conversationId IN (:...ids)', { ids }).groupBy('s.conversationId'),
          'x',
          'x.cid = m.conversationId AND x.mx = m.createdAt',
        )
        .where('m.conversationId IN (:...ids)', { ids })
        .getMany();
      const i18n = await this.translations.i18nFor('chat_message', last.map((m) => ({ id: m.id, text: m.text })));
      for (const m of last) {
        const t = i18n.get(m.id);
        if (!t) continue;
        const cut: TextI18n = { sourceLang: t.sourceLang };
        if (t.en !== undefined && previewOf(t.en)) cut.en = previewOf(t.en);
        if (t.fr !== undefined && previewOf(t.fr)) cut.fr = previewOf(t.fr);
        out.set(m.conversationId, cut);
      }
    } catch {
      /* the preview itself is served; its translation is a bonus */
    }
    return out;
  }

  private static message(m: ConversationMessage, i18n?: TextI18n): MessageView {
    let attachments: string[] = [];
    try {
      const v = JSON.parse(m.attachments ?? '[]');
      if (Array.isArray(v)) attachments = v.filter((x): x is string => typeof x === 'string');
    } catch {
      attachments = [];
    }
    return {
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      senderSide: m.senderSide,
      senderName: m.senderName,
      text: m.text,
      attachments,
      createdAt: m.createdAt,
      ...(i18n ? { textI18n: i18n } : {}),
    };
  }

  // ── Closed: starting and sending ────────────────────────────────────────
  /** Closed. Answered with {@link CHAT_CLOSED} for everyone (old clients show it as the error). */
  async start(_user?: ChatCaller, _input?: unknown): Promise<never> {
    throw new Error(CHAT_CLOSED);
  }

  /** Closed. Answered with {@link CHAT_CLOSED} for everyone. */
  async send(_user?: ChatCaller, _input?: unknown): Promise<never> {
    throw new Error(CHAT_CLOSED);
  }

  // ── Reading (the shopper's own history) ─────────────────────────────────
  /** The shopper's own conversations, newest activity first (history: nobody can add to them). */
  async list(user: ChatCaller, input: { as?: unknown; limit?: unknown; offset?: unknown } = {}) {
    const { take, skip } = pageOf(input, { def: 50, max: 200 });
    if (input?.as === 'seller') return [];
    const rows = await this.convs.find({ where: { buyerId: user.id }, order: { lastMessageAt: 'DESC', createdAt: 'DESC' }, take, skip });
    return this.views(rows, () => 'buyer');
  }

  /** Messages of one of the shopper's conversations, oldest first; `before` (a message id) pages back through history. */
  async messages(user: ChatCaller, input: { conversationId?: unknown; before?: unknown; limit?: unknown }) {
    const conv = await this.mine(user, input?.conversationId);
    return this.page(conv, input, () => 'buyer');
  }

  private async page(conv: Conversation, input: { before?: unknown; limit?: unknown }, sideFor: (c: Conversation) => ChatSide) {
    const { take } = pageOf(input, { def: 50, max: 200 });
    const where: Record<string, unknown> = { conversationId: conv.id };
    if (input?.before) {
      const ref = await this.msgs.findOne({ where: { id: String(input.before), conversationId: conv.id } });
      if (!ref) throw new Error('Message not found.');
      where.createdAt = LessThan(ref.createdAt);
    }
    const rows = await this.msgs.find({ where, order: { createdAt: 'DESC' }, take: take + 1 });
    const hasMore = rows.length > take;
    const page = rows.slice(0, take).reverse();
    const i18n = await this.translations?.i18nFor('chat_message', page.map((m) => ({ id: m.id, text: m.text })));
    return { conversation: (await this.views([conv], sideFor))[0], messages: page.map((m) => ChatService.message(m, i18n?.get(m.id))), hasMore };
  }

  /** The shopper read the thread: their unread count goes to zero and their other open screens hear it. */
  async markRead(user: ChatCaller, input: { conversationId?: unknown }) {
    const conv = await this.mine(user, input?.conversationId);
    await this.convs.update({ id: conv.id }, { buyerUnread: 0 });
    this.emitter.toUser(conv.buyerId, 'chat:read', { conversationId: conv.id, side: 'buyer', readBy: user.id });
    return { conversationId: conv.id, unread: 0 };
  }

  /** Total unread across the shopper's chats: `{ total, buyer, seller }` (`seller` is always 0: the store side is gone). */
  async unread(user: ChatCaller) {
    const mine = await this.convs.find({ where: { buyerId: user.id } });
    const buyer = mine.reduce((n, c) => n + c.buyerUnread, 0);
    return { total: buyer, buyer, seller: 0 };
  }

  // ── Support: read every conversation (read-only) ────────────────────────
  private assertSupport(user: ChatCaller): void {
    if (!ChatService.readsAll(user.role)) throw new Error('Not allowed.');
  }

  /**
   * `chat:adminList`: every conversation, newest activity first, with the thread length. Filters: `sellerId`, `buyerId`,
   * `orderId`, `q` (the customer's or the store's name). Paged with `limit` / `offset`.
   */
  async adminList(user: ChatCaller, input: { sellerId?: unknown; buyerId?: unknown; orderId?: unknown; q?: unknown; limit?: unknown; offset?: unknown } = {}): Promise<AdminConversationView[]> {
    this.assertSupport(user);
    const { take, skip } = pageOf(input, { def: 50, max: 200 });
    const qb = this.convs.createQueryBuilder('c').orderBy('c.lastMessageAt', 'DESC').addOrderBy('c.createdAt', 'DESC').take(take).skip(skip);
    if (input?.sellerId) qb.andWhere('c.sellerId = :sid', { sid: String(input.sellerId) });
    if (input?.buyerId) qb.andWhere('c.buyerId = :bid', { bid: String(input.buyerId) });
    if (input?.orderId) qb.andWhere('c.orderId = :oid', { oid: String(input.orderId) });
    const q = String(input?.q ?? '').replace(/[%_\\]/g, ' ').trim().slice(0, 60);
    if (q) {
      qb.leftJoin(Seller, 's', 's.id = c.sellerId').andWhere('(c.buyerName LIKE :q OR s.name LIKE :q)', { q: `%${q}%` });
    }
    const rows = await qb.getMany();
    const views = await this.views(rows, () => 'buyer');
    const counts = rows.length
      ? await this.msgs
          .createQueryBuilder('m')
          .select('m.conversationId', 'cid')
          .addSelect('COUNT(*)', 'n')
          .where('m.conversationId IN (:...ids)', { ids: rows.map((r) => r.id) })
          .groupBy('m.conversationId')
          .getRawMany<{ cid: string; n: string }>()
      : [];
    const byId = new Map(counts.map((r) => [r.cid, Number(r.n)]));
    return views.map(({ side: _side, unread: _unread, ...v }) => ({ ...v, messageCount: byId.get(v.id) ?? 0 }));
  }

  /** `chat:adminMessages`: one conversation's messages, oldest first, paged like `chat:messages`. Read-only. */
  async adminMessages(user: ChatCaller, input: { conversationId?: unknown; before?: unknown; limit?: unknown }) {
    this.assertSupport(user);
    const conv = await this.convs.findOne({ where: { id: String(input?.conversationId ?? '') } });
    if (!conv) throw new Error('Conversation not found.');
    const { conversation, messages, hasMore } = await this.page(conv, input, () => 'buyer');
    const { side: _side, unread: _unread, ...rest } = conversation;
    return { conversation: { ...rest, messageCount: await this.msgs.count({ where: { conversationId: conv.id } }) }, messages, hasMore };
  }

  /** `translate:text` with `kind: 'chat_message'`: the shopper of the conversation and the support desk may translate its messages. */
  async translate(user: ChatCaller, id: unknown, target: unknown) {
    if (!this.translations) throw new Error('Translation is not available right now. Try again later.');
    const nothing = 'Nothing to translate.';
    const msg = typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) ? await this.msgs.findOne({ where: { id } }) : null;
    if (!msg) throw new Error(nothing);
    const conv = await this.convs.findOne({ where: { id: msg.conversationId } });
    if (!conv || !(conv.buyerId === user.id || ChatService.readsAll(user.role))) throw new Error(nothing);
    return this.translations.translateStored('chat_message', id, target, { private: true });
  }

  /** Account deleted: the shopper's chats go with them (the store keeps no copy of a deleted person's messages). */
  async forgetBuyer(userId: string): Promise<void> {
    const rows = await this.convs.find({ where: { buyerId: userId }, select: { id: true } });
    if (!rows.length) return;
    const ids = rows.map((c) => c.id);
    await this.msgs.delete({ conversationId: In(ids) });
    await this.convs.delete({ id: In(ids) });
  }

  /**
   * Write a past conversation as history (the demo seed's only way in: no event reaches this). One conversation per
   * (buyer, store, context); `messages` are oldest first, each with its own time. Nothing is sent, nobody is notified.
   */
  async importHistory(input: {
    buyer: ChatCaller;
    sellerId: string;
    productId?: string | null;
    orderId?: string | null;
    messages: { side: ChatSide; sender: ChatCaller; text: string; attachments?: string[]; at: Date }[];
  }): Promise<Conversation> {
    const contextKey = input.orderId ? `o:${input.orderId}` : input.productId ? `p:${input.productId}` : '';
    let conv = await this.convs.findOne({ where: { buyerId: input.buyer.id, sellerId: input.sellerId, contextKey } });
    if (!conv) {
      conv = await this.convs.save(
        this.convs.create({ buyerId: input.buyer.id, buyerName: input.buyer.name, sellerId: input.sellerId, productId: input.productId ?? null, orderId: input.orderId ?? null, contextKey, lastMessageAt: null, lastMessagePreview: '', buyerUnread: 0, sellerUnread: 0 }),
      );
    }
    for (const m of input.messages) {
      const translated = m.text ? await this.translations?.translateForSave(m.text) : null;
      const saved = await this.msgs.save(
        this.msgs.create({ conversationId: conv.id, senderId: m.sender.id, senderSide: m.side, senderName: m.sender.name, text: m.text, attachments: m.attachments?.length ? JSON.stringify(m.attachments) : null, createdAt: m.at }),
      );
      await this.translations?.saveTranslated('chat_message', saved.id, translated);
      conv.lastMessageAt = m.at;
      conv.lastMessagePreview = preview(m.text, m.attachments?.length ?? 0);
    }
    await this.convs.update({ id: conv.id }, { lastMessageAt: conv.lastMessageAt, lastMessagePreview: conv.lastMessagePreview });
    return conv;
  }
}
