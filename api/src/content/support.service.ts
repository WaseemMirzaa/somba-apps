import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DeliveryTask, Order, Product, Seller, SellerTeamMember, SupportMessage, SupportTicket, User } from '../database/entities';
import type { TicketStatus } from '../database/entities';
import { cleanAttachments, parseAttachments, storeAttachments } from '../common/attachments';
import { pageOf } from '../common/paging';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { NotificationsService } from '../notifications/notifications.service';
import { inRoleGroup, ROLE_GROUPS } from '../common/role-groups';
import { TranslationService } from '../translation/translation.service';
import type { SaveTranslation, StoredKind, TextI18n } from '../translation/translation.service';
import { quotedNotice } from '../notifications/quote';

export const TICKET_STATUSES: readonly TicketStatus[] = ['open', 'pending', 'resolved', 'closed'];
/** Agents: the Super Admin and the Support department (group `support`); other admin roles are customers of this desk, not agents. */
const isAgent = (role: string) => inRoleGroup(role, 'support');
/** Who hears about ticket changes live (the agents; the ticket's owner has their own room). */
const AGENT_ROLES = [...ROLE_GROUPS.support];
const preview = (text: string, photos: string[]) => (text || (photos.length ? '📷' : '')).slice(0, 60);

/** One message as clients receive it (inside `ticket.messages`, a JSON array, as before). */
export interface TicketMessage {
  id: string;
  from: string;
  fromId: string | null;
  role: string;
  text: string;
  at: string;
  attachments: string[];
  /** Both languages of `text` (docs/contracts/stored-text-i18n.md); absent when no translation is known (use `translate:text`). */
  textI18n?: TextI18n;
}

/** A ticket as clients receive it: the stored row, its messages as JSON text, and the subject in both languages when known. */
export type TicketView = SupportTicket & { subjectI18n?: TextI18n };

@Injectable()
export class SupportService {
  constructor(
    @InjectRepository(SupportTicket)
    private readonly tickets: Repository<SupportTicket>,
    @InjectRepository(SupportMessage)
    private readonly messages: Repository<SupportMessage>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
    private readonly translations?: TranslationService,
  ) {}

  /** Translate first, then store (null: stored untranslated, as before). The sender's account language is the hint. */
  private translateFor(text: string, userId: string): Promise<SaveTranslation | null> {
    return this.translations ? this.translations.translateForSender(text, userId) : Promise.resolve(null);
  }

  private keep(kind: StoredKind, id: string, saved: SaveTranslation | null): Promise<void> {
    return this.translations?.saveTranslated(kind, id, saved) ?? Promise.resolve();
  }
  /** Tickets with their messages (rows of `support_messages`, oldest first) as the JSON text clients already read. */
  private async present(rows: SupportTicket[]): Promise<TicketView[]> {
    if (!rows.length) return rows;
    const msgs = await this.messages.find({ where: { ticketId: In(rows.map((r) => r.id)) }, order: { createdAt: 'ASC' } });
    // Both languages of every message and subject: one batched lookup each for the whole list (no N+1).
    const [textI18n, subjectI18n] = this.translations
      ? await Promise.all([
          this.translations.i18nFor('support_message', msgs.map((m) => ({ id: m.id, text: m.text }))),
          this.translations.i18nFor('support_ticket', rows.map((r) => ({ id: r.id, text: r.subject }))),
        ])
      : [new Map<string, TextI18n>(), new Map<string, TextI18n>()];
    const by = new Map<string, TicketMessage[]>();
    for (const m of msgs) {
      const i18n = textI18n.get(m.id);
      by.set(m.ticketId, [
        ...(by.get(m.ticketId) ?? []),
        { id: m.id, from: m.from, fromId: m.fromId, role: m.role, text: m.text, at: m.createdAt.toISOString(), attachments: parseAttachments(m.attachments), ...(i18n ? { textI18n: i18n } : {}) },
      ]);
    }
    return rows.map((r) => Object.assign(r, { messages: JSON.stringify(by.get(r.id) ?? []) }, subjectI18n.has(r.id) ? { subjectI18n: subjectI18n.get(r.id) } : {}));
  }

