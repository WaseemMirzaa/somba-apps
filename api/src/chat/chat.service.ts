import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { Conversation, ConversationMessage, Order, OrderItem, Product, Seller, User } from '../database/entities';
import type { ChatSide, TeamRole } from '../database/entities';
import { NotificationsService } from '../notifications/notifications.service';
import { isUploadUrl } from '../common/attachments';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { SellerContextService } from '../sellers/seller-context';
import { TeamDirectory } from '../sellers/team-directory';
import { roleAllows } from '../sellers/seller-permissions';
import { TranslationService } from '../translation/translation.service';
import { pageOf } from '../common/paging';
import { RateWindow } from '../common/rate-window';

/** French titles of the two chat notices (the English ones are in notifications/localize.ts too). */
const FR_FROM_SELLER = 'Nouveau message du vendeur';
const FR_FROM_CUSTOMER = 'Nouveau message client';

export const MAX_TEXT = 2000;
export const MAX_ATTACHMENTS = 4;
/** Messages one account may send per minute, across all its chats. */
export const SENDS_PER_MINUTE = 20;
/** New conversations one account may open per hour. */
export const STARTS_PER_HOUR = 10;
/** The roles of a store's team that answer customers. */
export const CHAT_ROLES: readonly TeamRole[] = ['owner', 'manager', 'support', 'orders'];
export const canChat = (role: TeamRole): boolean => CHAT_ROLES.includes(role);

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
  productImage: string | null;
  orderId: string | null;
  orderReference: string | null;
  lastMessageAt: Date | null;
  lastMessagePreview: string;
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
}

const preview = (text: string, attachments: number) => (text.trim() ? text.trim().replace(/\s+/g, ' ').slice(0, 140) : attachments ? '📷' : '');

/** A strictly increasing time for each message, so history paging (`before`) has an exact order even within one millisecond. */
let lastStamp = 0;
export function stamp(now = Date.now()): Date {
  lastStamp = Math.max(now, lastStamp + 1);
  return new Date(lastStamp);
}

/**
 * The hook where contact-information filtering would go (phone numbers, e-mails, "pay me outside the platform").
 * Today it only normalises whitespace: the rate limits are the abuse control. Kept as one function so a real filter
 * is a one-place change.
 */
export function cleanChatText(raw: unknown): string {
  return String(raw ?? '').replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
}

@Injectable()
export class ChatService {
  private readonly sends = new RateWindow(SENDS_PER_MINUTE, 60_000);
  private readonly starts = new RateWindow(STARTS_PER_HOUR, 3_600_000);

