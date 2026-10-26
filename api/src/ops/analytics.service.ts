import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import {
  Category,
  DeliveryTask,
  Dispute,
  Hub,
  Order,
  OrderItem,
  Payment,
  PaymentRefund,
  Payout,
  Product,
  ProductView,
  Review,
  Seller,
  TransferRun,
  User,
  WarehouseBatch,
} from '../database/entities';
import { SettingsService } from '../content/settings.service';
import { CategoriesService } from '../catalog/categories.service';
import { ProductsService } from '../products/products.service';
import { GeoService } from '../geo/geo.service';
import { financeVersion } from '../finance/finance-version';
import {
  AdminAlert,
  clampDays,
  computeStoreHealth,
  fillDays,
  lastDays,
  pct,
  round1,
  round2,
  sortAlerts,
  startOfUtcDay,
  toDate,
} from './analytics.util';

/** Orders that no longer count as sales. */
const DEAD = "('cancelled','returned')";
/** A parcel is "aged" and an unassigned delivery "stuck" past these. */
const UNASSIGNED_ALERT_MIN = 60;
const PENDING_PAYMENT_ALERT_MIN = 30;
const LOW_STOCK_BELOW = 10;
const FALLBACK_COMMISSION_PCT = 12;

const n = (v: unknown): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

