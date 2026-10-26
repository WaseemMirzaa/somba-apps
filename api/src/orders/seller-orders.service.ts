import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { SelectQueryBuilder } from 'typeorm';
import { Order, OrderItem, Product, Seller } from '../database/entities';
import { dateInput, fixed2, round2, toCsv } from '../finance/finance.util';
import { csvWords } from '../finance/csv-labels';
import { asLocale } from '../common/locale';
import { OrdersService } from './orders.service';
import { sellerTracking } from './seller-tracking';

/** Statuses an order itself can have, and the package steps of a seller's own lines. */
const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'] as const;
const PACKAGE_STATUSES = ['to_pack', 'ready', 'at_hub'] as const;

const MAX_CSV_ORDERS = 5000;

export interface SellerOrderQuery {
  limit?: unknown;
  offset?: unknown;
  q?: unknown;
  status?: unknown;
  from?: unknown;
  to?: unknown;
  format?: unknown;
  /** `en` | `fr`: the language of the CSV's headings and labels (the gateway fills in the caller's). */
  locale?: unknown;
}

/**
 * The seller's order list, paged / searched / filtered in the database (the old list loaded up to 500 orders and the
 * browser did the rest). Every order is shown in the redacted seller view: their lines only, the customer's first
 * name and city, the package status and the parcel's journey from the delivery tasks.
 */
