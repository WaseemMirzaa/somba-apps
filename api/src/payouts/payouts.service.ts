import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, IsNull, Repository } from 'typeorm';
import { Order, OrderItem, Payout, PayoutStatementLine, Product, Seller } from '../database/entities';
import { SettingsService } from '../content/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { WalletService } from '../wallet/wallet.service';
import { PaymentsService } from '../payments/payments.service';
import { PAWAPAY_CLIENT, PawapayClient, PawapayUnavailableError } from '../payments/pawapay.provider';

const FINANCE_ROOMS = ['admin', 'admin_finance'];
/** Order states whose money is not earned yet (the parcel is still on its way). */
const IN_PROGRESS = ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery'];
/** A payout in any of these states has "used" the lines on its statement (a rejected one releases them). */
const LIVE_PAYOUT = ['requested', 'sending', 'paid'] as const;
const MAX_BATCH = 100;
const round2 = (v: number) => Number(v.toFixed(2));

export interface SellerBalance {
  earned: number;
  committed: number;
  available: number;
  owedUsd: number;
  /** The CURRENT rate: it applies to NEW orders only (past orders keep the rate stored on their lines). */
  commissionPct: number;
  /** Commission already deducted from `earned` (sum of the amounts stored on the lines). */
  commissionUsd: number;
  /** The platform's minimum payout, and how long delivered money is held before it can be withdrawn. */
  minPayoutUsd: number;
  holdHours: number;
  /** Delivered, but still inside the hold (net of commission): it becomes withdrawable at `nextClearanceAt`. */
  clearingUsd: number;
  nextClearanceAt: Date | null;
  /** Net of orders still on their way (not earned yet). */
  inProgressUsd: number;
}

/** What one line is worth to the seller: price x qty, less its share of a store coupon (the seller pays for it). */
export const lineGross = (i: Pick<OrderItem, 'priceUsd' | 'qty' | 'couponDiscountUsd'>): number => round2(i.priceUsd * i.qty - (Number(i.couponDiscountUsd) || 0));

export interface StatementTotals {
  grossUsd: number;
  commissionUsd: number;
  refundsUsd: number;
  netUsd: number;
  openingBalanceUsd: number;
  closingBalanceUsd: number;
  amountUsd: number;
}

export interface BatchResult {
  payoutId: string;
  ok: boolean;
  error?: string;
  payout?: Payout;
}

/** The first phone number in a payout destination ("Airtel +243 97 123 4567, J. Mukendi" → "+243971234567"). */
export function phoneIn(account: string | null): string | null {
  const m = /\+?\d[\d\s().-]{7,18}\d/.exec(account ?? '');
  if (!m) return null;
  const digits = m[0].replace(/[^\d+]/g, '');
  return digits.replace(/\D/g, '').length >= 9 ? digits : null;
}

