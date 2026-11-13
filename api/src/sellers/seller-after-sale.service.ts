import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CaseSellerMessage, DeliveryTask, Seller } from '../database/entities';
import type { CaseKind } from '../database/entities';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { AfterSaleAccessService } from './after-sale-access.service';
import { OFF_FOR_STORE, SECTION_OF } from './after-sale-access';
import { SellerContextService } from './seller-context';
import type { SellerCaller, SellerContext } from './seller-context';
import { TeamDirectory } from './team-directory';
import { caseLine, customerMessageView, redactCase, withholdReasons } from './seller-case-view';
import type { SellerCaseView } from './seller-case-view';

type Any = Record<string, unknown>;

/** The live event each kind uses on the store's socket (the same names the customer and the desk hear, with the redacted shape). */
const EVENT: Record<CaseKind, string> = { return: 'dispute:updated', exchange: 'exchange:updated', replacement: 'replacement:updated' };
const NOTICE_TYPE: Record<CaseKind, string> = { return: 'seller_return', exchange: 'seller_exchange', replacement: 'seller_replacement' };
const WORD: Record<CaseKind, string> = { return: 'Return', exchange: 'Exchange', replacement: 'Replacement' };

/**
 * The seller portal's read-only after-sale view (docs/contracts/admin-controls.md §13): who may read which section, the
 * redacted case views (customer's first name only, no customer thread), the live pushes to the store and the info notices.
 * Support decides everything; nothing here writes a case.
 */
@Injectable()
export class SellerAfterSaleViewService {
  private readonly logger = new Logger(SellerAfterSaleViewService.name);

