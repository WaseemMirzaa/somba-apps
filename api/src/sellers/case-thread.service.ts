import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CaseSellerMessage, Dispute, Exchange, Replacement, Seller } from '../database/entities';
import type { CaseKind } from '../database/entities';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ROLE_GROUPS, inRoleGroup } from '../common/role-groups';
import { TranslationService } from '../translation/translation.service';
import type { TextI18n } from '../translation/translation.service';
import { SellerAfterSaleViewService } from './seller-after-sale.service';
import { TeamDirectory } from './team-directory';

export const CASE_KINDS: readonly CaseKind[] = ['return', 'exchange', 'replacement'];
const NOT_FOUND = 'Request not found.';
const MAX = 2000;

export interface CaseThreadMessageView {
  id: string;
  caseKind: CaseKind;
  caseId: string;
  authorId: string | null;
  authorName: string;
  authorSide: 'seller' | 'support';
  text: string;
  /** Both languages of `text` (translated when it was written); absent when no translation is known. */
  textI18n?: TextI18n;
  createdAt: Date;
  readBySellerAt: Date | null;
  readBySupportAt: Date | null;
}

interface Caller {
  id: string;
  role: string;
  name: string;
}
interface CaseRef {
  id: string;
  sellerId: string;
  reference: string;
  orderReference: string;
}

/**
 * The PRIVATE thread between a store and KOMORIKO support about one return, exchange or replacement (docs/contracts/admin-controls.md §13).
 * The customer never sees it and the customer <-> support thread (`dispute_messages`) is separate. A store reads and writes only while
 * the section is on for it and only on its own cases; the support managers (`sellerAfterSaleManage`) always; finance reads.
 */
@Injectable()
export class CaseThreadService {
  constructor(
    @InjectRepository(CaseSellerMessage) private readonly msgs: Repository<CaseSellerMessage>,
    @InjectRepository(Dispute) private readonly disputes: Repository<Dispute>,
    @InjectRepository(Exchange) private readonly exchanges: Repository<Exchange>,
    @InjectRepository(Replacement) private readonly replacements: Repository<Replacement>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    private readonly view: SellerAfterSaleViewService,
    private readonly emitter: RealtimeEmitter,
    private readonly team: TeamDirectory,
    private readonly notifications: NotificationsService,
    private readonly translations?: TranslationService,
  ) {}

  private static kindOf(raw: unknown): CaseKind {
    if (!CASE_KINDS.includes(raw as CaseKind)) throw new Error(NOT_FOUND);
    return raw as CaseKind;
  }

  /** The case a thread belongs to (a return only; a dispute has no seller thread). Null sellerId = the case names no store. */
  private async caseOf(kind: CaseKind, caseId: unknown): Promise<CaseRef> {
    const id = String(caseId ?? '');
    if (!id) throw new Error(NOT_FOUND);
    const row =
      kind === 'return'
        ? await this.disputes.findOne({ where: { id, type: 'return' } })
        : kind === 'exchange'
          ? await this.exchanges.findOne({ where: { id } })
          : await this.replacements.findOne({ where: { id } });
    if (!row || !row.sellerId) throw new Error(NOT_FOUND);
    return { id: row.id, sellerId: row.sellerId, reference: row.reference, orderReference: row.orderReference };
  }

  /**
   * Who is asking, and for which store: `{ seller: true, sellerId }` for a store account (the section must be on and the case theirs),
   * `{ seller: false, write }` for staff. Everyone else: "Not allowed.".
   */
  private async side(user: Caller, kind: CaseKind, c: CaseRef, write: boolean): Promise<{ seller: boolean }> {
    if (user.role === 'seller') {
      const ctx = await this.view.threadSide(user, kind, write);
      if (ctx.seller.id !== c.sellerId) throw new Error(NOT_FOUND);
      return { seller: true };
    }
    if (inRoleGroup(user.role, 'sellerAfterSaleManage')) return { seller: false };
    // Finance reads the desk (`disputeDesk`) but never writes in the thread.
    if (!write && user.role === 'admin_finance') return { seller: false };
    throw new Error('Not allowed.');
  }

  private async serve(rows: CaseSellerMessage[]): Promise<CaseThreadMessageView[]> {
    const i18n = await this.translations?.i18nFor('case_seller_message', rows.map((m) => ({ id: m.id, text: m.text })));
    return rows.map((m) => ({
      id: m.id,
      caseKind: m.caseKind,
      caseId: m.caseId,
      authorId: m.authorId,
      authorName: m.authorName,
      authorSide: m.authorSide,
      text: m.text,
      ...(i18n?.has(m.id) ? { textI18n: i18n.get(m.id) } : {}),
      createdAt: m.createdAt,
      readBySellerAt: m.readBySellerAt,
      readBySupportAt: m.readBySupportAt,
    }));
  }

  /** `caseThread:list { kind, caseId }`: the thread, oldest first. */
  async list(user: Caller, body: { kind?: unknown; caseId?: unknown } | undefined): Promise<CaseThreadMessageView[]> {
    const kind = CaseThreadService.kindOf(body?.kind);
    const c = await this.caseOf(kind, body?.caseId);
    await this.side(user, kind, c, false);
    return this.serve(await this.msgs.find({ where: { caseKind: kind, caseId: c.id }, order: { createdAt: 'ASC' }, take: 500 }));
  }