@Injectable()
export class PayoutsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PayoutsService.name);
  private sweeper: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(Payout) private readonly payouts: Repository<Payout>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    private readonly settings: SettingsService,
    private readonly wallet: WalletService,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
    @InjectRepository(PayoutStatementLine) private readonly statementLines: Repository<PayoutStatementLine>,
    @Optional() private readonly payments: PaymentsService | null = null,
    @Optional() @Inject(PAWAPAY_CLIENT) private readonly pawapay: PawapayClient | null = null,
  ) {}

  onModuleInit() {
    if (!this.pawapay) return;
    // pawaPay callbacks for payouts arrive on the payments webhook; transfers whose callback was missed are checked here.
    this.payments?.registerPayoutCallbackHandler((ref) => this.reconcilePawapay(ref));
    this.sweeper = setInterval(() => void this.reconcileSending().catch(() => undefined), 120_000);
    this.sweeper.unref();
  }

  onModuleDestroy() {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  /** Mobile-money payouts can be sent through pawaPay. */
  get canSendWithPawapay(): boolean {
    return !!this.pawapay;
  }

  /** One payout request at a time per seller (this process): two clicks must not settle the same lines twice. */
  private readonly requestLocks = new Map<string, Promise<unknown>>();
  private async serialized<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.requestLocks.get(key) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(fn);
    const tail = run.catch(() => undefined);
    this.requestLocks.set(key, tail);
    try {
      return await run;
    } finally {
      if (this.requestLocks.get(key) === tail) this.requestLocks.delete(key);
    }
  }

  /**
   * What a seller may withdraw right now: sales of THEIR products on orders that
   * were DELIVERED (and have cleared the hold, 48h by default in production),
   * minus the platform commission STORED on each line when the order was placed
   * (so changing the global rate never rewrites past orders), minus everything
   * already requested or paid.
   * Refunds / returns after a payout can push it BELOW zero: `available` is then
   * negative and `owedUsd` is what the seller owes back (nothing can be requested).
   */
  async available(userId: string): Promise<SellerBalance> {
    const { eligible, ...balance } = await this.balance(userId);
    void eligible;
    return balance;
  }

  private async balance(userId: string): Promise<SellerBalance & { eligible: { order: Order; item: OrderItem }[] }> {
    const seller = await this.sellers.findOne({ where: { userId } });
    const sellerIds = [userId, ...(seller ? [seller.id] : [])];
    const mine = new Set((await this.products.find({ where: { sellerId: In(sellerIds) }, select: { id: true } })).map((p) => p.id));
    const commissionPct = Math.min(100, Math.max(0, Number((await this.settings.get('commissionPct')) ?? 12)));
    const holdHours = await this.holdHours();
    const minPayoutUsd = Number((await this.settings.get('minPayoutUsd')) ?? 10);
    const cutoff = new Date(Date.now() - holdHours * 3_600_000);
    const eligible: { order: Order; item: OrderItem }[] = [];
    let gross = 0;
    let commission = 0;
    let clearing = 0;
    let nextClearanceAt: Date | null = null;
    let inProgress = 0;
    if (mine.size) {
      const rows = await this.orders
        .createQueryBuilder('o')
        .innerJoinAndSelect('o.items', 'i')
        .where("(o.status = 'delivered' OR o.status IN (:...open)) AND i.productId IN (:...ids)", { open: IN_PROGRESS, ids: [...mine] })
        .getMany();
      for (const o of rows) {
        for (const i of o.items ?? []) {
          if (!mine.has(i.productId) || i.fulfilment === 'cancelled') continue;
          const net = round2(lineGross(i) - (Number(i.commissionUsd) || 0));
          if (o.status !== 'delivered') {
            inProgress += net;
          } else if (o.updatedAt > cutoff) {
            // Delivered, still inside the hold: counted, not yet withdrawable.
            clearing += net;
            const at = new Date(o.updatedAt.getTime() + holdHours * 3_600_000);
            if (!nextClearanceAt || at < nextClearanceAt) nextClearanceAt = at;
          } else {
            eligible.push({ order: o, item: i });
            gross += lineGross(i);
            commission += Number(i.commissionUsd) || 0;
          }
        }
      }
    }
    const earned = round2(gross - commission);
    const open = await this.payouts.find({ where: { sellerId: userId, status: In([...LIVE_PAYOUT]) } });
    const committed = round2(open.reduce((t, p) => t + p.amountUsd, 0));
    const available = round2(earned - committed);
    return {
      earned,
      committed,
      available,
      owedUsd: Math.max(0, round2(-available)),
      commissionPct,
      commissionUsd: round2(commission),
      minPayoutUsd,
      holdHours,
      clearingUsd: round2(clearing),
      nextClearanceAt,
      inProgressUsd: round2(inProgress),
      eligible,
    };
  }

  /** Hours delivered money is held before it can be withdrawn (setting, else env, else 48 in production / 0 otherwise). */
  async holdHours(): Promise<number> {
    return Number((await this.settings.get('payoutClearanceHours')) ?? process.env.PAYOUT_CLEARANCE_HOURS ?? (process.env.NODE_ENV === 'production' ? 48 : 0));
  }

  async request(
    seller: { id: string; name: string },
    amountUsd: number,
    method = 'bank',
    account?: string,
  ): Promise<Payout> {
    const min = Number((await this.settings.get('minPayoutUsd')) ?? 10);
    if (!(amountUsd >= min)) throw new BadRequestException(`The minimum payout is $${min}.`);
    const kind = ['bank', 'mobile_money', 'wallet'].includes(method) ? method : 'bank';
    // Money that leaves the platform needs a destination.
    const dest = String(account ?? '').trim().slice(0, 250);
    if (kind !== 'wallet' && dest.length < 5) {
      throw new BadRequestException(kind === 'bank' ? 'Enter your bank account (holder and IBAN / account number).' : 'Enter the mobile-money number to pay.');
    }
    return this.serialized(seller.id, async () => {
      const bal = await this.balance(seller.id);
      const { available } = bal;
      if (available <= 0) {
        throw new BadRequestException(
          available < 0
            ? `Refunds and returns left your balance at -$${(-available).toFixed(2)}: nothing can be withdrawn until new sales cover it.`
            : `You can withdraw up to $${available.toFixed(2)} right now.`,
        );
      }
      if (amountUsd > available + 0.001) {
        throw new BadRequestException(`You can withdraw up to $${available.toFixed(2)} right now.`);
      }
      // The payout and its settlement statement commit together (or not at all).
      const payout = await this.payouts.manager.transaction(async (m) => {
        const created = await m.save(
          Payout,
          m.create(Payout, {
            reference: PayoutsService.newReference(),
            sellerId: seller.id,
            sellerName: seller.name,
            amountUsd,
            method: kind,
            account: kind === 'wallet' ? null : dest,
            status: 'requested',
          }),
        );
        const st = await this.buildStatement(m, seller.id, bal.eligible, created.id);
        if (st.lines.length) await m.save(PayoutStatementLine, st.lines);
        created.statementGrossUsd = st.grossUsd;
        created.statementCommissionUsd = st.commissionUsd;
        created.statementRefundsUsd = st.refundsUsd;
        created.statementNetUsd = st.netUsd;
        created.openingBalanceUsd = round2(available - st.netUsd);
        created.closingBalanceUsd = round2(available - amountUsd);
        return m.save(Payout, created);
      });
      this.emitter.toUser(seller.id, 'payout:created', payout);
      this.emitter.toRoles(FINANCE_ROOMS, 'payout:created', payout);
      const notice = {
        title: 'Payout requested',
        body: `${payout.reference} · ${seller.name} · $${amountUsd.toFixed(2)}`,
        type: 'payout',
        entityId: payout.id,
      };
      await this.notifications.toRole('admin_finance', notice);
      await this.notifications.toRole('admin', notice);
      return payout;
    });
  }

  /**
   * The statement of a payout being requested: every delivered, cleared, non-cancelled
   * line not yet on a live (non-rejected) statement is a 'sale' (gross minus the
   * commission stored on the line); every line settled earlier whose order has since
   * been returned / cancelled gets one negative 'refund' line (the net previously
   * settled). A rejected payout's lines are ignored here, so they are settled again.
   */
  private async buildStatement(
    m: EntityManager,
    sellerUserId: string,
    eligible: { order: Order; item: OrderItem }[],
    payoutId: string,
  ) {
    const live = await m.find(Payout, { where: { sellerId: sellerUserId, status: In([...LIVE_PAYOUT]) }, select: { id: true } });
    const prior = live.length ? await m.find(PayoutStatementLine, { where: { payoutId: In(live.map((p) => p.id)) } }) : [];
    const sold = new Map<string, PayoutStatementLine>();
    const clawed = new Set<string>();
    for (const l of prior) {
      if (l.kind === 'sale') sold.set(l.orderItemId, l);
      else clawed.add(l.orderItemId);
    }
    const lines: PayoutStatementLine[] = [];
    const eligibleIds = new Set(eligible.map((e) => e.item.id));

    for (const { order, item } of eligible) {
      if (sold.has(item.id)) continue;
      const grossUsd = lineGross(item);
      const commissionUsd = round2(Number(item.commissionUsd) || 0);
      lines.push(
        m.create(PayoutStatementLine, {
          payoutId,
          sellerId: sellerUserId,
          orderItemId: item.id,
          orderId: order.id,
          orderReference: order.reference,
          productName: item.productName,
          variant: item.variant,
          qty: item.qty,
          kind: 'sale',
          grossUsd,
          commissionPct: Number(item.commissionPct) || 0,
          commissionUsd,
          refundUsd: 0,
          netUsd: round2(grossUsd - commissionUsd),
          deliveredAt: order.updatedAt ?? null,
        }),
      );
    }

    const pending = [...sold.values()].filter((l) => !clawed.has(l.orderItemId) && !eligibleIds.has(l.orderItemId));
    if (pending.length) {
      const orders = await m.find(Order, { where: { id: In([...new Set(pending.map((l) => l.orderId))]) }, relations: { items: true } });
      const byId = new Map(orders.map((o) => [o.id, o]));
      for (const l of pending) {
        const o = byId.get(l.orderId);
        const it = o?.items?.find((x) => x.id === l.orderItemId);
        // Still delivered (merely back inside the hold window): nothing to claw back.
        if (o && it && o.status === 'delivered' && it.fulfilment !== 'cancelled') continue;
        lines.push(
          m.create(PayoutStatementLine, {
            payoutId,
            sellerId: sellerUserId,
            orderItemId: l.orderItemId,
            orderId: l.orderId,
            orderReference: l.orderReference,
            productName: l.productName,
            variant: l.variant,
            qty: l.qty,
            kind: 'refund',
            grossUsd: 0,
            commissionPct: l.commissionPct,
            commissionUsd: 0,
            refundUsd: l.netUsd,
            netUsd: round2(-l.netUsd),
            deliveredAt: l.deliveredAt,
          }),
        );
      }
    }

    const sum = (f: (l: PayoutStatementLine) => number) => round2(lines.reduce((t, l) => t + f(l), 0));
    return {
      lines,
      grossUsd: sum((l) => l.grossUsd),
      commissionUsd: sum((l) => l.commissionUsd),
      refundsUsd: sum((l) => l.refundUsd),
      netUsd: sum((l) => l.netUsd),
    };
  }

  /**
   * The settlement statement of one payout. A seller reads only their own; finance
   * (admin / admin_finance) any. Payouts issued before statements existed have no
   * lines and `legacy: true`.
   */
  async statement(payoutId: string, user: { id: string; role: string }) {
    const payout = await this.payouts.findOne({ where: { id: String(payoutId ?? '') } });
    const finance = user.role === 'admin' || user.role === 'admin_finance';
    // Same message for "missing" and "not yours": no probing of other sellers' payouts.
    if (!payout || (!finance && !(user.role === 'seller' && payout.sellerId === user.id))) throw new NotFoundException('Payout not found.');
    const rows = await this.statementLines.find({ where: { payoutId: payout.id } });
    const lines = rows.sort(
      (a, b) =>
        (a.kind === b.kind ? 0 : a.kind === 'sale' ? -1 : 1) ||
        String(a.orderReference).localeCompare(String(b.orderReference)) ||
        String(a.productName).localeCompare(String(b.productName)),
    );
    const legacy = payout.statementNetUsd === null || payout.statementNetUsd === undefined;
    const totals: StatementTotals | null = legacy
      ? null
      : {
          grossUsd: payout.statementGrossUsd ?? 0,
          commissionUsd: payout.statementCommissionUsd ?? 0,
          refundsUsd: payout.statementRefundsUsd ?? 0,
          netUsd: payout.statementNetUsd ?? 0,
          openingBalanceUsd: payout.openingBalanceUsd ?? 0,
          closingBalanceUsd: payout.closingBalanceUsd ?? 0,
          amountUsd: payout.amountUsd,
        };
    return { payout, lines, totals, legacy };
  }

  /**
   * Approve several payouts in one go. Each goes through `approve()` on its own (atomic
   * claim, wallet credit, notification), so one failure (e.g. a bank payout without a
   * transfer reference) never blocks or rolls back the others.
   */
  async approveBatch(items: { payoutId: string; providerRef?: string }[]): Promise<BatchResult[]> {
    if (!Array.isArray(items) || !items.length) throw new BadRequestException('Select at least one payout.');
    if (items.length > MAX_BATCH) throw new BadRequestException(`Approve at most ${MAX_BATCH} payouts at a time.`);
    const seen = new Set<string>();
    const results: BatchResult[] = [];
    for (const it of items) {
      const payoutId = String(it?.payoutId ?? '');
      if (!payoutId || seen.has(payoutId)) {
        results.push({ payoutId, ok: false, error: payoutId ? 'Listed twice.' : 'Missing payout id.' });
        continue;
      }
      seen.add(payoutId);
      try {
        results.push({ payoutId, ok: true, payout: await this.approve(payoutId, it.providerRef) });
      } catch (e) {
        results.push({ payoutId, ok: false, error: (e as Error).message });
      }
    }
    return results;
  }

  /**
   * Finance marks a payout paid. For bank / mobile-money payouts the money is
   * sent outside the platform, so finance must enter the transfer reference;
   * only "wallet" payouts are credited to the seller's in-app wallet.
   */
  async approve(payoutId: string, providerRef?: string): Promise<Payout> {
    const payout = await this.payouts.findOne({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout not found.');
    const ref = String(providerRef ?? '').trim().slice(0, 100);
    if (payout.method !== 'wallet' && ref.length < 3) {
      throw new BadRequestException('Enter the reference of the transfer you made (bank or mobile-money receipt).');
    }
    // Atomic: two finance users clicking at once pay it out exactly once, and the
    // wallet credit commits together with the status change.
    const won = await this.payouts.manager.transaction(async (m) => {
      const res = await m
        .createQueryBuilder()
        .update(Payout)
        .set({ status: 'paid', providerRef: ref || null })
        .where("id = :id AND status = 'requested'", { id: payoutId })
        .execute();
      if (!res.affected) return false;
      if (payout.method === 'wallet') {
        await this.wallet.apply(payout.sellerId, 'credit', payout.amountUsd, `Payout ${payout.reference}`, m);
      }
      return true;
    });
    if (!won) throw new BadRequestException('This payout is no longer awaiting approval.');
    const saved = (await this.payouts.findOne({ where: { id: payoutId } }))!;
    await this.markLinesPaid(saved.id);
    this.emitter.toUser(saved.sellerId, 'payout:updated', saved);
    this.emitter.toRoles(FINANCE_ROOMS, 'payout:updated', saved);
    await this.tellSuperAdmin('Payout settled', saved, 'was paid');
    await this.notifications.toUser(saved.sellerId, {
      title: 'Payout paid',
      body: `${saved.reference} · $${saved.amountUsd.toFixed(2)} ${saved.method === 'wallet' ? 'credited to your wallet' : `sent to your ${saved.method === 'bank' ? 'bank account' : 'mobile-money number'} (ref ${saved.providerRef})`}.`,
      type: 'payout',
      entityId: saved.id,
    });
    return saved;
  }

  /**
   * "Send with pawaPay": pay a mobile-money payout straight to the seller's number. The payout is `sending` until
   * pawaPay confirms (then `paid` with the network receipt); if pawaPay fails it, it goes back to `requested` and
   * finance is told.
   */
  async sendWithPawapay(payoutId: string): Promise<Payout> {
    if (!this.pawapay) throw new BadRequestException('pawaPay is not connected. Pay by hand and mark the payout paid.');
    const payout = await this.payouts.findOne({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout not found.');
    if (payout.method !== 'mobile_money') throw new BadRequestException('Only mobile-money payouts can be sent with pawaPay.');
    if (payout.status !== 'requested') throw new BadRequestException('This payout is no longer awaiting payment.');
    const phone = phoneIn(payout.account);
    if (!phone) throw new BadRequestException("The seller's payout details have no phone number. Ask them to request again.");
    let provider: string;
    try {
      provider = await this.pawapay.predictProvider(phone);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const ref = this.pawapay.newId();
    const res = await this.payouts
      .createQueryBuilder()
      .update(Payout)
      .set({ status: 'sending', providerRef: ref })
      .where("id = :id AND status = 'requested'", { id: payoutId })
      .execute();
    if (!res.affected) throw new BadRequestException('This payout is no longer awaiting payment.');
    try {
      await this.pawapay.payout({ payoutId: ref, amountUsd: payout.amountUsd, phone, provider, reference: payout.reference });
    } catch (e) {
      if (!(e instanceof PawapayUnavailableError)) {
        await this.payouts.update({ id: payoutId }, { status: 'requested', providerRef: null });
        this.publish((await this.payouts.findOne({ where: { id: payoutId } }))!);
        throw new BadRequestException(`pawaPay refused the payout: ${(e as Error).message}`);
      }
      // No answer: the transfer may exist; the status check settles it.
      this.logger.warn(`Payout ${payout.reference} sent without confirmation: ${e.message}`);
    }
    const saved = (await this.payouts.findOne({ where: { id: payoutId } }))!;
    this.publish(saved);
    await this.notifications.toUser(saved.sellerId, {
      title: 'Payout on its way',
      body: `${saved.reference} · $${saved.amountUsd.toFixed(2)} is being sent to your mobile-money number.`,
      type: 'payout',
      entityId: saved.id,
    });
    return saved;
  }

  /** pawaPay's final word on a payout: COMPLETED → paid with the receipt; FAILED → back to requested. */
  async reconcilePawapay(ref: string): Promise<void> {
    if (!this.pawapay) return;
    const payout = await this.payouts.findOne({ where: { providerRef: ref } });
    if (!payout || payout.status !== 'sending') return;
    let s;
    try {
      s = await this.pawapay.check('payouts', ref);
    } catch (e) {
      this.logger.warn(`Payout status check failed for ${payout.reference}: ${(e as Error).message}`);
      return;
    }
    if (!s.found || !s.final) return;
    const res = await this.payouts
      .createQueryBuilder()
      .update(Payout)
      .set(
        s.succeeded
          ? { status: 'paid', receiptRef: s.providerTransactionId ?? null }
          : { status: 'requested', providerRef: null, note: `pawaPay: ${s.failureMessage ?? 'the transfer failed'}`.slice(0, 250) },
      )
      .where("id = :id AND status = 'sending'", { id: payout.id })
      .execute();
    if (!res.affected) return;
    const saved = (await this.payouts.findOne({ where: { id: payout.id } }))!;
    if (s.succeeded) await this.markLinesPaid(saved.id);
    this.publish(saved);
    if (s.succeeded) {
      await this.tellSuperAdmin('Payout settled', saved, 'was paid through pawaPay');
      await this.notifications.toUser(saved.sellerId, {
        title: 'Payout paid',
        body: `${saved.reference} · $${saved.amountUsd.toFixed(2)} sent to your mobile-money number${saved.receiptRef ? ` (receipt ${saved.receiptRef})` : ''}.`,
        type: 'payout',
        entityId: saved.id,
      });
    } else {
      const failed = {
        title: 'pawaPay payout failed',
        body: `${saved.reference} · ${saved.sellerName}: ${s.failureMessage ?? 'the transfer failed'}. It is back in the queue.`,
        type: 'payout',
        entityId: saved.id,
      };
      await this.notifications.toRole('admin_finance', failed);
      await this.notifications.toRole('admin', failed);
    }
  }

  /** Transfers still `sending` (their callback may have been missed). */
  async reconcileSending(): Promise<void> {
    const rows = await this.payouts.find({ where: { status: 'sending' }, take: 25 });
    for (const p of rows) if (p.providerRef) await this.reconcilePawapay(p.providerRef);
  }

  /** A paid payout settles the lines on its statement: they are `paid out` from now on. */
  private async markLinesPaid(payoutId: string): Promise<void> {
    await this.statementLines.update({ payoutId, paidOutAt: IsNull() }, { paidOutAt: new Date() });
  }

  /** The super admin hears how each payout ends (finance staff already see the queue). */
  private async tellSuperAdmin(title: string, p: Payout, what: string): Promise<void> {
    await this.notifications.toRole('admin', { title, body: `${p.reference} · ${p.sellerName} · $${p.amountUsd.toFixed(2)} ${what}.`, type: 'payout', entityId: p.id });
  }

  private publish(saved: Payout) {
    this.emitter.toUser(saved.sellerId, 'payout:updated', saved);
    this.emitter.toRoles(FINANCE_ROOMS, 'payout:updated', saved);
  }

  async reject(payoutId: string, note?: string): Promise<Payout> {
    const payout = await this.payouts.findOne({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout not found.');
    const res = await this.payouts
      .createQueryBuilder()
      .update(Payout)
      .set({ status: 'rejected', note: note?.trim().slice(0, 250) || null })
      .where("id = :id AND status = 'requested'", { id: payoutId })
      .execute();
    if (!res.affected) throw new BadRequestException('Only a pending payout can be rejected.');
    const saved = (await this.payouts.findOne({ where: { id: payoutId } }))!;
    this.emitter.toUser(saved.sellerId, 'payout:updated', saved);
    this.emitter.toRoles(FINANCE_ROOMS, 'payout:updated', saved);
    await this.tellSuperAdmin('Payout declined', saved, `was rejected${note?.trim() ? ` (${note.trim().slice(0, 100)})` : ''}`);
    await this.notifications.toUser(saved.sellerId, {
      title: 'Payout rejected',
      body: `${saved.reference}${note ? ` — ${note}` : ''}.`,
      type: 'payout',
      entityId: saved.id,
    });
    return saved;
  }

  list(user: { id: string; role: string }): Promise<Payout[]> {
    // Finance sees everything; any other role only its own payouts.
    if (user.role === 'admin' || user.role === 'admin_finance') {
      return this.payouts.find({ order: { createdAt: 'DESC' }, take: 200 });
    }
    return this.payouts.find({ where: { sellerId: user.id }, order: { createdAt: 'DESC' }, take: 500 });
  }

  private static newReference(): string {
    const n = Math.floor(1000 + Math.random() * 9000);
    return `PO-${Date.now().toString().slice(-6)}${n}`.slice(0, 24);
  }
}
