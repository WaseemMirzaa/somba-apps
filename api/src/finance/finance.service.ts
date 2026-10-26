import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Order, OrderItem, Payout, PayoutStatementLine, Product, Seller, TaxDocument, User } from '../database/entities';
import { SettingsService } from '../content/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { toDate } from '../ops/analytics.util';
import { PayoutsService, lineGross } from '../payouts/payouts.service';
import { renderCommissionInvoice } from './commission-invoice';
import type { InvoiceLine } from './commission-invoice';
import { csvWords } from './csv-labels';
import type { CsvWords } from './csv-labels';
import { asLocale } from '../common/locale';
import { EARNING_STATES, OPEN_ORDER_STATUSES, dateInput, fixed2, lastMonths, lineState, monthRange, round2, toCsv } from './finance.util';
import type { EarningState } from './finance.util';

const SQL_NET = '(i.priceUsd * i.qty - i.couponDiscountUsd - i.commissionUsd)';

/** The part of an earnings query that depends on the clock and the hold. */
interface Clock {
  cutoff: Date;
  hold: number;
}

/** SQL for each state (the statement join `l` / `po` and the order `o` are in scope). */
const STATE_SQL: Record<EarningState, string> = {
  returned: "o.status = 'returned'",
  paid_out: "o.status <> 'returned' AND po.status = 'paid'",
  in_payout: "o.status <> 'returned' AND po.status IN ('requested','sending')",
  in_progress: 'o.status IN (:...openStatuses) AND l.id IS NULL',
  clearing: "o.status = 'delivered' AND l.id IS NULL AND o.updatedAt > :cutoff",
  available: "o.status = 'delivered' AND l.id IS NULL AND o.updatedAt <= :cutoff",
};

/** Where uploaded files live (the same folder the upload endpoint writes to and the server serves under /uploads). */
const uploadRoot = () => process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export interface EarningLine {
  itemId: string;
  orderId: string;
  orderReference: string;
  orderStatus: string;
  orderedAt: Date | null;
  /** When the order was delivered (the order's last change; only for delivered / returned orders). */
  deliveredAt: Date | null;
  productName: string;
  variant: string;
  qty: number;
  /** price x qty, less this line's share of a store coupon. */
  grossUsd: number;
  couponUsd: number;
  commissionPct: number;
  commissionUsd: number;
  netUsd: number;
  state: EarningState;
  /** When the money becomes withdrawable (delivered lines only). */
  clearanceEndsAt: Date | null;
  payout: { id: string; reference: string; status: string } | null;
  /** When the payout carrying this line was paid. */
  paidOutAt: Date | null;
}

export interface StatementLine {
  kind: 'sale' | 'refund';
  date: string;
  orderReference: string;
  productName: string;
  variant: string;
  qty: number;
  grossUsd: number;
  commissionPct: number;
  commissionUsd: number;
  netUsd: number;
}