  constructor(
    private readonly access: AfterSaleAccessService,
    private readonly ctx: SellerContextService,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    @InjectRepository(DeliveryTask) private readonly tasks: Repository<DeliveryTask>,
    @InjectRepository(CaseSellerMessage) private readonly threads: Repository<CaseSellerMessage>,
    private readonly emitter: RealtimeEmitter,
    private readonly team: TeamDirectory,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /**
   * The store a seller-portal account reads this kind of case for: its context when the account works for a store, may read its
   * orders and the section is on; null otherwise (the caller then answers as before: the account's own purchases only).
   */
  async readerOf(user: SellerCaller, kind: CaseKind): Promise<SellerContext | null> {
    if (!user || user.role !== 'seller') return null;
    try {
      const c = await this.ctx.resolve(user, 'orders', { write: false });
      const access = await this.access.forSeller(c.seller);
      return access[SECTION_OF[kind]] ? c : null;
    } catch {
      return null;
    }
  }

  /** Like {@link readerOf} but for the thread: throws the refusal ("This section is turned off for your store."). `write` also needs an active store. */
  async threadSide(user: SellerCaller, kind: CaseKind, write: boolean): Promise<SellerContext> {
    const c = await this.ctx.resolve(user, 'orders', { write });
    const access = await this.access.forSeller(c.seller);
    if (!access[SECTION_OF[kind]]) throw new Error(OFF_FOR_STORE);
    return c;
  }

  /** Is this kind's section on for the store? */
  async readerAccess(seller: Pick<Seller, 'afterSaleAccess'>, kind: CaseKind): Promise<boolean> {
    return (await this.access.forSeller(seller))[SECTION_OF[kind]];
  }

  /** What admin shows this store right now (the resolved switches). */
  accessOf(seller: Pick<Seller, 'afterSaleAccess'>) {
    return this.access.forSeller(seller);
  }

  /** The store an account works for (no permission or section check), or null. */
  async storeOf(user: SellerCaller): Promise<Seller | null> {
    return (await this.ctx.membership(user.id))?.seller ?? null;
  }

  // ── Views ──────────────────────────────────────────────────────────────────

  /** Redact served views and add what the store needs beside them: unread support messages and, for returns, the legs. */
  async present(kind: CaseKind, views: Any[], sellerId: string): Promise<SellerCaseView[]> {
    if (!views.length) return [];
    // What admin shows this store (§13): without `reasons` the customer's own words are removed HERE, whatever asked (list, detail, push).
    const access = await this.access.forSellerId(sellerId);
    const out = views.map((v) => {
      const view = redactCase(kind, v);
      view.customerThreadShared = access?.customerThread === true;
      return access?.reasons === true ? view : withholdReasons(view);
    });
    const ids = out.map((v) => v.id);
    const unread = await this.threads
      .createQueryBuilder('m')
      .select('m.caseId', 'caseId')
      .addSelect('COUNT(*)', 'n')
      .where('m.caseKind = :kind AND m.sellerId = :sellerId AND m.caseId IN (:...ids) AND m.authorSide = :side AND m.readBySellerAt IS NULL', { kind, sellerId, ids, side: 'support' })
      .groupBy('m.caseId')
      .getRawMany<{ caseId: string; n: string }>();
    const by = new Map(unread.map((r) => [r.caseId, Number(r.n)]));
    for (const v of out) v.unread = by.get(v.id) ?? 0;
    if (kind === 'return') {
      const legs = await this.tasks.find({ where: { disputeId: In(ids), kind: In(['return_pickup', 'return_to_seller']) }, select: ['id', 'disputeId', 'kind', 'status'] });
      for (const v of out) {
        const mine = legs.filter((t) => t.disputeId === v.id);
        v.legs = { pickup: mine.find((t) => t.kind === 'return_pickup')?.status ?? null, returnToSeller: mine.find((t) => t.kind === 'return_to_seller')?.status ?? null };
      }
    }
    return out;
  }

  // ── Live updates and notices ───────────────────────────────────────────────

  /** The people a store's live events reach: the owner and the staff whose role handles orders. */
  private async audience(seller: Pick<Seller, 'userId'>): Promise<string[]> {
    if (!seller.userId) return [];
    return [seller.userId, ...(await this.team.recipientsFor(seller.userId, 'orders'))];
  }

  /**
   * A case on this store changed (opened, moved on, decided): push the redacted view to the store, but only while that section is on
   * for it. `kind`'s event name is the one the desk hears. Best-effort: a failure here never fails the case.
   */
  async push(kind: CaseKind, view: Any, event: 'opened' | 'updated' = 'updated'): Promise<void> {
    try {
      const sellerId = typeof view.sellerId === 'string' ? view.sellerId : null;
      if (!sellerId) return;
      const seller = await this.sellers.findOne({ where: { id: sellerId } });
      if (!seller || !(await this.access.forSeller(seller))[SECTION_OF[kind]]) return;
      const [redacted] = await this.present(kind, [view], seller.id);
      for (const to of await this.audience(seller)) this.emitter.toUser(to, EVENT[kind], redacted);
      if (event === 'opened') await this.notify(seller, kind, view, `${WORD[kind]}${kind === 'return' ? ' opened' : ' requested'} on your item`);
    } catch (e) {
      this.logger.warn(`seller after-sale push skipped: ${(e as Error).message}`);
    }
  }

  /**
   * A message was added to a return's customer <-> support conversation: tell the store LIVE, read-only, but only while admin shares
   * that conversation with it (`customerThread`) and the Returns section is on. Photos go along only for a store shown the reasons.
   */
  async pushCustomerMessage(dispute: { sellerId?: string | null; type?: string }, message: Any): Promise<void> {
    try {
      if (dispute.type !== 'return' || !dispute.sellerId) return;
      const seller = await this.sellers.findOne({ where: { id: dispute.sellerId } });
      if (!seller) return;
      const access = await this.access.forSeller(seller);
      if (!access.returns || !access.customerThread) return;
      const view = customerMessageView(message as never, access.reasons);
      if (!view) return;
      for (const to of await this.audience(seller)) this.emitter.toUser(to, 'caseThread:customerMessage', view);
    } catch (e) {
      this.logger.warn(`customer message push skipped: ${(e as Error).message}`);
    }
  }

  /** Support decided the case: an info notice to the store (only while the section is on). */
  async decided(kind: CaseKind, view: Any): Promise<void> {
    try {
      const sellerId = typeof view.sellerId === 'string' ? view.sellerId : null;
      const seller = sellerId ? await this.sellers.findOne({ where: { id: sellerId } }) : null;
      if (!seller || !(await this.access.forSeller(seller))[SECTION_OF[kind]]) return;
      await this.notify(seller, kind, view, `${WORD[kind]} decided`);
    } catch (e) {
      this.logger.warn(`seller after-sale notice skipped: ${(e as Error).message}`);
    }
  }

  private async notify(seller: Seller, kind: CaseKind, view: Any, title: string): Promise<void> {
    if (!seller.userId || !this.notifications) return;
    await this.notifications.toUser(seller.userId, {
      title,
      body: caseLine(view as { reference?: string; orderReference?: string }),
      type: NOTICE_TYPE[kind],
      entityId: String(view.id),
    });
  }

  /** Staff-visible helper: the cases of this kind whose store has unread support messages, for the nav badge. */
  async unreadFor(sellerId: string): Promise<{ returns: number; exchanges: number; replacements: number; total: number }> {
    const access = await this.access.forSellerId(sellerId);
    const rows = await this.threads
      .createQueryBuilder('m')
      .select('m.caseKind', 'kind')
      .addSelect('COUNT(*)', 'n')
      .where('m.sellerId = :sellerId AND m.authorSide = :side AND m.readBySellerAt IS NULL', { sellerId, side: 'support' })
      .groupBy('m.caseKind')
      .getRawMany<{ kind: CaseKind; n: string }>();
    const n = (k: CaseKind) => (access && access[SECTION_OF[k]] ? Number(rows.find((r) => r.kind === k)?.n ?? 0) : 0);
    const out = { returns: n('return'), exchanges: n('exchange'), replacements: n('replacement'), total: 0 };
    out.total = out.returns + out.exchanges + out.replacements;
    return out;
  }
}
