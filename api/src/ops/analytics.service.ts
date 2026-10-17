import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import {
  DeliveryTask,
  Dispute,
  Hub,
  Order,
  OrderItem,
  Payment,
  Payout,
  Product,
  ProductView,
  Review,
  Seller,
  User,
  WarehouseBatch,
} from '../database/entities';
import { SettingsService } from '../content/settings.service';
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

  // ── admin overview ─────────────────────────────────────────────────────────
  async adminStats() {
    const now = new Date();
    const today = new Date(startOfUtcDay(now).getTime() - 1);
    const d30 = new Date(startOfUtcDay(now).getTime() - 29 * 86_400_000 - 1);
    const d60 = new Date(startOfUtcDay(now).getTime() - 59 * 86_400_000 - 1);
    const live = "o.status <> 'cancelled'";

    const [agg, byStatusRows, pay, categories, counts, alerts, commissionPct] = await Promise.all([
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
      commissionUsd: round2((revenue * commissionPct) / 100),
      ordersByStatus: byStatus,
      // — additions —
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
  private async gmvByCategory(): Promise<{ category: string; gmv: number; orders: number }[]> {
    const rows = await this.items
      .createQueryBuilder('i')
      .innerJoin(Order, 'o', 'o.id = i.orderId')
      .leftJoin(Product, 'p', 'p.id = i.productId')
      .select("COALESCE(p.category, 'Other')", 'category')
      .addSelect('COALESCE(SUM(i.priceUsd * i.qty), 0)', 'gmv')
      .addSelect('COUNT(DISTINCT o.id)', 'orders')
      .where("o.status <> 'cancelled'")
      .groupBy('category')
      .orderBy('gmv', 'DESC')
      .limit(50)
      .getRawMany<{ category: string; gmv: string; orders: string }>();
    return rows.map((r) => ({ category: r.category, gmv: round2(n(r.gmv)), orders: n(r.orders) }));
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
        .where("p.status = 'live' AND p.stock > 0 AND p.stock < :low", { low: LOW_STOCK_BELOW })
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
      a('low_stock', 'info', lowStock, `${lowStock} live product${s(lowStock)} with fewer than ${LOW_STOCK_BELOW} units left`, `${lowStock} produit${s(lowStock)} en ligne avec moins de ${LOW_STOCK_BELOW} unités`),
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

    const [orderAgg, payAgg, payoutRows, seriesGmv, seriesPay, receivableRows, codRow, wallets] = await Promise.all([
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
        .addSelect("COALESCE(SUM(CASE WHEN p.status = 'refunded' AND p.purpose = 'order' THEN p.amountUsd ELSE 0 END), 0)", 'refunds')
        .addSelect("COALESCE(SUM(CASE WHEN p.status = 'refunded' AND p.purpose = 'order' THEN 1 ELSE 0 END), 0)", 'refundCount')
        .addSelect("COALESCE(SUM(CASE WHEN p.status = 'succeeded' AND p.purpose = 'plan' THEN p.amountUsd ELSE 0 END), 0)", 'plans')
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
        .addSelect("COALESCE(SUM(CASE WHEN p.status = 'refunded' AND p.purpose = 'order' THEN p.amountUsd ELSE 0 END), 0)", 'refunds')
        .where('p.createdAt > :from', { from })
        .groupBy('day')
        .getRawMany<{ day: string; revenue: string; refunds: string }>(),
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

    // Commission base: item value of delivered orders (earned) and of orders still on their way (expected).
    const base = await this.items
      .createQueryBuilder('i')
      .innerJoin(Order, 'o', 'o.id = i.orderId')
      .select("COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN i.priceUsd * i.qty ELSE 0 END), 0)", 'delivered')
      .addSelect(`COALESCE(SUM(CASE WHEN o.status NOT IN ${DEAD} AND o.status <> 'delivered' THEN i.priceUsd * i.qty ELSE 0 END), 0)`, 'open')
      .getRawOne<{ delivered: string; open: string }>();

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
        seriesPay.map((r) => ({ day: r.day, revenue: n(r.revenue), refunds: n(r.refunds) })),
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
      commissionEarnedUsd: round2((n(base?.delivered) * commissionPct) / 100),
      commissionExpectedUsd: round2((n(base?.open) * commissionPct) / 100),
      subscriptionRevenueUsd: round2(n(payAgg?.plans)),
      refundsUsd: round2(n(payAgg?.refunds)),
      refundsCount: n(payAgg?.refundCount),
      payouts: {
        paidUsd: round2(n(payoutBy('paid')?.amount)),
        paidCount: n(payoutBy('paid')?.n),
        pendingUsd: round2(n(payoutBy('requested')?.amount) + n(payoutBy('approved')?.amount)),
        pendingCount: n(payoutBy('requested')?.n) + n(payoutBy('approved')?.n),
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
      // Mobile-money fees are not recorded by the platform, so no fee total is reported.
    };
  }

  // ── warehouse ──────────────────────────────────────────────────────────────
  async warehouseStats() {
    const week = lastDays(7);
    const d30 = new Date(startOfUtcDay(new Date()).getTime() - 29 * 86_400_000 - 1);
    const delivered = 'COALESCE(t.deliveredAt, t.updatedAt)';

    const [statusRows, received, deliveredRows, pickedUp, timing, window30, zones, hubRows, aged] = await Promise.all([
      this.deliveries
        .createQueryBuilder('t')
        .select('t.status', 'status')
        .addSelect('COUNT(*)', 'n')
        .addSelect('COALESCE(SUM(t.codAmountUsd), 0)', 'cod')
        .groupBy('t.status')
        .getRawMany<{ status: string; n: string; cod: string }>(),
      this.deliveries
        .createQueryBuilder('t')
        .select(AnalyticsService.day('t.receivedAt'), 'day')
        .addSelect('COUNT(*)', 'received')
        .where('t.receivedAt IS NOT NULL AND t.receivedAt > :from', { from: week.from })
        .groupBy('day')
        .getRawMany<{ day: string; received: string }>(),
      this.deliveries
        .createQueryBuilder('t')
        .select(AnalyticsService.day(delivered), 'day')
        .addSelect('COUNT(*)', 'delivered')
        .where(`t.status = 'delivered' AND ${delivered} > :from`, { from: week.from })
        .groupBy('day')
        .getRawMany<{ day: string; delivered: string }>(),
      this.deliveries
        .createQueryBuilder('t')
        .select(AnalyticsService.day('t.pickedUpAt'), 'day')
        .addSelect('COUNT(*)', 'pickedUp')
        .where('t.pickedUpAt IS NOT NULL AND t.pickedUpAt > :from', { from: week.from })
        .groupBy('day')
        .getRawMany<{ day: string; pickedUp: string }>(),
      // Only parcels with both stamps (recorded since this feature shipped) count towards the average.
      this.deliveries
        .createQueryBuilder('t')
        .select(`AVG(${this.hoursBetween('t.deliveredAt', 't.pickedUpAt')}) * 60`, 'minutes')
        .addSelect('COUNT(*)', 'samples')
        .where("t.status = 'delivered' AND t.pickedUpAt IS NOT NULL AND t.deliveredAt IS NOT NULL AND t.deliveredAt > :d30", { d30 })
        .getRawOne<{ minutes: string | null; samples: string }>(),
      this.deliveries
        .createQueryBuilder('t')
        .select("COALESCE(SUM(CASE WHEN t.status = 'delivered' THEN 1 ELSE 0 END), 0)", 'delivered')
        .addSelect("COALESCE(SUM(CASE WHEN t.status = 'failed' THEN 1 ELSE 0 END), 0)", 'failed')
        .where('t.createdAt > :d30', { d30 })
        .getRawOne<{ delivered: string; failed: string }>(),
      this.deliveries
        .createQueryBuilder('t')
        .select("COALESCE(t.zoneId, 'unknown')", 'zoneId')
        .addSelect('COUNT(*)', 'parcels')
        .addSelect("COALESCE(SUM(CASE WHEN t.status = 'delivered' THEN 1 ELSE 0 END), 0)", 'delivered')
        .addSelect("COALESCE(SUM(CASE WHEN t.status = 'failed' THEN 1 ELSE 0 END), 0)", 'failed')
        .where('t.createdAt > :d30', { d30 })
        .groupBy('zoneId')
        .orderBy('parcels', 'DESC')
        .limit(30)
        .getRawMany<{ zoneId: string; parcels: string; delivered: string; failed: string }>(),
      this.batches
        .createQueryBuilder('b')
        .leftJoin(Hub, 'h', 'h.id = b.hubId')
        .select('b.hubId', 'hubId')
        .addSelect('MAX(h.name)', 'hub')
        .addSelect('COUNT(*)', 'batches')
        .where('b.createdAt > :d30', { d30 })
        .groupBy('b.hubId')
        .getRawMany<{ hubId: string | null; hub: string | null; batches: string }>(),
      this.deliveries
        .createQueryBuilder('t')
        .where("t.status NOT IN ('delivered','failed') AND t.createdAt < :c", { c: new Date(Date.now() - 24 * 3_600_000) })
        .getCount(),
    ]);

    const by: Record<string, number> = {};
    let total = 0;
    let cod = 0;
    for (const r of statusRows) {
      by[r.status] = n(r.n);
      total += n(r.n);
      if (r.status !== 'delivered' && r.status !== 'failed') cod += n(r.cod);
    }
    const done = n(window30?.delivered);
    const failed = n(window30?.failed);
    const samples = n(timing?.samples);
    return {
      // — existing fields —
      totalParcels: total,
      unassigned: by['unassigned'] ?? 0,
      inTransit: by['in_transit'] ?? 0,
      delivered: by['delivered'] ?? 0,
      codToCollect: round2(cod),
      byStatus: by,
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
      byZone: zones.map((z) => ({ zoneId: z.zoneId, parcels: n(z.parcels), delivered: n(z.delivered), failed: n(z.failed) })),
      // Parcels are not tied to a hub in the data; what is real per hub is the dispatch batches built there.
      byHub: hubRows.map((h) => ({ hubId: h.hubId, hub: h.hub ?? 'Unassigned', batches30: n(h.batches) })),
    };
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
    if (!opts.includeDead) qb.andWhere(`o.status NOT IN ${DEAD}`);
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
        .addSelect('COUNT(DISTINCT o.id)', 'orders')
        .addSelect('COALESCE(SUM(i.qty), 0)', 'units')
        .andWhere('o.createdAt > :from', { from })
        .getRawOne<{ revenue: string; orders: string; units: string }>(),
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
      orders: orderCount,
      units: n(totals?.units),
      aov: orderCount ? round2(revenue / orderCount) : 0,
      revenueSeries: fillDays(keys, seriesRows, { revenue: 0, orders: 0, units: 0 }),
      topProducts: top.map((t) => ({ productId: t.productId, name: t.name, units: n(t.units), revenue: round2(n(t.revenue)) })),
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