  private async one(id: string): Promise<TicketView | null> {
    const row = await this.tickets.findOne({ where: { id } });
    return row ? (await this.present([row]))[0] : null;
  }

  async list(user: { id: string; role: string }, filter: { status?: string; assignee?: string; limit?: number; offset?: number } = {}): Promise<TicketView[]> {
    // Only agents see everyone's tickets; every other role sees its own.
    if (!isAgent(user.role)) {
      return this.present(await this.tickets.find({ where: { userId: user.id }, order: { updatedAt: 'DESC' }, take: 200 }));
    }
    const { take, skip } = pageOf(filter, { def: 200 });
    const where: Record<string, unknown> = {};
    if (filter.status && TICKET_STATUSES.includes(filter.status as TicketStatus)) where.status = filter.status;
    if (filter.assignee === 'me') where.assigneeId = user.id;
    return this.present(await this.tickets.find({ where: where as never, order: { updatedAt: 'DESC' }, take, skip }));
  }

  async get(user: { id: string; role: string }, id: string): Promise<TicketView> {
    const ticket = await this.one(String(id ?? ''));
    // Same answer for "missing" and "not yours" so ids can't be probed.
    if (!ticket || (!isAgent(user.role) && ticket.userId !== user.id)) throw new NotFoundException('Ticket not found.');
    return ticket;
  }

  private async cleanCategory(raw: unknown): Promise<string> {
    const c = String(raw ?? '').trim().toLowerCase();
    return /^[a-z_]{1,30}$/.test(c) ? c : 'general';
  }

  /**
   * May this account link this order to a ticket? Customers: their own. Sellers (the owner or a team member): an order
   * with at least one line of THEIR store. Riders: an order they carry or carried. Agents and warehouse staff: any.
   */
  private async mayLink(user: { id: string; role: string }, order: Order): Promise<boolean> {
    if (user.role === 'customer') return order.customerId === user.id;
    const m = this.orders.manager;
    if (user.role === 'seller') {
      let store = await m.findOne(Seller, { where: { userId: user.id } });
      if (!store) {
        const seat = await m.findOne(SellerTeamMember, { where: { userId: user.id, status: 'active' } });
        if (seat) store = await m.findOne(Seller, { where: { id: seat.sellerId } });
      }
      if (!store) return false;
      const keys = new Set([store.id, ...(store.userId ? [store.userId] : [])]);
      const lines = order.items ?? [];
      const bare = lines.filter((i) => !i.sellerId && !i.productId.startsWith('ext:')).map((i) => i.productId);
      const listed = bare.length ? new Map((await m.find(Product, { where: { id: In(bare) }, select: { id: true, sellerId: true } })).map((p) => [p.id, p.sellerId])) : new Map<string, string | null>();
      return lines.some((i) => keys.has(i.sellerId ?? listed.get(i.productId) ?? ''));
    }
    if (user.role === 'rider') {
      return order.riderId === user.id || (await m.count(DeliveryTask, { where: { orderId: order.id, riderId: user.id } })) > 0;
    }
    return true;
  }

  async open(
    user: { id: string; name: string; role?: string },
    input: { subject: string; category?: string; message: string; orderId?: string; attachments?: unknown },
  ): Promise<TicketView> {
    if (!input?.subject?.trim() || !input?.message?.trim()) {
      throw new BadRequestException('Subject and message are required.');
    }
    const role = user.role ?? 'customer';
    const photos = cleanAttachments(input.attachments);
    let orderId: string | null = null;
    if (input.orderId) {
      const order = await this.orders.findOne({ where: { id: String(input.orderId) } });
      // Same answer for "missing" and "not yours" so order ids can't be probed.
      if (!order || !(await this.mayLink({ id: user.id, role }, order))) throw new BadRequestException('Order not found.');
      orderId = order.id;
    }
    const subject = input.subject.trim().slice(0, 200);
    const message = input.message.trim().slice(0, 4000);
    // Translate first, then store (both before the insert; neither can fail the request).
    const [subjectTr, messageTr] = await Promise.all([this.translateFor(subject, user.id), this.translateFor(message, user.id)]);
    let messageId = '';
    const ticket = await this.tickets.manager.transaction(async (m) => {
      const t = await m.save(
        m.create(SupportTicket, {
          reference: `TKT-${Date.now().toString().slice(-8)}`,
          userId: user.id,
          userName: user.name,
          role,
          subject,
          category: await this.cleanCategory(input.category),
          orderId,
          status: 'open',
          staffUnread: 1,
        }),
      );
      messageId = (await m.save(m.create(SupportMessage, { ticketId: t.id, fromId: user.id, from: user.name, role, text: message, attachments: storeAttachments(photos) }))).id;
      return t;
    });
    await this.keep('support_ticket', ticket.id, subjectTr);
    await this.keep('support_message', messageId, messageTr);
    const view = (await this.one(ticket.id))!;
    this.emitter.toUser(user.id, 'support:updated', view);
    this.emitter.toRoles(AGENT_ROLES, 'support:updated', view);
    // Support works tickets (and the super admin); the other departments cannot open the support pages, so they are not told.
    await this.notifications.toAdmins(
      quotedNotice({ title: 'New support ticket', body: (q) => `${ticket.reference} · ${q}`, text: subject, i18n: subjectTr, max: 200, type: 'support', entityId: ticket.id }),
      'support',
    );
    return view;
  }