type Who = { id: string; role: string };

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    @InjectRepository(OrderItem) private readonly items: Repository<OrderItem>,
    @InjectRepository(Payout) private readonly payouts: Repository<Payout>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    @InjectRepository(TaxDocument) private readonly docs: Repository<TaxDocument>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly settings: SettingsService,
    private readonly payoutsSvc: PayoutsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---- who ------------------------------------------------------------------
  /** The store being looked at: a seller's own; an admin / finance user names one (`sellerId`, the store id). */
  private async store(user: Who, sellerId?: unknown): Promise<Seller> {
    const admin = user.role === 'admin' || user.role === 'admin_finance';
    if (user.role !== 'seller' && !admin) throw new BadRequestException('Not allowed.');
    const row = admin && sellerId ? await this.sellers.findOne({ where: { id: String(sellerId) } }) : await this.sellers.findOne({ where: { userId: user.id } });
    if (!row) throw new BadRequestException(admin ? 'Choose a store (sellerId).' : 'Open a store first.');
    return row;
  }

  private keysOf(s: Seller): string[] {
    return [s.id, ...(s.userId ? [s.userId] : [])];
  }

  private async clock(): Promise<Clock> {
    const hold = await this.payoutsSvc.holdHours();
    return { hold, cutoff: new Date(Date.now() - hold * 3_600_000) };
  }

  // ---- settings -------------------------------------------------------------
  /** `finance:settings`: the rules a seller's money follows (what they may read; nothing internal). */
  async sellerSettings() {
    const hold = await this.payoutsSvc.holdHours();
    return {
      currency: 'USD',
      commissionPct: Math.min(100, Math.max(0, Number((await this.settings.get('commissionPct')) ?? 12) || 0)),
      minPayoutUsd: Number((await this.settings.get('minPayoutUsd')) ?? 10),
      payoutClearanceHours: hold,
    };
  }

  // ---- queries --------------------------------------------------------------
  private baseLines(keys: string[]): SelectQueryBuilder<OrderItem> {
    return this.items
      .createQueryBuilder('i')
      .innerJoin(Order, 'o', 'o.id = i.orderId')
      .innerJoin(Product, 'p', 'p.id = i.productId')
      .where('p.sellerId IN (:...keys)', { keys })
      .andWhere("i.fulfilment <> 'cancelled' AND o.status <> 'cancelled'");
  }

  /** Adds the live payout statement a line sits on (at most one: a rejected payout releases its lines). */
  private withStatement(qb: SelectQueryBuilder<OrderItem>): SelectQueryBuilder<OrderItem> {
    return qb
      .leftJoin(PayoutStatementLine, 'l', "l.orderItemId = i.id AND l.kind = 'sale' AND l.payoutId IN (SELECT lp.id FROM payouts lp WHERE lp.status IN ('requested','sending','paid'))")
      .leftJoin(Payout, 'po', 'po.id = l.payoutId');
  }

  private columns(qb: SelectQueryBuilder<OrderItem>, withPayout: boolean): SelectQueryBuilder<OrderItem> {
    qb.select('i.id', 'itemId')
      .addSelect('o.id', 'orderId')
      .addSelect('o.reference', 'orderReference')
      .addSelect('o.status', 'orderStatus')
      .addSelect('o.createdAt', 'orderedAt')
      .addSelect('o.updatedAt', 'orderUpdatedAt')
      .addSelect('i.productName', 'productName')
      .addSelect('i.variant', 'variant')
      .addSelect('i.qty', 'qty')
      .addSelect('i.priceUsd', 'priceUsd')
      .addSelect('i.couponDiscountUsd', 'couponUsd')
      .addSelect('i.commissionPct', 'commissionPct')
      .addSelect('i.commissionUsd', 'commissionUsd');
    if (withPayout) {
      qb.addSelect('po.id', 'payoutId').addSelect('po.reference', 'payoutReference').addSelect('po.status', 'payoutStatus').addSelect('l.paidOutAt', 'paidOutAt');
    }
    return qb;
  }

  private applyFilters(qb: SelectQueryBuilder<OrderItem>, input: { from?: unknown; to?: unknown; q?: unknown }, dateColumn: string): void {
    const from = dateInput(input.from, false);
    const to = dateInput(input.to, true);
    if (from) qb.andWhere(`${dateColumn} >= :fromDate`, { fromDate: from });
    if (to) qb.andWhere(`${dateColumn} <= :toDate`, { toDate: to });
    const q = typeof input.q === 'string' ? input.q.trim().slice(0, 80).toLowerCase() : '';
    if (q) qb.andWhere('(LOWER(o.reference) LIKE :q OR LOWER(i.productName) LIKE :q)', { q: `%${q}%` });
  }

  private earningOf(r: Record<string, unknown>, clock: Clock): EarningLine {
    const qty = num(r.qty);
    const gross = lineGross({ priceUsd: num(r.priceUsd), qty, couponDiscountUsd: num(r.couponUsd) });
    const commission = round2(num(r.commissionUsd));
    const orderStatus = String(r.orderStatus);
    const deliveredAt = orderStatus === 'delivered' || orderStatus === 'returned' ? toDate(r.orderUpdatedAt) : null;
    const payoutStatus = r.payoutStatus ? String(r.payoutStatus) : null;
    const { state, clearanceEndsAt } = lineState({ orderStatus, deliveredAt, payoutStatus }, clock.hold);
    return {
      itemId: String(r.itemId),
      orderId: String(r.orderId),
      orderReference: String(r.orderReference),
      orderStatus,
      orderedAt: toDate(r.orderedAt),
      deliveredAt,
      productName: String(r.productName),
      variant: String(r.variant),
      qty,
      grossUsd: gross,
      couponUsd: round2(num(r.couponUsd)),
      commissionPct: num(r.commissionPct),
      commissionUsd: commission,
      netUsd: round2(gross - commission),
      state,
      clearanceEndsAt,
      payout: r.payoutId ? { id: String(r.payoutId), reference: String(r.payoutReference), status: String(payoutStatus) } : null,
      paidOutAt: toDate(r.paidOutAt),
    };
  }

  /**
   * `finance:earnings`: what the store earned, line by line, with where each line stands (in progress, clearing,
   * available, on a payout, paid out, returned) and when delivered money clears the hold. Paged in the database
   * (`limit` up to 200, `offset`), filtered by order date (`from`, `to`), `state` and `q` (order reference / product).
   * `totals` sum every state for the same date range and search, so a filter on one state still shows the whole picture.
   */
  async earnings(user: Who, input: { sellerId?: unknown; limit?: unknown; offset?: unknown; from?: unknown; to?: unknown; state?: unknown; q?: unknown } = {}) {
    const seller = await this.store(user, input.sellerId);
    const keys = this.keysOf(seller);
    const clock = await this.clock();
    const take = Math.min(200, Math.max(1, Math.floor(Number(input.limit) || 50)));
    const skip = Math.max(0, Math.floor(Number(input.offset) || 0));
    const params = { cutoff: clock.cutoff, openStatuses: [...OPEN_ORDER_STATUSES] };
    const state = input.state === undefined || input.state === null || input.state === '' ? null : String(input.state);
    if (state && !(EARNING_STATES as readonly string[]).includes(state)) throw new BadRequestException(`State must be one of: ${EARNING_STATES.join(', ')}.`);

    const filtered = () => {
      const qb = this.withStatement(this.baseLines(keys)).setParameters(params);
      this.applyFilters(qb, input, 'o.createdAt');
      return qb;
    };
    const page = filtered();
    if (state) page.andWhere(`(${STATE_SQL[state as EarningState]})`);
    const total = num((await page.clone().select('COUNT(i.id)', 'n').getRawOne<{ n: string }>())?.n);
    const rows = await this.columns(page, true).orderBy('o.createdAt', 'DESC').addOrderBy('i.id', 'ASC').offset(skip).limit(take).getRawMany<Record<string, unknown>>();

    const sums = filtered().select('1', 'one');
    for (const s of EARNING_STATES) sums.addSelect(`COALESCE(SUM(CASE WHEN ${STATE_SQL[s]} THEN ${SQL_NET} ELSE 0 END), 0)`, `s_${s}`);
    const t = (await sums.getRawOne<Record<string, unknown>>()) ?? {};
    const totals = {
      inProgressUsd: round2(num(t.s_in_progress)),
      clearingUsd: round2(num(t.s_clearing)),
      availableUsd: round2(num(t.s_available)),
      inPayoutUsd: round2(num(t.s_in_payout)),
      paidOutUsd: round2(num(t.s_paid_out)),
      returnedUsd: round2(num(t.s_returned)),
    };
    const balance = seller.userId ? await this.payoutsSvc.available(seller.userId) : null;
    return {
      limit: take,
      offset: skip,
      total,
      holdHours: clock.hold,
      items: rows.map((r) => this.earningOf(r, clock)),
      totals,
      balance,
    };
  }

  // ---- statements ----------------------------------------------------------------
  private async monthLines(keys: string[], start: Date, end: Date): Promise<StatementLine[]> {
    const qb = this.baseLines(keys)
      .andWhere("o.status IN ('delivered','returned') AND o.updatedAt >= :start AND o.updatedAt < :end", { start, end });
    const rows = await this.columns(qb, false).orderBy('o.updatedAt', 'ASC').addOrderBy('i.id', 'ASC').getRawMany<Record<string, unknown>>();
    return rows.map((r) => {
      const gross = lineGross({ priceUsd: num(r.priceUsd), qty: num(r.qty), couponDiscountUsd: num(r.couponUsd) });
      const commission = round2(num(r.commissionUsd));
      const refund = String(r.orderStatus) === 'returned';
      const date = (toDate(r.orderUpdatedAt) ?? start).toISOString().slice(0, 10);
      return {
        kind: refund ? 'refund' : 'sale',
        date,
        orderReference: String(r.orderReference),
        productName: String(r.productName),
        variant: String(r.variant),
        qty: num(r.qty),
        grossUsd: refund ? -gross : gross,
        commissionPct: num(r.commissionPct),
        commissionUsd: refund ? -commission : commission,
        netUsd: round2(refund ? -(gross - commission) : gross - commission),
      } satisfies StatementLine;
    });
  }

  private static totalsOf(lines: StatementLine[]) {
    const sales = lines.filter((l) => l.kind === 'sale');
    const refunds = lines.filter((l) => l.kind === 'refund');
    const sum = (xs: StatementLine[], f: (l: StatementLine) => number) => round2(xs.reduce((t, l) => t + f(l), 0));
    return {
      orders: new Set(sales.map((l) => l.orderReference)).size,
      units: sales.reduce((t, l) => t + l.qty, 0),
      grossUsd: sum(sales, (l) => l.grossUsd),
      commissionUsd: sum(sales, (l) => l.commissionUsd),
      refundsUsd: round2(-sum(refunds, (l) => l.netUsd)),
      commissionCreditedUsd: round2(-sum(refunds, (l) => l.commissionUsd)),
      netUsd: sum(lines, (l) => l.netUsd),
    };
  }

  /**
   * `finance:statements`: with `month` ("2026-10") the monthly statement: every sale delivered in that month and
   * every sale taken back by a return, with totals and the payouts of the month. With `format: 'csv'` the same as
   * `{ filename, csv }`. Without `month`, the last 12 months with their totals. Months are UTC.
   */
  async statements(user: Who, input: { sellerId?: unknown; month?: unknown; format?: unknown; locale?: unknown } = {}) {
    const seller = await this.store(user, input.sellerId);
    const keys = this.keysOf(seller);
    if (input.month === undefined || input.month === null || input.month === '') {
      const months = lastMonths(12);
      const start = monthRange(months[months.length - 1]).start;
      const all = await this.monthLines(keys, start, monthRange(months[0]).end);
      return {
        currency: 'USD',
        months: months.map((m) => {
          const lines = all.filter((l) => l.date.slice(0, 7) === m);
          return { month: m, ...FinanceService.totalsOf(lines) };
        }),
      };
    }
    const { month, start, end } = monthRange(input.month);
    const lines = await this.monthLines(keys, start, end);
    const totals = FinanceService.totalsOf(lines);
    const payoutRows = seller.userId
      ? await this.payouts
          .createQueryBuilder('x')
          .where('x.sellerId = :sid AND x.createdAt >= :start AND x.createdAt < :end', { sid: seller.userId, start, end })
          .orderBy('x.createdAt', 'ASC')
          .getMany()
      : [];
    const payoutsOut = payoutRows.map((p) => ({ id: p.id, reference: p.reference, amountUsd: p.amountUsd, method: p.method, status: p.status, createdAt: p.createdAt }));
    const statement = {
      currency: 'USD',
      month,
      store: seller.name,
      totals: {
        ...totals,
        payoutsRequestedUsd: round2(payoutRows.filter((p) => p.status !== 'rejected').reduce((t, p) => t + p.amountUsd, 0)),
        payoutsPaidUsd: round2(payoutRows.filter((p) => p.status === 'paid').reduce((t, p) => t + p.amountUsd, 0)),
      },
      lines,
      payouts: payoutsOut,
    };
    if (input.format === 'csv') {
      return { filename: `statement-${month}.csv`, csv: FinanceService.statementCsv(statement, csvWords(asLocale(input.locale) ?? 'en')) };
    }
    return statement;
  }

  private static statementCsv(s: { month: string; store: string; totals: ReturnType<typeof FinanceService.totalsOf> & { payoutsRequestedUsd: number; payoutsPaidUsd: number }; lines: StatementLine[] }, w: CsvWords): string {
    const rows: (string | number | null)[][] = [
      [w.t('h.statement'), s.month, s.store],
      [],
      [w.t('h.date'), w.t('h.kind'), w.t('h.order'), w.t('h.product'), w.t('h.option'), w.t('h.qty'), w.t('h.sales'), w.t('h.commissionPct'), w.t('h.commission'), w.t('h.net')],
      ...s.lines.map((l) => [l.date, w.kind(l.kind), l.orderReference, l.productName, l.variant, l.qty, fixed2(l.grossUsd), l.commissionPct, fixed2(l.commissionUsd), fixed2(l.netUsd)]),
      [],
      [w.t('t.orders'), s.totals.orders],
      [w.t('t.units'), s.totals.units],
      [w.t('t.sales'), fixed2(s.totals.grossUsd)],
      [w.t('t.commission'), fixed2(s.totals.commissionUsd)],
      [w.t('t.returns'), fixed2(s.totals.refundsUsd)],
      [w.t('t.net'), fixed2(s.totals.netUsd)],
      [w.t('t.paid'), fixed2(s.totals.payoutsPaidUsd)],
    ];
    return toCsv(rows);
  }

  // ---- transactions -----------------------------------------------------------------
  /**
   * `finance:transactions`: the store's ledger, newest first, paged (`limit` up to 200, `offset`) and bounded by
   * `from` / `to` (dates). Entries: a `sale` per delivered line (its net), a `refund` per sale taken back (negative),
   * and a `payout` per payout request (negative; a rejected one counts for nothing and says so).
   */
  async transactions(user: Who, input: { sellerId?: unknown; limit?: unknown; offset?: unknown; from?: unknown; to?: unknown; format?: unknown; locale?: unknown } = {}) {
    const seller = await this.store(user, input.sellerId);
    const keys = this.keysOf(seller);
    const take = Math.min(200, Math.max(1, Math.floor(Number(input.limit) || 50)));
    const skip = Math.max(0, Math.floor(Number(input.offset) || 0));
    const from = dateInput(input.from, false);
    const to = dateInput(input.to, true);
    const MAX = 20_000;

    const lineQb = this.baseLines(keys).andWhere("o.status IN ('delivered','returned')");
    if (from) lineQb.andWhere('o.updatedAt >= :fromDate', { fromDate: from });
    if (to) lineQb.andWhere('o.updatedAt <= :toDate', { toDate: to });
    const lineRows = await this.columns(lineQb, false).orderBy('o.updatedAt', 'DESC').limit(MAX).getRawMany<Record<string, unknown>>();

    const payQb = this.payouts.createQueryBuilder('x').where('x.sellerId = :sid', { sid: seller.userId ?? '-' });
    if (from) payQb.andWhere('x.createdAt >= :fromDate', { fromDate: from });
    if (to) payQb.andWhere('x.createdAt <= :toDate', { toDate: to });
    const payoutRows = seller.userId ? await payQb.orderBy('x.createdAt', 'DESC').take(MAX).getMany() : [];

    type Entry = { id: string; at: Date; kind: 'sale' | 'refund' | 'payout'; reference: string; description: string; grossUsd: number; commissionUsd: number; amountUsd: number; status: string; counts: boolean };
    const entries: Entry[] = [];
    for (const r of lineRows) {
      const gross = lineGross({ priceUsd: num(r.priceUsd), qty: num(r.qty), couponDiscountUsd: num(r.couponUsd) });
      const commission = round2(num(r.commissionUsd));
      const refund = String(r.orderStatus) === 'returned';
      entries.push({
        id: String(r.itemId),
        at: toDate(r.orderUpdatedAt) ?? new Date(0),
        kind: refund ? 'refund' : 'sale',
        reference: String(r.orderReference),
        description: `${num(r.qty)} × ${r.productName}${String(r.variant) === 'Default' ? '' : ` (${r.variant})`}`,
        grossUsd: refund ? -gross : gross,
        commissionUsd: refund ? -commission : commission,
        amountUsd: round2(refund ? -(gross - commission) : gross - commission),
        status: refund ? 'returned' : 'delivered',
        counts: true,
      });
    }
    for (const p of payoutRows) {
      entries.push({
        id: p.id,
        at: p.createdAt,
        kind: 'payout',
        reference: p.reference,
        description: p.method,
        grossUsd: 0,
        commissionUsd: 0,
        amountUsd: p.status === 'rejected' ? 0 : round2(-p.amountUsd),
        status: p.status,
        counts: p.status !== 'rejected',
      });
    }
    entries.sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id));
    const sum = (f: (e: Entry) => boolean) => round2(entries.filter(f).reduce((t, e) => t + e.amountUsd, 0));
    const totals = {
      salesUsd: sum((e) => e.kind === 'sale'),
      refundsUsd: sum((e) => e.kind === 'refund'),
      payoutsUsd: sum((e) => e.kind === 'payout'),
      netUsd: sum(() => true),
    };
    if (input.format === 'csv') {
      const w = csvWords(asLocale(input.locale) ?? 'en');
      return {
        filename: 'transactions.csv',
        csv: toCsv([
          [w.t('h.date'), w.t('h.kind'), w.t('h.reference'), w.t('h.description'), w.t('h.sales'), w.t('h.commission'), w.t('h.amount'), w.t('h.status')],
          ...entries.map((e) => [e.at.toISOString(), w.kind(e.kind), e.reference, e.description, fixed2(e.grossUsd), fixed2(e.commissionUsd), fixed2(e.amountUsd), e.kind === 'payout' ? w.payoutStatus(e.status) : w.orderStatus(e.status)]),
        ]),
      };
    }
    return { total: entries.length, limit: take, offset: skip, totals, items: entries.slice(skip, skip + take) };
  }

  // ---- tax documents -------------------------------------------------------------------
  /**
   * `finance:taxDocuments`: the commission invoices already issued (`year` narrows them) and, for the last 12
   * months, which months had sales (so the screen can offer "Generate").
   */
  async taxDocuments(user: Who, input: { sellerId?: unknown; year?: unknown } = {}) {
    const seller = await this.store(user, input.sellerId);
    const sellerUserId = seller.userId ?? seller.id;
    const year = Number(input.year);
    const issued = await this.docs.find({ where: { sellerId: sellerUserId }, order: { period: 'DESC' } });
    const items = Number.isInteger(year) && year >= 1000 && year <= 9999 ? issued.filter((d) => d.period.startsWith(`${year}-`)) : issued;
    const months = lastMonths(12);
    const lines = await this.monthLines(this.keysOf(seller), monthRange(months[months.length - 1]).start, monthRange(months[0]).end);
    return {
      items,
      months: months.map((m) => {
        const t = FinanceService.totalsOf(lines.filter((l) => l.date.slice(0, 7) === m));
        const doc = issued.find((d) => d.period === m);
        return { month: m, orders: t.orders, commissionUsd: t.commissionUsd, hasSales: t.orders > 0 || t.refundsUsd > 0, documentId: doc?.id ?? null, url: doc?.url ?? null };
      }),
    };
  }

  /**
   * `finance:taxDocument { period }`: issue (or re-issue) the commission invoice of a month as a PDF in the seller's
   * language (`locale` overrides). A month that has ended is frozen once issued (the same document comes back; only an
   * admin can `refresh` it); the current month is rebuilt each time with the same number.
   */
  async taxDocument(user: Who, input: { sellerId?: unknown; period?: unknown; locale?: unknown; refresh?: unknown }, baseUrl = '') {
    const seller = await this.store(user, input.sellerId);
    const sellerUserId = seller.userId ?? seller.id;
    const { month: period, start, end } = monthRange(input.period);
    const existing = await this.docs.findOne({ where: { sellerId: sellerUserId, period } });
    const closed = end.getTime() <= Date.now();
    const admin = user.role === 'admin' || user.role === 'admin_finance';
    if (existing && closed && !(input.refresh === true && admin)) return existing;
    if (start.getTime() > Date.now()) throw new BadRequestException('That month has not started yet.');

    const lines = await this.monthLines(this.keysOf(seller), start, end);
    if (!lines.length) throw new BadRequestException(`There were no sales in ${period}: nothing to invoice.`);
    const totals = FinanceService.totalsOf(lines);
    const owner = await this.users.findOne({ where: { id: sellerUserId }, select: ['id', 'locale'] });
    const locale: 'en' | 'fr' = input.locale === 'fr' || input.locale === 'en' ? input.locale : owner?.locale === 'fr' ? 'fr' : 'en';
    const number = existing?.number ?? `CI-${period.replace('-', '')}-${seller.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
    const invoiceLines: InvoiceLine[] = lines.map((l) => ({
      orderReference: l.orderReference,
      date: l.date,
      productName: l.productName,
      qty: l.qty,
      grossUsd: Math.abs(l.grossUsd),
      commissionPct: l.commissionPct,
      commissionUsd: Math.abs(l.commissionUsd),
      credit: l.kind === 'refund',
    }));
    const pdf = renderCommissionInvoice({
      number,
      period,
      issuedAt: new Date(),
      locale,
      seller: { name: seller.name, legalName: seller.legalName, taxNumber: seller.taxNumber, rccm: seller.rccm },
      lines: invoiceLines,
      totals: { orders: totals.orders, units: totals.units, grossUsd: totals.grossUsd, commissionUsd: totals.commissionUsd, creditedUsd: totals.commissionCreditedUsd, netUsd: totals.netUsd },
    });
    const dir = join(uploadRoot(), 'invoices', sellerUserId);
    mkdirSync(dir, { recursive: true });
    const file = `${number}-${randomUUID().slice(0, 8)}.pdf`;
    writeFileSync(join(dir, file), pdf);
    const base = (process.env.PUBLIC_API_URL ?? baseUrl).replace(/\/$/, '');
    const url = `${base}/uploads/invoices/${sellerUserId}/${file}`;
    if (existing) {
      // Re-issued: the old file is no longer linked from anywhere.
      const old = existing.url.split('/uploads/invoices/')[1];
      if (old && !old.includes('..')) {
        try {
          rmSync(join(uploadRoot(), 'invoices', old), { force: true });
        } catch {
          /* best effort */
        }
      }
    }
    const row = existing ?? this.docs.create({ sellerId: sellerUserId, period, number });
    Object.assign(row, {
      locale,
      orders: totals.orders,
      units: totals.units,
      grossUsd: totals.grossUsd,
      commissionUsd: totals.commissionUsd,
      creditedUsd: totals.commissionCreditedUsd,
      netUsd: totals.netUsd,
      url,
    });
    const saved = await this.docs.save(row);
    if (!existing && seller.userId && closed) {
      await this.notifications.toUser(seller.userId, {
        title: 'Commission invoice ready',
        body: `Your commission invoice ${number} for ${period} is ready.`,
        type: 'finance',
        entityId: saved.id,
      });
    }
    return saved;
  }
}