  constructor(
    @InjectRepository(Conversation) private readonly convs: Repository<Conversation>,
    @InjectRepository(ConversationMessage) private readonly msgs: Repository<ConversationMessage>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderItem) private readonly items: Repository<OrderItem>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
    private readonly directory: TeamDirectory,
    private readonly sellerCtx: SellerContextService,
    private readonly translations?: TranslationService,
  ) {}

  // ── Who is in a conversation ───────────────────────────────────────────

  /** The side the account is on in this conversation, or null when it is not in it. */
  async sideOf(userId: string, conv: Conversation): Promise<ChatSide | null> {
    if (conv.buyerId === userId) return 'buyer';
    const m = await this.sellerCtx.membership(userId);
    return m && m.seller.id === conv.sellerId && canChat(m.member) ? 'seller' : null;
  }

  private async mine(user: ChatCaller, id: unknown): Promise<{ conv: Conversation; side: ChatSide }> {
    const conv = await this.convs.findOne({ where: { id: String(id ?? '') } });
    const side = conv ? await this.sideOf(user.id, conv) : null;
    // The same answer for "no such chat" and "not yours".
    if (!conv || !side) throw new Error('Conversation not found.');
    return { conv, side };
  }

  /** Accounts that answer for a store: the owner and the team members whose role handles customers. */
  async sellerSide(sellerId: string): Promise<{ ownerId: string | null; memberIds: { userId: string; role: TeamRole }[] }> {
    const seller = await this.sellers.findOne({ where: { id: sellerId } });
    const members = (await this.directory.membersOfStore(sellerId)).filter((m) => canChat(m.role));
    return { ownerId: seller?.userId ?? null, memberIds: members };
  }

  // ── Views ───────────────────────────────────────────────────────────────
  private async views(rows: Conversation[], sideFor: (c: Conversation) => ChatSide): Promise<ConversationView[]> {
    if (!rows.length) return [];
    const stores = new Map((await this.sellers.find({ where: { id: In([...new Set(rows.map((c) => c.sellerId))]) } })).map((s) => [s.id, s]));
    const pids = [...new Set(rows.map((c) => c.productId).filter((x): x is string => !!x))];
    const oids = [...new Set(rows.map((c) => c.orderId).filter((x): x is string => !!x))];
    const prods = new Map((pids.length ? await this.products.find({ where: { id: In(pids) } }) : []).map((p) => [p.id, p]));
    const ords = new Map((oids.length ? await this.orders.find({ where: { id: In(oids) } }) : []).map((o) => [o.id, o]));
    return rows.map((c) => {
      const side = sideFor(c);
      const store = stores.get(c.sellerId);
      const p = c.productId ? prods.get(c.productId) : undefined;
      return {
        id: c.id,
        side,
        buyerId: c.buyerId,
        buyerName: c.buyerName,
        sellerId: c.sellerId,
        storeName: store?.name ?? 'Store',
        storeLogo: store?.logoUrl ?? null,
        productId: c.productId,
        productName: p?.name ?? null,
        productImage: p?.image ?? null,
        orderId: c.orderId,
        orderReference: c.orderId ? (ords.get(c.orderId)?.reference ?? null) : null,
        lastMessageAt: c.lastMessageAt,
        lastMessagePreview: c.lastMessagePreview,
        unread: side === 'buyer' ? c.buyerUnread : c.sellerUnread,
      };
    });
  }

  private static message(m: ConversationMessage): MessageView {
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
    };
  }

  // ── Starting ────────────────────────────────────────────────────────────
  async start(user: ChatCaller, input: { sellerId?: unknown; productId?: unknown; orderId?: unknown; text?: unknown; attachments?: unknown }) {
    if (user.role !== 'customer' && user.role !== 'seller') throw new Error('Only shoppers can message a store.');
    const sellerId = String(input?.sellerId ?? '');
    const seller = sellerId ? await this.sellers.findOne({ where: { id: sellerId } }) : null;
    if (!seller || seller.status !== 'approved') throw new Error('Store not found.');
    const member = await this.sellerCtx.membership(user.id);
    if (member?.seller.id === seller.id) throw new Error('You cannot message your own store.');
    const text = cleanChatText(input?.text);
    const attachments = ChatService.attachments(input?.attachments);
    if (!text && !attachments.length) throw new Error('Write a message first.');
    if (text.length > MAX_TEXT) throw new Error(`A message can have up to ${MAX_TEXT} characters.`);

    const ids = [seller.id, ...(seller.userId ? [seller.userId] : [])];
    let productId: string | null = null;
    if (input?.productId) {
      const p = await this.products.findOne({ where: { id: String(input.productId) } });
      if (!p || !p.sellerId || !ids.includes(p.sellerId)) throw new Error('That product does not belong to this store.');
      productId = p.id;
    }
    let orderId: string | null = null;
    if (input?.orderId) {
      const o = await this.orders.findOne({ where: { id: String(input.orderId) } });
      if (!o || o.customerId !== user.id) throw new Error('Order not found.');
      const lines = await this.items.find({ where: { orderId: o.id } });
      const prods = lines.length ? await this.products.find({ where: { id: In(lines.map((l) => l.productId)) } }) : [];
      const byStore = lines.some((l) => (l.sellerId && ids.includes(l.sellerId)) || prods.some((p) => p.id === l.productId && p.sellerId && ids.includes(p.sellerId)));
      if (!byStore) throw new Error('That order has nothing from this store.');
      orderId = o.id;
    }
    const contextKey = orderId ? `o:${orderId}` : productId ? `p:${productId}` : '';

    let conv = await this.convs.findOne({ where: { buyerId: user.id, sellerId: seller.id, contextKey } });
    // Both limits are checked BEFORE anything is written, so a refused first message never leaves an empty conversation behind.
    if (!this.sends.take(user.id)) throw new Error('You are sending messages too fast. Wait a moment.');
    if (!conv) {
      if (!this.starts.take(user.id)) throw new Error('You are opening too many conversations. Try again later.');
      conv = await this.convs.save(
        this.convs.create({ buyerId: user.id, buyerName: user.name, sellerId: seller.id, productId, orderId, contextKey, lastMessageAt: null, lastMessagePreview: '', buyerUnread: 0, sellerUnread: 0 }),
      );
    }
    const message = await this.post(conv, 'buyer', user, text, attachments, seller, true);
    const view = (await this.views([conv], () => 'buyer'))[0];
    return { conversation: { ...view, lastMessageAt: message.createdAt, lastMessagePreview: conv.lastMessagePreview }, message };
  }

  // ── Sending ─────────────────────────────────────────────────────────────
  async send(user: ChatCaller, input: { conversationId?: unknown; text?: unknown; attachments?: unknown }) {
    const { conv, side } = await this.mine(user, input?.conversationId);
    const text = cleanChatText(input?.text);
    const attachments = ChatService.attachments(input?.attachments);
    if (!text && !attachments.length) throw new Error('Write a message first.');
    if (text.length > MAX_TEXT) throw new Error(`A message can have up to ${MAX_TEXT} characters.`);
    const seller = await this.sellers.findOne({ where: { id: conv.sellerId } });
    if (side === 'seller' && seller?.status === 'suspended') throw new Error('Your store is suspended: you can read messages but not reply.');
    return { message: await this.post(conv, side, user, text, attachments, seller) };
  }

  private static attachments(raw: unknown): string[] {
    if (raw === undefined || raw === null) return [];
    if (!Array.isArray(raw) || raw.length > MAX_ATTACHMENTS) throw new Error(`Attach up to ${MAX_ATTACHMENTS} photos.`);
    const out: string[] = [];
    for (const u of raw) {
      // Anything the uploads endpoint can have written (png, jpg/jpeg, webp, heic) and nothing else.
      if (typeof u !== 'string' || u.length > 500 || !URL.canParse(u)) throw new Error('Attachment is not a valid image.');
      if (!isUploadUrl(u)) throw new Error('Attachment must be an image uploaded through the platform.');
      const url = u;
      if (!out.includes(url)) out.push(url);
    }
    return out;
  }

  /** Store the message, move the counters, tell both sides live, and leave a notice for whoever was not already waiting. */
  private async post(conv: Conversation, side: ChatSide, user: ChatCaller, text: string, attachments: string[], seller: Seller | null, rateChecked = false): Promise<MessageView> {
    if (!rateChecked && !this.sends.take(user.id)) throw new Error('You are sending messages too fast. Wait a moment.');
    const saved = await this.msgs.save(
      this.msgs.create({ conversationId: conv.id, senderId: user.id, senderSide: side, senderName: user.name, text, attachments: attachments.length ? JSON.stringify(attachments) : null, createdAt: stamp() }),
    );
    const other: ChatSide = side === 'buyer' ? 'seller' : 'buyer';
    const wasWaiting = (other === 'buyer' ? conv.buyerUnread : conv.sellerUnread) > 0;
    // Atomic counter bump so two simultaneous messages both count.
    await this.convs.increment({ id: conv.id }, other === 'buyer' ? 'buyerUnread' : 'sellerUnread', 1);
    conv.lastMessageAt = saved.createdAt;
    conv.lastMessagePreview = preview(text, attachments.length);
    await this.convs.update({ id: conv.id }, { lastMessageAt: conv.lastMessageAt, lastMessagePreview: conv.lastMessagePreview });
    const fresh = (await this.convs.findOne({ where: { id: conv.id } }))!;
    const message = ChatService.message(saved);

    await this.fanout(fresh, message);
    if (!wasWaiting) await this.notify(fresh, side, user, seller);
    return message;
  }

  /** `chat:message` to everyone on both sides, each with their own unread count. */
  private async fanout(conv: Conversation, message: MessageView): Promise<void> {
    const { ownerId, memberIds } = await this.sellerSide(conv.sellerId);
    const buyerView = (await this.views([conv], () => 'buyer'))[0];
    const sellerView = (await this.views([conv], () => 'seller'))[0];
    this.emitter.toUser(conv.buyerId, 'chat:message', { conversation: buyerView, message });
    const staff = [...(ownerId ? [ownerId] : []), ...memberIds.map((m) => m.userId)];
    for (const id of new Set(staff)) this.emitter.toUser(id, 'chat:message', { conversation: sellerView, message });
  }

  private async notify(conv: Conversation, from: ChatSide, user: ChatCaller, seller: Seller | null): Promise<void> {
    try {
      const snippet = conv.lastMessagePreview;
      if (from === 'seller') {
        const body = `${seller?.name ?? 'Store'}: ${snippet}`;
        // The body is what a person typed: authored French = the same text, so no pattern ever "translates" it.
        await this.notifications.toUser(conv.buyerId, {
          title: 'New message from the seller',
          body,
          type: 'chat',
          entityId: conv.id,
          fr: { title: FR_FROM_SELLER, body },
        });
        return;
      }
      const { ownerId, memberIds } = await this.sellerSide(conv.sellerId);
      const notice = {
        title: 'New customer message',
        body: `${user.name}: ${snippet}`,
        type: 'chat',
        entityId: conv.id,
        fr: { title: FR_FROM_CUSTOMER, body: `${user.name}: ${snippet}` },
      };
      // The owner's notice already reaches managers and support (NotificationsService fans it out); orders staff are told here.
      if (ownerId) await this.notifications.toUser(ownerId, notice);
      for (const m of memberIds.filter((x) => x.role === 'orders' && !roleAllows(x.role, 'support'))) await this.notifications.toUser(m.userId, notice);
    } catch {
      /* the message is saved and pushed; a notice is a bonus */
    }
  }

  // ── Reading ─────────────────────────────────────────────────────────────
  /** The viewer's conversations, newest activity first: as a shopper, and (for staff) the store's. */
  async list(user: ChatCaller, input: { as?: unknown; limit?: unknown; offset?: unknown } = {}) {
    const { take, skip } = pageOf(input, { def: 50, max: 200 });
    const want = input?.as === 'buyer' || input?.as === 'seller' ? input.as : null;
    const membership = user.role === 'seller' ? await this.sellerCtx.membership(user.id) : null;
    const staffStore = membership && canChat(membership.member) ? membership.seller.id : null;
    const where: object[] = [];
    if (want !== 'seller') where.push({ buyerId: user.id });
    if (want !== 'buyer' && staffStore) where.push({ sellerId: staffStore });
    if (!where.length) return [];
    const rows = await this.convs.find({ where, order: { lastMessageAt: 'DESC', createdAt: 'DESC' }, take, skip });
    return this.views(rows, (c) => (c.buyerId === user.id ? 'buyer' : 'seller'));
  }

  /** Messages of one conversation, oldest first; `before` (a message id) pages back through history. */
  async messages(user: ChatCaller, input: { conversationId?: unknown; before?: unknown; limit?: unknown }) {
    const { conv, side } = await this.mine(user, input?.conversationId);
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
    return { conversation: (await this.views([conv], () => side))[0], messages: page.map(ChatService.message), hasMore };
  }

  /** The viewer read the thread: their side's unread count goes to zero; their other open screens and the other side hear it. */
  async markRead(user: ChatCaller, input: { conversationId?: unknown }) {
    const { conv, side } = await this.mine(user, input?.conversationId);
    await this.convs.update({ id: conv.id }, side === 'buyer' ? { buyerUnread: 0 } : { sellerUnread: 0 });
    const payload = { conversationId: conv.id, side, readBy: user.id };
    if (side === 'buyer') {
      this.emitter.toUser(conv.buyerId, 'chat:read', payload);
      const { ownerId, memberIds } = await this.sellerSide(conv.sellerId);
      for (const id of new Set([...(ownerId ? [ownerId] : []), ...memberIds.map((m) => m.userId)])) this.emitter.toUser(id, 'chat:read', payload);
    } else {
      const { ownerId, memberIds } = await this.sellerSide(conv.sellerId);
      for (const id of new Set([...(ownerId ? [ownerId] : []), ...memberIds.map((m) => m.userId)])) this.emitter.toUser(id, 'chat:read', payload);
      this.emitter.toUser(conv.buyerId, 'chat:read', payload);
    }
    return { conversationId: conv.id, unread: 0 };
  }

  /** Total unread across the viewer's chats (the badge on the Messages tab): `{ total, buyer, seller }`. */
  async unread(user: ChatCaller) {
    const mine = await this.convs.find({ where: { buyerId: user.id } });
    const membership = user.role === 'seller' ? await this.sellerCtx.membership(user.id) : null;
    const store = membership && canChat(membership.member) ? await this.convs.find({ where: { sellerId: membership.seller.id } }) : [];
    const buyer = mine.reduce((n, c) => n + c.buyerUnread, 0);
    const seller = store.reduce((n, c) => n + c.sellerUnread, 0);
    return { total: buyer + seller, buyer, seller };
  }

  /** `translate:text` with `kind: 'chat_message'`: only the two sides of a conversation may translate its messages. */
  async translate(user: ChatCaller, id: unknown, target: unknown) {
    if (!this.translations) throw new Error('Translation is not available right now. Try again later.');
    const nothing = 'Nothing to translate.';
    const msg = typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) ? await this.msgs.findOne({ where: { id } }) : null;
    if (!msg) throw new Error(nothing);
    const conv = await this.convs.findOne({ where: { id: msg.conversationId } });
    if (!conv || !(await this.sideOf(user.id, conv))) throw new Error(nothing);
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
}