  async reply(
    id: string,
    from: { id: string; name: string; role: string },
    text: string,
    attachments?: unknown,
  ): Promise<TicketView> {
    const ticket = await this.tickets.findOne({ where: { id } });
    // Same answer for "missing" and "not yours" so ids can't be probed.
    if (!ticket || (!isAgent(from.role) && ticket.userId !== from.id)) {
      throw new NotFoundException('Ticket not found.');
    }
    const body = String(text ?? '').trim().slice(0, 4000);
    const photos = cleanAttachments(attachments);
    if (!body && !photos.length) throw new BadRequestException('Write a message first.');
    const agent = isAgent(from.role);
    // A closed ticket stays closed: the customer opens a new one (an agent reopens it first with `support:setStatus`).
    const closed = () => new BadRequestException(agent ? 'This ticket is closed. Reopen it first.' : 'This ticket is closed. Open a new ticket if you still need help.');
    if (ticket.status === 'closed') throw closed();
    // Translate first (after the cheap checks, before anything is written), then store.
    const bodyTr = body ? await this.translateFor(body, from.id) : null;
    // One atomic UPDATE for the counters (guarded: a ticket closed a moment ago is refused) and one INSERT for the message.
    const claim = await this.tickets
      .createQueryBuilder()
      .update(SupportTicket)
      .set(
        agent
          ? {
              status: 'pending',
              userUnread: () => 'userUnread + 1',
              // The first agent to answer takes the ticket.
              ...(ticket.assigneeId ? {} : { assigneeId: from.id, assigneeName: from.name }),
            }
          : { status: 'open', staffUnread: () => 'staffUnread + 1' },
      )
      .where("id = :id AND status != 'closed'", { id: ticket.id })
      .execute();
    if (!claim.affected) throw closed();
    const row = await this.messages.save(
      this.messages.create({ ticketId: ticket.id, fromId: from.id, from: from.name, role: from.role, text: body, attachments: storeAttachments(photos) }),
    );
    await this.keep('support_message', row.id, bodyTr);
    const saved = (await this.one(ticket.id))!;
    this.emitter.toUser(saved.userId, 'support:updated', saved);
    this.emitter.toRoles(AGENT_ROLES, 'support:updated', saved);
    // The words are quoted in each recipient's language (the photo-only message has nothing to quote).
    const note = (title: string, lead: (quote: string) => string, type = 'support') =>
      body
        ? quotedNotice({ title, body: lead, text: body, i18n: bodyTr, max: 60, type, entityId: saved.id })
        : { title, body: lead('📷'), type, entityId: saved.id };
    if (agent) {
      await this.notifications.toUser(saved.userId, note('Support reply', (q) => `${saved.reference}: ${q}`));
    } else if (saved.assigneeId) {
      // The agent who has it hears about the reply first.
      await this.notifications.toUser(saved.assigneeId, note('New reply on a ticket', (q) => `${saved.reference} · ${from.name}: ${q}`));
    } else {
      await this.notifications.toRole('admin_support', note('New reply on a ticket', (q) => `${saved.reference} · ${from.name}: ${q}`));
    }
    return saved;
  }