  /** `caseThread:send { kind, caseId, text }`: a store writes to support, or support writes to the store. */
  async send(user: Caller, body: { kind?: unknown; caseId?: unknown; text?: unknown } | undefined): Promise<CaseThreadMessageView> {
    const kind = CaseThreadService.kindOf(body?.kind);
    const c = await this.caseOf(kind, body?.caseId);
    const { seller } = await this.side(user, kind, c, true);
    const text = String(body?.text ?? '').trim();
    if (!text) throw new Error('Write a message first.');
    if (text.length > MAX) throw new Error('Messages are at most 2000 characters.');
    // Translate first, then store (the writer's own language is the hint, like every stored text).
    const tr = this.translations ? await this.translations.translateForSender(text, user.id) : null;
    const now = new Date();
    const saved = await this.msgs.save(
      this.msgs.create({
        caseKind: kind,
        caseId: c.id,
        sellerId: c.sellerId,
        authorId: user.id,
        authorName: String(user.name ?? '').slice(0, 120),
        authorSide: seller ? 'seller' : 'support',
        text,
        // The writer has read what they wrote.
        readBySellerAt: seller ? now : null,
        readBySupportAt: seller ? null : now,
      }),
    );
    await this.translations?.saveTranslated('case_seller_message', saved.id, tr);
    const [view] = await this.serve([saved]);
    await this.deliver(kind, c, view, seller);
    return view;
  }

  /** Push the message to the store (when its section is on) and to the managing staff; one notice to whoever has to answer. */
  private async deliver(kind: CaseKind, c: CaseRef, view: CaseThreadMessageView, fromSeller: boolean): Promise<void> {
    const store = await this.sellers.findOne({ where: { id: c.sellerId } });
    const on = store ? await this.view.readerAccess(store, kind) : false;
    const payload = { ...view, reference: c.reference, orderReference: c.orderReference };
    this.emitter.toRoles([...ROLE_GROUPS.sellerAfterSaleManage, 'admin_finance'], 'caseThread:message', payload);
    if (store?.userId && on) {
      this.emitter.toUser(store.userId, 'caseThread:message', payload);
      for (const to of await this.team.recipientsFor(store.userId, 'orders')) this.emitter.toUser(to, 'caseThread:message', payload);
    }
    try {
      const lead = `${c.reference} · ${c.orderReference}`;
      if (fromSeller) {
        await this.notifications.toRole('admin_support', { title: `Seller message on ${c.reference}`, body: lead, type: kind, entityId: c.id });
      } else if (store?.userId && on) {
        await this.notifications.toUser(store.userId, { title: 'Message from KOMORIKO support', body: lead, type: `seller_${kind}`, entityId: c.id });
      }
    } catch {
      /* the message is saved and pushed; a notice that fails does not undo it */
    }
  }

  /** `caseThread:markRead { kind, caseId }`: a store marks support's messages read; support marks the store's. */
  async markRead(user: Caller, body: { kind?: unknown; caseId?: unknown } | undefined): Promise<{ marked: number }> {
    const kind = CaseThreadService.kindOf(body?.kind);
    const c = await this.caseOf(kind, body?.caseId);
    const { seller } = await this.side(user, kind, c, false);
    // Finance only reads: it leaves the unread counts to the people who answer.
    if (!seller && user.role === 'admin_finance') return { marked: 0 };
    const res = await this.msgs
      .createQueryBuilder()
      .update(CaseSellerMessage)
      .set(seller ? { readBySellerAt: new Date() } : { readBySupportAt: new Date() })
      .where(`caseKind = :kind AND caseId = :id AND authorSide = :side AND ${seller ? 'readBySellerAt' : 'readBySupportAt'} IS NULL`, { kind, id: c.id, side: seller ? 'support' : 'seller' })
      .execute();
    return { marked: res.affected ?? 0 };
  }

  /**
   * `caseThread:unread`: a store gets the unread support messages per section (only sections that are on); staff get the number of
   * cases with unread store messages and which cases they are.
   */
  async unread(user: Caller): Promise<Record<string, unknown>> {
    if (user.role === 'seller') {
      const store = await this.view.storeOf(user);
      if (!store) return { returns: 0, exchanges: 0, replacements: 0, total: 0 };
      return this.view.unreadFor(store.id);
    }
    if (!inRoleGroup(user.role, 'sellerAfterSaleManage') && user.role !== 'admin_finance') throw new Error('Not allowed.');
    const rows = await this.msgs
      .createQueryBuilder('m')
      .select('m.caseKind', 'kind')
      .addSelect('m.caseId', 'caseId')
      .addSelect('COUNT(*)', 'n')
      .where('m.authorSide = :side AND m.readBySupportAt IS NULL', { side: 'seller' })
      .groupBy('m.caseKind')
      .addGroupBy('m.caseId')
      .getRawMany<{ kind: CaseKind; caseId: string; n: string }>();
    const cases = rows.slice(0, 500).map((r) => ({ kind: r.kind, caseId: r.caseId, unread: Number(r.n) }));
    return { count: rows.length, cases };
  }

  /** `translate:text` for `case_seller_message`: only people who may read the thread. */
  async translate(user: Caller, id: unknown, target: unknown) {
    if (!this.translations) throw new Error('Translation is not available right now. Try again later.');
    const nothing = 'Nothing to translate.';
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error(nothing);
    const m = await this.msgs.findOne({ where: { id } });
    if (!m) throw new Error(nothing);
    try {
      const c = await this.caseOf(m.caseKind, m.caseId);
      await this.side(user, m.caseKind, c, false);
    } catch {
      throw new Error(nothing);
    }
    return this.translations.translateStored('case_seller_message', id, target, { private: true });
  }
}