@Injectable()
export class SellerOrdersService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    ordersSvc: OrdersService,
  ) {
    // `orders:list` for a seller (the old plain-array event) now filters and pages in the database too.
    ordersSvc.registerSellerLister(async (user, storeId, paging) => {
      const input = { limit: 200, ...((paging ?? {}) as SellerOrderQuery) };
      // `format: 'csv'` answers `{ filename, total, csv }` instead of the array, as `orders:sellerList` does.
      if (input.format === 'csv') return (await this.csv(user, storeId, input)) as unknown as unknown[];
      return (await this.page(user, storeId, input, 1000)).items;
    });
  }

  /** Ids a seller account's products may carry as `sellerId`: the store id and the user id (old demo data). */
  private async keys(userId: string, storeId?: string): Promise<string[]> {
    const store = await this.sellers.findOne({ where: { userId } });
    return [...new Set([storeId ?? store?.id ?? userId, userId, ...(store ? [store.id] : [])])];
  }

  private filtered(keys: string[], input: SellerOrderQuery): SelectQueryBuilder<Order> {
    const qb = this.orders.createQueryBuilder('o').innerJoin('o.items', 'i').innerJoin(Product, 'p', 'p.id = i.productId').where('p.sellerId IN (:...keys)', { keys });
    const status = typeof input.status === 'string' ? input.status : '';
    if (status && status !== 'all') {
      if ((ORDER_STATUSES as readonly string[]).includes(status)) qb.andWhere('o.status = :status', { status });
      else if ((PACKAGE_STATUSES as readonly string[]).includes(status)) {
        const step = status === 'to_pack' ? 'open' : status === 'ready' ? 'ready' : 'received';
        qb.andWhere("i.fulfilment = :step AND (o.status IN ('confirmed','processing') OR (o.status = 'pending' AND o.paymentMethod = 'cod'))", { step });
      } else throw new BadRequestException(`Status must be one of: ${[...ORDER_STATUSES, ...PACKAGE_STATUSES].join(', ')}.`);
    }
    const from = dateInput(input.from, false);
    const to = dateInput(input.to, true);
    if (from) qb.andWhere('o.createdAt >= :fromDate', { fromDate: from });
    if (to) qb.andWhere('o.createdAt <= :toDate', { toDate: to });
    const q = typeof input.q === 'string' ? input.q.trim().slice(0, 80).toLowerCase() : '';
    if (q) {
      // The customer's FIRST name only: a prefix of the stored full name, and only for a one-word search, so a
      // search can never confirm a surname.
      const byFirstName = /^\S+$/.test(q) ? ' OR LOWER(o.customerName) LIKE :first' : '';
      qb.andWhere(`(LOWER(o.reference) LIKE :q OR LOWER(i.productName) LIKE :q${byFirstName})`, { q: `%${q}%`, first: `${q}%` });
    }
    return qb;
  }

  /**
   * `orders:sellerList`: `{ items, total, limit, offset }`. `limit` up to 200 (default 50), `offset`, `q` (order
   * reference, product, customer first name), `status` (an order status, or a package step: `to_pack`, `ready`,
   * `at_hub`; matches orders where ANY of the seller's lines is at that step), `from` / `to` (order date).
   */
  async page(user: { id: string }, storeId: string | undefined, input: SellerOrderQuery = {}, maxLimit = 200) {
    const keys = await this.keys(user.id, storeId);
    const take = Math.min(maxLimit, Math.max(1, Math.floor(Number(input.limit) || 50)));
    const skip = Math.max(0, Math.floor(Number(input.offset) || 0));
    const total = Number(
      (await this.filtered(keys, input).select('COUNT(DISTINCT o.id)', 'n').getRawOne<{ n: string }>())?.n ?? 0,
    );
    const ids = (
      await this.filtered(keys, input)
        .select('o.id', 'id')
        .addSelect('o.createdAt', 'createdAt')
        .groupBy('o.id')
        .addGroupBy('o.createdAt')
        .orderBy('o.createdAt', 'DESC')
        .addOrderBy('o.id', 'ASC')
        .offset(skip)
        .limit(take)
        .getRawMany<{ id: string }>()
    ).map((r) => r.id);
    return { items: await this.views(ids, keys), total, limit: take, offset: skip };
  }

  /** The redacted views of the given orders, newest first, with tracking. */
  private async views(ids: string[], keys: string[]) {
    if (!ids.length) return [];
    const rows = await this.orders.find({ where: { id: In(ids) }, order: { createdAt: 'DESC' } });
    const productIds = [...new Set(rows.flatMap((o) => (o.items ?? []).map((i) => i.productId)))];
    const mine = new Set((await this.products.find({ where: { id: In(productIds), sellerId: In(keys) }, select: { id: true } })).map((p) => p.id));
    const tracking = await sellerTracking(this.orders.manager, ids, keys).catch(() => new Map());
    return rows.map((o) => OrdersService.sellerView(o, (o.items ?? []).filter((i) => mine.has(i.productId)), { tracking: tracking.get(o.id) ?? null }));
  }

  /** The same filter as {@link page}, as a CSV file: one line per order line. */
  async csv(user: { id: string }, storeId: string | undefined, input: SellerOrderQuery = {}) {
    const keys = await this.keys(user.id, storeId);
    const ids = (
      await this.filtered(keys, input)
        .select('o.id', 'id')
        .addSelect('o.createdAt', 'createdAt')
        .groupBy('o.id')
        .addGroupBy('o.createdAt')
        .orderBy('o.createdAt', 'DESC')
        .limit(MAX_CSV_ORDERS)
        .getRawMany<{ id: string }>()
    ).map((r) => r.id);
    const views = await this.views(ids, keys);
    const w = csvWords(asLocale(input.locale) ?? 'en');
    const rows: (string | number | null)[][] = [[w.t('h.order'), w.t('h.date'), w.t('h.status'), w.t('h.package'), w.t('h.customer'), w.t('h.city'), w.t('h.payment'), w.t('h.product'), w.t('h.option'), w.t('h.qty'), w.t('h.unitPrice'), w.t('h.coupon'), w.t('h.commission'), w.t('h.net')]];
    for (const v of views) {
      for (const i of v.items as OrderItem[]) {
        if (i.fulfilment === 'cancelled') continue;
        const gross = round2(i.priceUsd * i.qty - (Number(i.couponDiscountUsd) || 0));
        rows.push([v.reference, new Date(v.createdAt).toISOString().slice(0, 19).replace('T', ' '), w.orderStatus(v.status), w.packageStatus(v.packageStatus), v.customerName, v.city, w.method(v.paymentMethod), i.productName, i.variant, i.qty, fixed2(i.priceUsd), fixed2(Number(i.couponDiscountUsd) || 0), fixed2(Number(i.commissionUsd) || 0), fixed2(gross - (Number(i.commissionUsd) || 0))]);
      }
    }
    return { filename: 'orders.csv', total: views.length, csv: toCsv(rows) };
  }
}