/**
 * Dashboards, computed in the database. Every figure comes from grouped / summed
 * queries (never "load the whole table"), written to run unchanged on SQLite
 * (dev) and MySQL (production): the only dialect branch is the hours-between
 * expression. Day buckets are UTC days.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderItem) private readonly items: Repository<OrderItem>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    @InjectRepository(Payout) private readonly payouts: Repository<Payout>,
    @InjectRepository(Dispute) private readonly disputes: Repository<Dispute>,
    @InjectRepository(DeliveryTask) private readonly deliveries: Repository<DeliveryTask>,
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    @InjectRepository(ProductView) private readonly views: Repository<ProductView>,
    @InjectRepository(Hub) private readonly hubs: Repository<Hub>,
    @InjectRepository(WarehouseBatch) private readonly batches: Repository<WarehouseBatch>,
    private readonly settings: SettingsService,
    private readonly categoriesSvc: CategoriesService,
    private readonly productsSvc: ProductsService,
    private readonly geo?: GeoService,
  ) {}

  // ── dialect helpers ────────────────────────────────────────────────────────
  private get sqlite(): boolean {
    return ['sqlite', 'better-sqlite3'].includes(String(this.ds.options.type));
  }

  /** SQL expression: hours from `earlier` to `later` (both are SQL datetime expressions). */
  private hoursBetween(later: string, earlier: string): string {
    return this.sqlite
      ? `((julianday(${later}) - julianday(${earlier})) * 24.0)`
      : `(TIMESTAMPDIFF(SECOND, ${earlier}, ${later}) / 3600.0)`;
  }

  /** SQL expression: 'YYYY-MM-DD' of a datetime expression (same text on both databases). */
  private static day(expr: string): string {
    return `CAST(DATE(${expr}) AS CHAR)`;
  }

  private async commissionPct(): Promise<number> {
    const raw = Number(await this.settings.get('commissionPct'));
    return Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : FALLBACK_COMMISSION_PCT;
  }

  /**
   * Commission actually charged: the amount STORED on each order line when it was
   * placed (never recomputed from today's rate), cancelled lines excluded.
   */
  private async storedCommission(): Promise<{ collected: number; delivered: number; open: number }> {
    const row = await this.items
      .createQueryBuilder('i')
      .innerJoin(Order, 'o', 'o.id = i.orderId')
      .select(
        "COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM payments p WHERE p.orderId = o.id AND p.purpose = 'order' AND p.status = 'succeeded') THEN i.commissionUsd ELSE 0 END), 0)",
        'collected',
      )
      .addSelect("COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN i.commissionUsd ELSE 0 END), 0)", 'delivered')
      .addSelect(`COALESCE(SUM(CASE WHEN o.status NOT IN ${DEAD} AND o.status <> 'delivered' THEN i.commissionUsd ELSE 0 END), 0)`, 'open')
      .where("i.fulfilment <> 'cancelled'")
      .getRawOne<{ collected: string; delivered: string; open: string }>();
    return { collected: round2(n(row?.collected)), delivered: round2(n(row?.delivered)), open: round2(n(row?.open)) };
  }

  // ── admin overview ─────────────────────────────────────────────────────────
  async adminStats() {
    const now = new Date();
    const today = new Date(startOfUtcDay(now).getTime() - 1);
    const d30 = new Date(startOfUtcDay(now).getTime() - 29 * 86_400_000 - 1);
    const d60 = new Date(startOfUtcDay(now).getTime() - 59 * 86_400_000 - 1);
    const live = "o.status <> 'cancelled'";

    const [agg, byStatusRows, pay, categories, counts, alerts, commissionPct, storedCommission] = await Promise.all([
      this.orders
        .createQueryBuilder('o')
        .select('COUNT(*)', 'total')
        .addSelect(`COALESCE(SUM(CASE WHEN ${live} THEN o.totalUsd ELSE 0 END), 0)`, 'gmv')
        .addSelect(`COALESCE(SUM(CASE WHEN ${live} THEN 1 ELSE 0 END), 0)`, 'liveOrders')
        .addSelect(`COALESCE(SUM(CASE WHEN ${live} AND o.createdAt > :today THEN 1 ELSE 0 END), 0)`, 'ordersToday')
        .addSelect(`COALESCE(SUM(CASE WHEN ${live} AND o.createdAt > :today THEN o.totalUsd ELSE 0 END), 0)`, 'gmvToday')
        .addSelect(`COALESCE(SUM(CASE WHEN ${live} AND o.createdAt > :d30 THEN 1 ELSE 0 END), 0)`, 'ordersLast30')
        .addSelect(`COALESCE(SUM(CASE WHEN ${live} AND o.createdAt > :d30 THEN o.totalUsd ELSE 0 END), 0)`, 'gmvLast30')
        .addSelect(`COALESCE(SUM(CASE WHEN ${live} AND o.createdAt > :d60 AND o.createdAt <= :d30 THEN o.totalUsd ELSE 0 END), 0)`, 'gmvPrev30')
        .setParameters({ today, d30, d60 })
        .getRawOne<Record<string, string>>(),
      this.orders
        .createQueryBuilder('o')
        .select('o.status', 'status')
        .addSelect('COUNT(*)', 'n')
        .groupBy('o.status')
        .getRawMany<{ status: string; n: string }>(),
      this.payments
        .createQueryBuilder('p')
        .select("COALESCE(SUM(CASE WHEN p.status = 'succeeded' AND p.purpose = 'order' THEN p.amountUsd ELSE 0 END), 0)", 'revenue')
        .addSelect("COALESCE(SUM(CASE WHEN p.status = 'refunded' AND p.purpose = 'order' THEN p.amountUsd ELSE 0 END), 0)", 'refunds')
        .addSelect("COALESCE(SUM(CASE WHEN p.status = 'succeeded' AND p.purpose = 'plan' THEN p.amountUsd ELSE 0 END), 0)", 'plans')
        .getRawOne<Record<string, string>>(),
      this.gmvByCategory(),
      this.adminCounts(),
      this.adminAlerts(),
      this.commissionPct(),
      this.storedCommission(),
    ]);

    const byStatus: Record<string, number> = {};
    for (const r of byStatusRows) byStatus[r.status] = n(r.n);
    const gmv = round2(n(agg?.gmv));
    const liveOrders = n(agg?.liveOrders);
    const revenue = round2(n(pay?.revenue));
    const gmvLast30 = round2(n(agg?.gmvLast30));
    const gmvPrev30 = round2(n(agg?.gmvPrev30));
    return {
      // — existing fields (same names) —
      orders: n(agg?.total),
      gmv,
      revenue,
      customers: counts.customers,
      sellers: counts.sellers,
      liveProducts: counts.liveProducts,
      pendingDisputes: counts.openDisputes,
      pendingPayouts: counts.requestedPayouts,
      commissionUsd: storedCommission.collected,
      ordersByStatus: byStatus,
      // — additions —
      // The CURRENT rate (applies to new orders); commissionUsd above is the sum stored on past order lines.
      commissionPct,
      gmvByCategory: categories,
      ordersToday: n(agg?.ordersToday),
      gmvToday: round2(n(agg?.gmvToday)),
      ordersLast30: n(agg?.ordersLast30),
      gmvLast30,
      gmvPrev30,
      gmvPrevPeriod: gmvPrev30,
      gmvChangePct: gmvPrev30 > 0 ? round1(((gmvLast30 - gmvPrev30) / gmvPrev30) * 100) : null,
      refundsUsd: round2(n(pay?.refunds)),
      subscriptionRevenueUsd: round2(n(pay?.plans)),
      aov: liveOrders > 0 ? round2(gmv / liveOrders) : 0,
      alerts,
    };
  }

  private async adminCounts() {
    const [customers, sellers, liveProducts, openDisputes, requestedPayouts] = await Promise.all([
      this.users.count({ where: { role: 'customer' } }),
      this.sellers.count(),
      this.products.count({ where: { status: 'live' } }),
      this.disputes.count({ where: { status: 'open' } }),
      this.payouts.count({ where: { status: 'requested' } }),
    ]);
    return { customers, sellers, liveProducts, openDisputes, requestedPayouts };
  }

  /** Item value per product category on orders that were not cancelled. */
  private async gmvByCategory(): Promise<{ category: string; categoryFr: string; categoryId: string | null; gmv: number; orders: number }[]> {
    // Grouped by the category row (not a copied name), so a renamed category stays one bucket; names are composed after.
    const rows = await this.items
      .createQueryBuilder('i')
      .innerJoin(Order, 'o', 'o.id = i.orderId')
      .leftJoin(Product, 'p', 'p.id = i.productId')
      .leftJoin(Category, 'c', 'c.id = p.categoryId')
      .select('c.id', 'categoryId')
      .addSelect('COALESCE(SUM(i.priceUsd * i.qty), 0)', 'gmv')
      .addSelect('COUNT(DISTINCT o.id)', 'orders')
      .where("o.status <> 'cancelled'")
      .groupBy('c.id')
      .orderBy('gmv', 'DESC')
      .limit(50)
      .getRawMany<{ categoryId: string | null; gmv: string; orders: string }>();
    const names = await this.categoriesSvc.names(rows.map((r) => r.categoryId).filter((x): x is string => !!x));
    return rows.map((r) => {
      const nm = r.categoryId ? names.get(r.categoryId) : undefined;
      return { category: nm?.name ?? 'Other', categoryFr: nm?.nameFr ?? 'Autres', categoryId: r.categoryId, gmv: round2(n(r.gmv)), orders: n(r.orders) };
    });
  }

  /** Things that need a human, from real data. Only non-empty ones are returned, most severe first. */
  private async adminAlerts(): Promise<AdminAlert[]> {
    const ago = (min: number) => new Date(Date.now() - min * 60_000);
    const [unassigned, stuckPayments, disputes, payoutReqs, lowStock, outOfStock, pendingProducts, pendingSellers] = await Promise.all([
      this.deliveries
        .createQueryBuilder('t')
        .where("t.status = 'unassigned' AND t.createdAt < :c", { c: ago(UNASSIGNED_ALERT_MIN) })
        .getCount(),
      this.payments
        .createQueryBuilder('p')
        .where("p.status = 'pending' AND p.method <> 'cod' AND p.createdAt < :c", { c: ago(PENDING_PAYMENT_ALERT_MIN) })
        .getCount(),
      this.disputes.count({ where: { status: 'open' } }),
      this.payouts.count({ where: { status: 'requested' } }),
      this.products
        .createQueryBuilder('p')
        // Each store sets its own line (default 10, `sellers.lowStockThreshold`); a store with none uses the default.
        .leftJoin(Seller, 'ls', 'ls.id = p.sellerId')
        .where("p.status = 'live' AND p.stock > 0 AND p.stock <= COALESCE(ls.lowStockThreshold, :low)", { low: LOW_STOCK_BELOW })
        .getCount(),
      this.products.count({ where: { status: 'live', stock: 0 } }),
      this.products.count({ where: { status: 'pending' } }),
      this.sellers.count({ where: { status: 'pending' } }),
    ]);
    const a = (kind: string, severity: AdminAlert['severity'], count: number, message: string, messageFr: string): AdminAlert => ({ kind, severity, count, message, messageFr });
    const s = (c: number) => (c === 1 ? '' : 's');
    return sortAlerts([
      a('unassigned_deliveries', unassigned >= 5 ? 'critical' : 'warning', unassigned, `${unassigned} deliver${unassigned === 1 ? 'y' : 'ies'} unassigned for over ${UNASSIGNED_ALERT_MIN} minutes`, `${unassigned} livraison${s(unassigned)} sans livreur depuis plus de ${UNASSIGNED_ALERT_MIN} minutes`),
      a('pending_payments', stuckPayments >= 5 ? 'critical' : 'warning', stuckPayments, `${stuckPayments} mobile-money payment${s(stuckPayments)} pending for over ${PENDING_PAYMENT_ALERT_MIN} minutes`, `${stuckPayments} paiement${s(stuckPayments)} mobile money en attente depuis plus de ${PENDING_PAYMENT_ALERT_MIN} minutes`),
      a('open_disputes', disputes >= 10 ? 'critical' : 'warning', disputes, `${disputes} open dispute${s(disputes)} / return${s(disputes)} to resolve`, `${disputes} litige${s(disputes)} / retour${s(disputes)} à traiter`),
      a('payout_requests', 'warning', payoutReqs, `${payoutReqs} seller payout${s(payoutReqs)} waiting for finance`, `${payoutReqs} paiement${s(payoutReqs)} vendeur en attente de la finance`),
      a('out_of_stock', 'warning', outOfStock, `${outOfStock} live product${s(outOfStock)} out of stock`, `${outOfStock} produit${s(outOfStock)} en ligne en rupture de stock`),
      a('low_stock', 'info', lowStock, `${lowStock} live product${s(lowStock)} at or below the store's low-stock alert`, `${lowStock} produit${s(lowStock)} en ligne au niveau ou sous le seuil d’alerte de la boutique`),
      a('products_pending_moderation', 'info', pendingProducts, `${pendingProducts} product${s(pendingProducts)} awaiting moderation`, `${pendingProducts} produit${s(pendingProducts)} en attente de modération`),
      a('sellers_pending', 'info', pendingSellers, `${pendingSellers} seller application${s(pendingSellers)} to review`, `${pendingSellers} demande${s(pendingSellers)} vendeur à examiner`),
    ]);
  }

  // ── revenue series ─────────────────────────────────────────────────────────
  /**
   * Real daily buckets for the last `days` UTC days (zero-filled, oldest first):
   * `revenue` = succeeded order payments created that day, `orders` = orders
   * created that day that were not cancelled.
   */
  async revenueSeries(daysArg: unknown = 7) {
    const days = clampDays(daysArg, 7);
    const { keys, from } = lastDays(days);
    const [rev, ord] = await Promise.all([
      this.payments
        .createQueryBuilder('p')
        .select(AnalyticsService.day('p.createdAt'), 'day')
        .addSelect('COALESCE(SUM(p.amountUsd), 0)', 'revenue')
        .where("p.status = 'succeeded' AND p.purpose = 'order' AND p.createdAt > :from", { from })
        .groupBy('day')
        .getRawMany<{ day: string; revenue: string }>(),
      this.orders
        .createQueryBuilder('o')
        .select(AnalyticsService.day('o.createdAt'), 'day')
        .addSelect('COUNT(*)', 'orders')
        .where("o.status <> 'cancelled' AND o.createdAt > :from", { from })
        .groupBy('day')
        .getRawMany<{ day: string; orders: string }>(),
    ]);
    const merged = new Map<string, { day: string; revenue: number; orders: number }>();
    for (const r of rev) merged.set(r.day, { day: r.day, revenue: n(r.revenue), orders: 0 });
    for (const r of ord) merged.set(r.day, { ...(merged.get(r.day) ?? { day: r.day, revenue: 0 }), orders: n(r.orders) });
    return fillDays(keys, merged.values(), { revenue: 0, orders: 0 });
  }

  // ── finance ────────────────────────────────────────────────────────────────
  async financeStats() {
    const { keys, from } = lastDays(30);
    const commissionPct = await this.commissionPct();

    const [orderAgg, payAgg, refundAgg, payoutRows, seriesGmv, seriesPay, seriesRefunds, receivableRows, codRow, wallets] = await Promise.all([
      // Merchandise value of delivered vs still-open orders (the commission base: item prices, no delivery fee).
      this.orders
        .createQueryBuilder('o')
        .select("COALESCE(SUM(CASE WHEN o.status <> 'cancelled' THEN o.totalUsd ELSE 0 END), 0)", 'gross')
        .addSelect("COALESCE(SUM(CASE WHEN o.status <> 'cancelled' THEN o.discountUsd ELSE 0 END), 0)", 'promoDiscounts')
        .addSelect("COALESCE(SUM(CASE WHEN o.status <> 'cancelled' THEN o.deliveryFeeUsd ELSE 0 END), 0)", 'deliveryFees')
        .getRawOne<Record<string, string>>(),
      this.payments
        .createQueryBuilder('p')
        .select("COALESCE(SUM(CASE WHEN p.status = 'succeeded' AND p.purpose = 'order' THEN p.amountUsd ELSE 0 END), 0)", 'collected')
        .addSelect("COALESCE(SUM(CASE WHEN p.status = 'succeeded' AND p.purpose = 'plan' THEN p.amountUsd ELSE 0 END), 0)", 'plans')
        .getRawOne<Record<string, string>>(),
      // C-refund: refunds are what the ledger recorded, whatever path made them (a return's refund leaves the payment `succeeded`).
      this.ds
        .getRepository(PaymentRefund)
        .createQueryBuilder('r')
        .select('COALESCE(SUM(r.amountUsd), 0)', 'refunds')
        .addSelect('COUNT(DISTINCT r.paymentId)', 'refundCount')
        .getRawOne<Record<string, string>>(),
      this.payouts
        .createQueryBuilder('x')
        .select('x.status', 'status')
        .addSelect('COUNT(*)', 'n')
        .addSelect('COALESCE(SUM(x.amountUsd), 0)', 'amount')
        .groupBy('x.status')
        .getRawMany<{ status: string; n: string; amount: string }>(),
      this.orders
        .createQueryBuilder('o')
        .select(AnalyticsService.day('o.createdAt'), 'day')
        .addSelect("COALESCE(SUM(CASE WHEN o.status <> 'cancelled' THEN o.totalUsd ELSE 0 END), 0)", 'gmv')
        .addSelect("COALESCE(SUM(CASE WHEN o.status <> 'cancelled' THEN 1 ELSE 0 END), 0)", 'orders')
        .where('o.createdAt > :from', { from })
        .groupBy('day')
        .getRawMany<{ day: string; gmv: string; orders: string }>(),
      this.payments
        .createQueryBuilder('p')
        .select(AnalyticsService.day('p.createdAt'), 'day')
        .addSelect("COALESCE(SUM(CASE WHEN p.status = 'succeeded' AND p.purpose = 'order' THEN p.amountUsd ELSE 0 END), 0)", 'revenue')
        .where('p.createdAt > :from', { from })
        .groupBy('day')
        .getRawMany<{ day: string; revenue: string }>(),
      this.ds
        .getRepository(PaymentRefund)
        .createQueryBuilder('r')
        .select(AnalyticsService.day('r.createdAt'), 'day')
        .addSelect('COALESCE(SUM(r.amountUsd), 0)', 'refunds')
        .where('r.createdAt > :from', { from })
        .groupBy('day')
        .getRawMany<{ day: string; refunds: string }>(),
      // Mobile-money charges waiting for the subscriber / for finance to confirm.
      this.payments
        .createQueryBuilder('p')
        .select('p.method', 'method')
        .addSelect('COUNT(*)', 'n')
        .addSelect('COALESCE(SUM(p.amountUsd), 0)', 'amount')
        .addSelect('MIN(p.createdAt)', 'oldest')
        .where("p.status = 'pending' AND p.method <> 'cod'")
        .groupBy('p.method')
        .getRawMany<{ method: string; n: string; amount: string; oldest: unknown }>(),
      this.payments
        .createQueryBuilder('p')
        .select('COUNT(*)', 'n')
        .addSelect('COALESCE(SUM(p.amountUsd), 0)', 'amount')
        .where("p.status = 'pending' AND p.method = 'cod'")
        .getRawOne<{ n: string; amount: string }>(),
      this.users
        .createQueryBuilder('u')
        .select('COALESCE(SUM(u.walletBalance), 0)', 'total')
        .getRawOne<{ total: string }>(),
    ]);

    // Commission earned / expected: the amounts stored on the order lines (rate at order time), not today's rate.
    const base = await this.storedCommission();

    const payoutBy = (st: string) => payoutRows.find((r) => r.status === st);
    const gross = round2(n(orderAgg?.gross));
    const receivables = receivableRows.map((r) => {
      const oldest = toDate(r.oldest);
      return { method: r.method, count: n(r.n), amountUsd: round2(n(r.amount)), oldestMinutes: oldest ? Math.max(0, Math.round((Date.now() - oldest.getTime()) / 60_000)) : 0 };
    });

    const series = fillDays(
      keys,
      mergeByDay([
        seriesGmv.map((r) => ({ day: r.day, gmv: n(r.gmv), orders: n(r.orders) })),
        seriesPay.map((r) => ({ day: r.day, revenue: n(r.revenue) })),
        seriesRefunds.map((r) => ({ day: r.day, refunds: n(r.refunds) })),
      ]),
      { gmv: 0, orders: 0, revenue: 0, refunds: 0 },
    );

    return {
      currency: 'USD',
      commissionPct,
      grossGmvUsd: gross,
      deliveryFeesUsd: round2(n(orderAgg?.deliveryFees)),
      promoDiscountsUsd: round2(n(orderAgg?.promoDiscounts)),
      collectedUsd: round2(n(payAgg?.collected)),
      commissionEarnedUsd: base.delivered,
      commissionExpectedUsd: base.open,
      subscriptionRevenueUsd: round2(n(payAgg?.plans)),
      refundsUsd: round2(n(refundAgg?.refunds)),
      refundsCount: n(refundAgg?.refundCount),
      payouts: {
        paidUsd: round2(n(payoutBy('paid')?.amount)),
        paidCount: n(payoutBy('paid')?.n),
        pendingUsd: round2(n(payoutBy('requested')?.amount) + n(payoutBy('sending')?.amount)),
        pendingCount: n(payoutBy('requested')?.n) + n(payoutBy('sending')?.n),
        requestedCount: n(payoutBy('requested')?.n),
        rejectedCount: n(payoutBy('rejected')?.n),
      },
      receivables: {
        count: receivables.reduce((s, r) => s + r.count, 0),
        amountUsd: round2(receivables.reduce((s, r) => s + r.amountUsd, 0)),
        oldestMinutes: receivables.reduce((m, r) => Math.max(m, r.oldestMinutes), 0),
        byMethod: receivables,
      },
      codOutstandingUsd: round2(n(codRow?.amount)),
      codOutstandingCount: n(codRow?.n),
      walletLiabilityUsd: round2(n(wallets?.total)),
      series30: series,
      // Changes whenever an order, payment or payout does: lets a screen that refreshes on status changes skip a no-op.
      ...(await financeVersion(this.ds.manager)),
      // Mobile-money fees are not recorded by the platform, so no fee total is reported.
    };
  }

  // ── warehouse ──────────────────────────────────────────────────────────────
  /** Warehouse figures; with `hubId` only the tasks that warehouse manages, sends or receives. */
  async warehouseStats(hubId?: string | null) {
    const week = lastDays(7);
    const scope = <T extends { andWhere: (c: string, p?: Record<string, unknown>) => T }>(qb: T, alias = 't'): T =>
      hubId ? qb.andWhere(`(${alias}.hubId = :scopeHub OR ${alias}.fromHubId = :scopeHub OR ${alias}.toHubId = :scopeHub)`, { scopeHub: hubId }) : qb;
    const d30 = new Date(startOfUtcDay(new Date()).getTime() - 29 * 86_400_000 - 1);
    const delivered = 'COALESCE(t.deliveredAt, t.updatedAt)';

    const [statusRows, received, deliveredRows, pickedUp, timing, window30, perHub, hubRows, aged, perArea] = await Promise.all([
      scope(this.deliveries.createQueryBuilder('t'))
        .select('t.status', 'status')
        .addSelect('t.kind', 'kind')
        .addSelect('COUNT(*)', 'n')
        .addSelect('COALESCE(SUM(t.codAmountUsd), 0)', 'cod')
        .groupBy('t.status')
        .addGroupBy('t.kind')
        .getRawMany<{ status: string; kind: string; n: string; cod: string }>(),
      scope(this.deliveries.createQueryBuilder('t'))
        .select(AnalyticsService.day('t.receivedAt'), 'day')
        .addSelect('COUNT(*)', 'received')
        .andWhere('t.receivedAt IS NOT NULL AND t.receivedAt > :from', { from: week.from })
        .groupBy('day')
        .getRawMany<{ day: string; received: string }>(),
      scope(this.deliveries.createQueryBuilder('t'))
        .select(AnalyticsService.day(delivered), 'day')
        .addSelect('COUNT(*)', 'delivered')
        .andWhere(`t.status = 'delivered' AND t.kind = 'delivery' AND ${delivered} > :from`, { from: week.from })
        .groupBy('day')
        .getRawMany<{ day: string; delivered: string }>(),
      scope(this.deliveries.createQueryBuilder('t'))
        .select(AnalyticsService.day('t.pickedUpAt'), 'day')
        .addSelect('COUNT(*)', 'pickedUp')
        .andWhere("t.kind = 'delivery' AND t.pickedUpAt IS NOT NULL AND t.pickedUpAt > :from", { from: week.from })
        .groupBy('day')
        .getRawMany<{ day: string; pickedUp: string }>(),
      // Only parcels with both stamps (recorded since this feature shipped) count towards the average.
      scope(this.deliveries.createQueryBuilder('t'))
        .select(`AVG(${this.hoursBetween('t.deliveredAt', 't.pickedUpAt')}) * 60`, 'minutes')
        .addSelect('COUNT(*)', 'samples')
        .andWhere("t.kind = 'delivery' AND t.status = 'delivered' AND t.pickedUpAt IS NOT NULL AND t.deliveredAt IS NOT NULL AND t.deliveredAt > :d30", { d30 })
        .getRawOne<{ minutes: string | null; samples: string }>(),
      scope(this.deliveries.createQueryBuilder('t'))
        .select("COALESCE(SUM(CASE WHEN t.status = 'delivered' THEN 1 ELSE 0 END), 0)", 'delivered')
        .addSelect("COALESCE(SUM(CASE WHEN t.status = 'failed' THEN 1 ELSE 0 END), 0)", 'failed')
        .andWhere("t.kind = 'delivery' AND t.createdAt > :d30", { d30 })
        .getRawOne<{ delivered: string; failed: string }>(),
      scope(this.deliveries.createQueryBuilder('t'))
        .select("COALESCE(t.hubId, 'unknown')", 'hubId')
        .addSelect('COUNT(*)', 'parcels')
        .addSelect("COALESCE(SUM(CASE WHEN t.status = 'delivered' THEN 1 ELSE 0 END), 0)", 'delivered')
        .addSelect("COALESCE(SUM(CASE WHEN t.status = 'failed' THEN 1 ELSE 0 END), 0)", 'failed')
        .andWhere('t.createdAt > :d30', { d30 })
        .groupBy('t.hubId')
        .orderBy('parcels', 'DESC')
        .limit(30)
        .getRawMany<{ hubId: string; parcels: string; delivered: string; failed: string }>(),
      (hubId ? this.batches.createQueryBuilder('b').andWhere('b.hubId = :scopeHub', { scopeHub: hubId }) : this.batches.createQueryBuilder('b'))
        .leftJoin(Hub, 'h', 'h.id = b.hubId')
        .select('b.hubId', 'hubId')
        .addSelect('MAX(h.name)', 'hub')
        .addSelect('COUNT(*)', 'batches')
        .andWhere('b.createdAt > :d30', { d30 })
        .groupBy('b.hubId')
        .getRawMany<{ hubId: string | null; hub: string | null; batches: string }>(),
      scope(this.deliveries.createQueryBuilder('t'))
        .andWhere("t.status NOT IN ('delivered','failed') AND t.createdAt < :c", { c: new Date(Date.now() - 24 * 3_600_000) })
        .getCount(),
      // Customer deliveries by the area of the order's address (rolled up to communes below).
      scope(this.deliveries.createQueryBuilder('t'))
        .innerJoin(Order, 'o', 'o.id = t.orderId')
        .select('o.destinationAreaId', 'areaId')
        .addSelect('COUNT(DISTINCT t.orderId)', 'orders')
        .addSelect("COALESCE(SUM(CASE WHEN t.status = 'delivered' THEN 1 ELSE 0 END), 0)", 'delivered')
        .addSelect("COALESCE(SUM(CASE WHEN t.status = 'failed' THEN 1 ELSE 0 END), 0)", 'failed')
        .addSelect(
          `AVG(CASE WHEN t.status = 'delivered' AND t.pickedUpAt IS NOT NULL AND t.deliveredAt IS NOT NULL THEN ${this.hoursBetween('t.deliveredAt', 't.pickedUpAt')} * 60 END)`,
          'minutes',
        )
        .andWhere("t.kind = 'delivery' AND t.createdAt > :d30", { d30 })
        .groupBy('o.destinationAreaId')
        .getRawMany<{ areaId: string | null; orders: string; delivered: string; failed: string; minutes: string | null }>(),
    ]);

    const by: Record<string, number> = {};
    const byKind: Record<string, number> = {};
    let total = 0;
    let cod = 0;
    let deliveredParcels = 0;
    for (const r of statusRows) {
      by[r.status] = (by[r.status] ?? 0) + n(r.n);
      total += n(r.n);
      const open = r.status !== 'delivered' && r.status !== 'failed';
      if (open) {
        cod += n(r.cod);
        byKind[r.kind ?? 'delivery'] = (byKind[r.kind ?? 'delivery'] ?? 0) + n(r.n);
      }
      if (r.status === 'delivered' && (r.kind ?? 'delivery') === 'delivery') deliveredParcels += n(r.n);
    }
    const done = n(window30?.delivered);
    const failed = n(window30?.failed);
    const samples = n(timing?.samples);
    return {
      // — existing fields —
      // Every task (leg) counts: a two-seller order is two pickups, maybe a transfer, and one delivery.
      totalParcels: total,
      unassigned: by['unassigned'] ?? 0,
      inTransit: by['in_transit'] ?? 0,
      // Customer deliveries completed; `byStatus` counts every leg (a pickup scanned in is "delivered" at its warehouse).
      delivered: deliveredParcels,
      codToCollect: round2(cod),
      byStatus: by,
      // Legs still open, by kind (pickup, transfer, delivery, return_*, replacement_delivery).
      byKind,
      // — additions —
      throughput: fillDays(
        week.keys,
        mergeByDay([
          received.map((r) => ({ day: r.day, received: n(r.received) })),
          deliveredRows.map((r) => ({ day: r.day, delivered: n(r.delivered) })),
          pickedUp.map((r) => ({ day: r.day, pickedUp: n(r.pickedUp) })),
        ]),
        { received: 0, pickedUp: 0, delivered: 0 },
      ),
      avgPickupToDeliveryMinutes: samples > 0 && timing?.minutes != null ? Math.round(n(timing.minutes)) : null,
      pickupToDeliverySamples: samples,
      failureRatePct: pct(failed, done + failed),
      failed30: failed,
      delivered30: done,
      agedOver24h: aged,
      // Parcels (tasks) per managing warehouse over the last 30 days, with the dispatch batches built there.
      byHub: await this.byHub(hubId, perHub, hubRows),
      // Customer deliveries per commune (a quartier counts in its commune, a city-level address in its city) over 30 days:
      // orders, delivered, failed, failure rate, average pickup-to-delivery minutes, and the warehouse that serves it now.
      byCommune: await this.byCommune(perArea),
      // Transfer runs over the last 30 days: per lane (sending -> receiving warehouse) runs, parcels, average transit and missing parcels.
      runs: await this.runStats(hubId, d30),
    };
  }

  private async runStats(hubId: string | null | undefined, since: Date) {
    const repo = this.ds.getRepository(TransferRun);
    const qb = repo.createQueryBuilder('r').where('r.createdAt > :since', { since });
    if (hubId) qb.andWhere('(r.fromHubId = :h OR r.toHubId = :h)', { h: hubId });
    const runs = await qb.getMany();
    if (!runs.length) return { total: 0, byLane: [] as unknown[] };
    const counts = await this.deliveries
      .createQueryBuilder('t')
      .select('t.runId', 'runId')
      .addSelect('COUNT(*)', 'parcels')
      .addSelect("COALESCE(SUM(CASE WHEN t.status = 'failed' AND t.failureReason LIKE 'Parcel missing%' THEN 1 ELSE 0 END), 0)", 'missing')
      .where('t.runId IN (:...ids)', { ids: runs.map((r) => r.id) })
      .groupBy('t.runId')
      .getRawMany<{ runId: string; parcels: string; missing: string }>();
    const byRun = new Map(counts.map((c) => [c.runId, c]));
    const names = new Map((await this.hubs.find()).map((h) => [h.id, h.name]));
    const lanes = new Map<string, { fromHubId: string; from: string; toHubId: string; to: string; runs: number; parcels: number; missing: number; minutes: number[] }>();
    for (const r of runs) {
      const key = `${r.fromHubId}>${r.toHubId}`;
      const lane = lanes.get(key) ?? { fromHubId: r.fromHubId, from: names.get(r.fromHubId) ?? r.fromHubId, toHubId: r.toHubId, to: names.get(r.toHubId) ?? r.toHubId, runs: 0, parcels: 0, missing: 0, minutes: [] };
      lane.runs++;
      lane.parcels += n(byRun.get(r.id)?.parcels);
      lane.missing += n(byRun.get(r.id)?.missing);
      if (r.dispatchedAt && r.arrivedAt) lane.minutes.push((new Date(r.arrivedAt).getTime() - new Date(r.dispatchedAt).getTime()) / 60_000);
      lanes.set(key, lane);
    }
    return {
      total: runs.length,
      byLane: [...lanes.values()].map(({ minutes, ...l }) => ({ ...l, parcelsPerRun: l.runs ? round1(l.parcels / l.runs) : 0, avgTransitMinutes: minutes.length ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length) : null })),
    };
  }

  private async byCommune(rows: { areaId: string | null; orders: string; delivered: string; failed: string; minutes: string | null }[]) {
    if (!this.geo) return [];
    const ix = await this.geo.index();
    const out = new Map<string, { areaId: string | null; area: string; areaEn: string | null; level: string | null; hubId: string | null; hub: string | null; orders: number; delivered: number; failed: number; minutesSum: number; minutesN: number }>();
    for (const r of rows) {
      const area = r.areaId ? ix.get(r.areaId) : null;
      // Roll a quartier up into its commune; otherwise the area itself.
      const shown = area ? (ix.ancestorAt(area.id, 'commune') ?? area) : null;
      const key = shown?.id ?? 'unknown';
      const row = out.get(key) ?? { areaId: shown?.id ?? null, area: shown?.name ?? 'Unknown area', areaEn: shown?.nameEn ?? shown?.name ?? null, level: shown?.level ?? null, hubId: null, hub: null, orders: 0, delivered: 0, failed: 0, minutesSum: 0, minutesN: 0 };
      row.orders += n(r.orders);
      row.delivered += n(r.delivered);
      row.failed += n(r.failed);
      if (r.minutes != null) {
        row.minutesSum += n(r.minutes) * Math.max(1, n(r.delivered));
        row.minutesN += Math.max(1, n(r.delivered));
      }
      out.set(key, row);
    }
    const cov = await this.geo.coveringMany([...out.values()].map((r) => r.areaId).filter((x): x is string => !!x));
    return [...out.values()]
      .map((r) => {
        const c = r.areaId ? cov.get(r.areaId) : null;
        return {
          areaId: r.areaId,
          area: r.area,
          areaEn: r.areaEn,
          level: r.level,
          hubId: c?.hubId ?? null,
          hub: c?.hubName ?? null,
          orders: r.orders,
          delivered: r.delivered,
          failed: r.failed,
          failureRatePct: pct(r.failed, r.delivered + r.failed),
          avgDeliveryMinutes: r.minutesN > 0 ? Math.round(r.minutesSum / r.minutesN) : null,
        };
      })
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 60);
  }

  /** Per-warehouse rows: parcels / delivered / failed (30 days) joined with the warehouse name and its batches. */
  private async byHub(
    hubId: string | null | undefined,
    perHub: { hubId: string; parcels: string; delivered: string; failed: string }[],
    batchRows: { hubId: string | null; hub: string | null; batches: string }[],
  ) {
    const hubs = new Map((await this.hubs.find()).map((h) => [h.id, h.name]));
    const rows = new Map<string, { hubId: string | null; hub: string; parcels: number; delivered: number; failed: number; batches30: number }>();
    for (const r of perHub) {
      if (hubId && r.hubId !== hubId) continue; // a warehouse's figures list that warehouse only
      const id = r.hubId === 'unknown' ? null : r.hubId;
      rows.set(r.hubId, { hubId: id, hub: id ? (hubs.get(id) ?? id) : 'Unassigned', parcels: n(r.parcels), delivered: n(r.delivered), failed: n(r.failed), batches30: 0 });
    }
    for (const b of batchRows) {
      const key = b.hubId ?? 'unknown';
      const row = rows.get(key) ?? { hubId: b.hubId, hub: b.hub ?? 'Unassigned', parcels: 0, delivered: 0, failed: 0, batches30: 0 };
      row.batches30 = n(b.batches);
      rows.set(key, row);
    }
    return [...rows.values()];
  }

  // ── seller ─────────────────────────────────────────────────────────────────
  /** Every id a seller's products may carry as `sellerId` (the store id, and for old demo data the user id). */
  sellerIdsOf(seller: Pick<Seller, 'id' | 'userId'>): string[] {
    return [seller.id, ...(seller.userId ? [seller.userId] : [])];
  }

  /** Order lines of the seller's products on orders that still count as sales. */
  private sellerLines(ids: string[], opts: { includeDead?: boolean } = {}): SelectQueryBuilder<OrderItem> {
    const qb = this.items
      .createQueryBuilder('i')
      .innerJoin(Order, 'o', 'o.id = i.orderId')
      .innerJoin(Product, 'p', 'p.id = i.productId')
      .where('p.sellerId IN (:...sids)', { sids: ids });
    // A line the seller cancelled on a multi-seller order is not a sale.
    if (!opts.includeDead) qb.andWhere(`o.status NOT IN ${DEAD}`).andWhere("i.fulfilment <> 'cancelled'");
    return qb;
  }

  async sellerStats(seller: Pick<Seller, 'id' | 'userId'>, daysArg: unknown = 30, topN = 5) {
    const ids = this.sellerIdsOf(seller);
    const days = clampDays(daysArg, 30);
    const { keys, from, fromKey } = lastDays(days);
    const idParam = { sids: ids };

    const [seriesRows, totals, top, lifetime, segments, quality, timing, reviewAgg, viewRow] = await Promise.all([
      this.sellerLines(ids)
        .select(AnalyticsService.day('o.createdAt'), 'day')
        .addSelect('COALESCE(SUM(i.priceUsd * i.qty), 0)', 'revenue')
        .addSelect('COUNT(DISTINCT o.id)', 'orders')
        .addSelect('COALESCE(SUM(i.qty), 0)', 'units')
        .andWhere('o.createdAt > :from', { from })
        .groupBy('day')
        .getRawMany<{ day: string; revenue: string; orders: string; units: string }>(),
      this.sellerLines(ids)
        .select('COALESCE(SUM(i.priceUsd * i.qty), 0)', 'revenue')
        .addSelect('COALESCE(SUM(i.commissionUsd), 0)', 'commission')
        .addSelect('COUNT(DISTINCT o.id)', 'orders')
        .addSelect('COALESCE(SUM(i.qty), 0)', 'units')
        .andWhere('o.createdAt > :from', { from })
        .getRawOne<{ revenue: string; commission: string; orders: string; units: string }>(),
      this.sellerLines(ids)
        .select('i.productId', 'productId')
        .addSelect('MAX(i.productName)', 'name')
        .addSelect('COALESCE(SUM(i.qty), 0)', 'units')
        .addSelect('COALESCE(SUM(i.priceUsd * i.qty), 0)', 'revenue')
        .andWhere('o.createdAt > :from', { from })
        .groupBy('i.productId')
        .orderBy('revenue', 'DESC')
        .limit(Math.min(Math.max(topN, 1), 20))
        .getRawMany<{ productId: string; name: string; units: string; revenue: string }>(),
      // Buyers over the store's whole life: how many, and how many came back.
      this.ds
        .createQueryBuilder()
        .select('COUNT(*)', 'customers')
        .addSelect('COALESCE(SUM(CASE WHEN c.n > 1 THEN 1 ELSE 0 END), 0)', 'repeat')
        .from((sq) => this.buyersSub(sq, ids), 'c')
        .getRawOne<{ customers: string; repeat: string }>(),
      // Buyers in the window: first-ever order inside it = new, earlier = returning.
      this.ds
        .createQueryBuilder()
        .select('COUNT(*)', 'active')
        .addSelect('COALESCE(SUM(CASE WHEN c.firstAt > :from THEN 1 ELSE 0 END), 0)', 'fresh')
        .from((sq) => this.buyersSub(sq, ids), 'c')
        .where('c.lastAt > :from', { from })
        .setParameter('from', from)
        .getRawOne<{ active: string; fresh: string }>(),
      // Order outcomes for orders placed in the window (cancelled / returned / disputed are counted too).
      this.sellerLines(ids, { includeDead: true })
        .leftJoin(Dispute, 'd', 'd.orderId = o.id')
        .select('COUNT(DISTINCT o.id)', 'orders')
        .addSelect("COUNT(DISTINCT CASE WHEN o.status = 'cancelled' THEN o.id END)", 'cancelled')
        .addSelect("COUNT(DISTINCT CASE WHEN d.type = 'return' THEN o.id END)", 'returns')
        .addSelect("COUNT(DISTINCT CASE WHEN d.type = 'dispute' THEN o.id END)", 'disputes')
        .andWhere('o.createdAt > :from', { from })
        .getRawOne<{ orders: string; cancelled: string; returns: string; disputes: string }>(),
      this.fulfilmentTimes(ids, from),
      this.reviews
        .createQueryBuilder('r')
        .innerJoin(Product, 'p', 'p.id = r.productId')
        .select('COUNT(*)', 'n')
        .addSelect('COALESCE(AVG(r.rating), 0)', 'avg')
        .addSelect('COALESCE(SUM(CASE WHEN r.sellerReply IS NOT NULL THEN 1 ELSE 0 END), 0)', 'replied')
        .where("p.sellerId IN (:...sids) AND r.status = 'visible'", idParam)
        .getRawOne<{ n: string; avg: string; replied: string }>(),
      this.views
        .createQueryBuilder('v')
        .innerJoin(Product, 'p', 'p.id = v.productId')
        .select('COALESCE(SUM(v.views), 0)', 'views')
        .where('p.sellerId IN (:...sids) AND v.viewDate >= :fromKey', { ...idParam, fromKey })
        .getRawOne<{ views: string }>(),
    ]);

    const topNames = await this.topProductNames(top);
    const revenue = round2(n(totals?.revenue));
    const orderCount = n(totals?.orders);
    const customers = n(lifetime?.customers);
    const repeat = n(lifetime?.repeat);
    const repeatRatePct = pct(repeat, customers);
    const placed = n(quality?.orders);
    const cancelRatePct = pct(n(quality?.cancelled), placed);
    const returnRatePct = pct(n(quality?.returns), placed);
    const disputeRatePct = pct(n(quality?.disputes), placed);
    const ratingCount = n(reviewAgg?.n);
    const ratingAvg = ratingCount ? round2(n(reviewAgg?.avg)) : null;
    const views = n(viewRow?.views);

    return {
      sellerId: seller.id,
      days,
      from: keys[0],
      to: keys[keys.length - 1],
      revenue,
      // Commission on that revenue: the amounts stored on the lines when each order was placed.
      commissionUsd: round2(n(totals?.commission)),
      orders: orderCount,
      units: n(totals?.units),
      aov: orderCount ? round2(revenue / orderCount) : 0,
      revenueSeries: fillDays(keys, seriesRows, { revenue: 0, orders: 0, units: 0 }),
      topProducts: top.map((t) => {
        const nm = topNames.get(t.productId);
        return { productId: t.productId, name: nm?.name ?? t.name, nameFr: nm?.nameFr ?? t.name, units: n(t.units), revenue: round2(n(t.revenue)) };
      }),
      customers: {
        total: customers,
        repeat,
        repeatRatePct,
        windowActive: n(segments?.active),
        windowNew: n(segments?.fresh),
        windowReturning: n(segments?.active) - n(segments?.fresh),
      },
      fulfilment: {
        ordersPlaced: placed,
        avgHoursToReady: timing.avgHoursToReady,
        avgHoursToDelivered: timing.avgHoursToDelivered,
        cancelRatePct,
        returnRatePct,
        disputeRatePct,
      },
      reviews: { average: ratingAvg, count: ratingCount, replied: n(reviewAgg?.replied) },
      health: computeStoreHealth({
        orders: placed,
        avgHoursToReady: timing.avgHoursToReady,
        cancelRatePct,
        problemRatePct: pct(n(quality?.returns) + n(quality?.disputes), placed),
        ratingAvg,
        ratingCount,
        repeatRatePct: customers ? repeatRatePct : null,
      }),
      // Product-detail views by shoppers (see product_views) against orders placed in the same window.
      funnel: { views, orders: placed, conversionPct: views > 0 ? pct(placed, views) : 0 },
    };
  }

  /**
   * `name` / `nameFr` of the best sellers, from the listings' composed titles in one batched lookup (never one per
   * row), so both languages describe the same product. (Only listings that still exist are counted, so there is
   * always a title; the order-line name stays as the fallback.)
   */
  private topProductNames(rows: { productId: string }[]): Promise<Map<string, { name: string; nameFr: string }>> {
    return this.productsSvc.names(rows.map((r) => r.productId));
  }

  /** One row per buyer of the seller's products: how many orders, first and last order time. */
  private buyersSub(sq: SelectQueryBuilder<any>, ids: string[])
   {
    return sq
      .select('o.customerId', 'customerId')
      .addSelect('COUNT(DISTINCT o.id)', 'n')
      .addSelect('MIN(o.createdAt)', 'firstAt')
      .addSelect('MAX(o.createdAt)', 'lastAt')
      .from(OrderItem, 'i')
      .innerJoin(Order, 'o', 'o.id = i.orderId')
      .innerJoin(Product, 'p', 'p.id = i.productId')
      .where(`p.sellerId IN (:...sids) AND o.status NOT IN ${DEAD}`, { sids: ids })
      .groupBy('o.customerId');
  }

  /** Average hours from order to "ready for pickup" and to delivery, for orders placed in the window. */
  private async fulfilmentTimes(ids: string[], from: Date) {
    const inStore = (qb: SelectQueryBuilder<DeliveryTask>) =>
      qb.andWhere(
        `o.id IN ${qb
          .subQuery()
          .select('si.orderId')
          .from(OrderItem, 'si')
          .innerJoin(Product, 'sp', 'sp.id = si.productId')
          .where('sp.sellerId IN (:...sids)')
          .getQuery()}`,
        { sids: ids },
      );
    const base = () => this.deliveries.createQueryBuilder('t').innerJoin(Order, 'o', 'o.id = t.orderId').where('o.createdAt > :from', { from });
    const delivered = 'COALESCE(t.deliveredAt, t.updatedAt)';
    const [ready, done] = await Promise.all([
      inStore(
        base()
          .select(`AVG(${this.hoursBetween('t.readyAt', 'o.createdAt')})`, 'hours')
          .andWhere('t.readyAt IS NOT NULL AND t.attempts = 1'),
      ).getRawOne<{ hours: string | null }>(),
      inStore(
        base()
          .select(`AVG(${this.hoursBetween(delivered, 'o.createdAt')})`, 'hours')
          .andWhere("t.status = 'delivered'"),
      ).getRawOne<{ hours: string | null }>(),
    ]);
    return {
      avgHoursToReady: ready?.hours != null ? round1(n(ready.hours)) : null,
      avgHoursToDelivered: done?.hours != null ? round1(n(done.hours)) : null,
    };
  }
}

/** Merge several lists of `{day, …}` rows into one row per day. */
function mergeByDay(lists: { day: string; [k: string]: unknown }[][]): Iterable<{ day: string; [k: string]: unknown }> {
  const out = new Map<string, { day: string; [k: string]: unknown }>();
  for (const list of lists) {
    for (const row of list) out.set(row.day, Object.assign(out.get(row.day) ?? { day: row.day }, row));
  }
  return out.values();
}