  async setStatus(id: string, status: TicketStatus): Promise<TicketView> {
    if (!TICKET_STATUSES.includes(status)) throw new BadRequestException(`Status must be one of: ${TICKET_STATUSES.join(', ')}.`);
    const ticket = await this.tickets.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found.');
    const changed = ticket.status !== status;
    await this.tickets.update({ id }, { status });
    const saved = (await this.one(id))!;
    this.emitter.toUser(saved.userId, 'support:updated', saved);
    this.emitter.toRoles(AGENT_ROLES, 'support:updated', saved);
    if (changed && status !== 'pending') {
      await this.notifications.toUser(
        saved.userId,
        quotedNotice({
          title: status === 'resolved' ? 'Ticket resolved' : status === 'closed' ? 'Ticket closed' : 'Ticket reopened',
          body: (q) => `${saved.reference} · ${q}`,
          text: saved.subject,
          i18n: saved.subjectI18n,
          max: 200,
          type: 'support',
          entityId: saved.id,
        }),
      );
    }
    return saved;
  }

  /** The owner (or the agents) opened the conversation: its unread counter goes to zero. */
  async markRead(user: { id: string; role: string }, id: string): Promise<TicketView> {
    const ticket = await this.tickets.findOne({ where: { id } });
    if (!ticket || (!isAgent(user.role) && ticket.userId !== user.id)) throw new NotFoundException('Ticket not found.');
    const agent = isAgent(user.role);
    await this.tickets.update({ id }, agent ? { staffUnread: 0 } : { userUnread: 0 });
    const saved = (await this.one(id))!;
    // The reader's other screens clear their badge; agents share one counter, so the team sees it too.
    if (agent) this.emitter.toRoles(AGENT_ROLES, 'support:updated', saved);
    else this.emitter.toUser(saved.userId, 'support:updated', saved);
    return saved;
  }

  /** Hand a ticket to an agent (an admin account), or take it back to the queue with `assigneeId = null`. */
  async assign(actor: { id: string; name: string; role: string }, id: string, assigneeId: string | null): Promise<TicketView> {
    if (!isAgent(actor.role)) throw new BadRequestException('Admins only.');
    const ticket = await this.tickets.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found.');
    let name: string | null = null;
    if (assigneeId) {
      const agent = await this.users.findOne({ where: { id: assigneeId }, select: ['id', 'name', 'role', 'active'] });
      if (!agent || !isAgent(agent.role) || agent.active === false) throw new BadRequestException('Choose an active admin account.');
      name = agent.name;
    }
    await this.tickets.update({ id }, { assigneeId: assigneeId ?? null, assigneeName: name });
    const saved = (await this.one(id))!;
    this.emitter.toRoles(AGENT_ROLES, 'support:updated', saved);
    if (assigneeId && assigneeId !== actor.id) {
      await this.notifications.toUser(
        assigneeId,
        quotedNotice({ title: 'Ticket assigned to you', body: (q) => `${saved.reference} · ${q}`, text: saved.subject, i18n: saved.subjectI18n, max: 200, type: 'support', entityId: saved.id }),
      );
    }
    return saved;
  }

  /**
   * `translate:text` for `support_ticket` (id = the ticket) and `support_message` (id = the message). PRIVATE: only the
   * ticket's owner and the support agents may read it, so only they may translate it; anyone else (and a made-up id)
   * gets the same "Nothing to translate." as a ticket that does not exist.
   */
  async translate(user: { id: string; role: string }, kind: unknown, id: unknown, target: unknown) {
    if (!this.translations) throw new Error('Translation is not available right now. Try again later.');
    const nothing = 'Nothing to translate.';
    if ((kind !== 'support_ticket' && kind !== 'support_message') || typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error(nothing);
    const ticketId = kind === 'support_message' ? (await this.messages.findOne({ where: { id } }))?.ticketId : id;
    const ticket = ticketId ? await this.tickets.findOne({ where: { id: ticketId } }) : null;
    if (!ticket || (!isAgent(user.role) && ticket.userId !== user.id)) throw new Error(nothing);
    return this.translations.translateStored(kind, id, target, { private: true });
  }
}
