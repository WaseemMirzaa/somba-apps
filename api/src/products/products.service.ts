import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { Campaign, FlashSale, Product, ProductView, Seller } from '../database/entities';
import type { ProductStatus } from '../database/entities';
import { num, oneOf, optStr, price as priceOf, str } from '../common/validate';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';
import { parseVariantGroups } from '../common/variants/variants';
import { DEFAULT_LIMIT, MAX_LIMIT } from '../common/paging';
import { bestPrice, campaignCovers, campaignRunning } from './pricing';
import type { PriceSource } from './pricing';
import { DELIVERY_DAYS } from '../common/delivery/estimate';

/**
 * A listing as shoppers see (and are charged for) it: `price` is the effective
 * unit price after the best running promotion, `basePrice` the stored one.
 */
export type PricedProduct = Product & {
  basePrice: number;
  priceSource: PriceSource;
  /** Percent off from the winning seller campaign (0 when no campaign set the price). */
  campaignPct: number;
  campaignId: string | null;
  campaignName: string | null;
};

const STATUSES = ['draft', 'pending', 'rejected', 'live', 'removed'] as const;

/** Fields a SELLER may set on their own listing. */
export interface ListingInput {
  name?: unknown;
  nameFr?: unknown;
  price?: unknown;
  originalPrice?: unknown;
  category?: unknown;
  categoryFr?: unknown;
  stock?: unknown;
  image?: unknown;
  description?: unknown;
  /** Option groups [{ name, options[] }] (or their JSON text); empty / null clears them. */
  variants?: unknown;
  /** The seller's delivery time for this product, in days (1-30). */
  deliveryDays?: unknown;
  /** Moderation field — honoured only when `allowStatus` is true (admins). */
  status?: unknown;
}

/**
 * Validate and normalise listing fields. Every value is range-checked (no
 * negative prices/stock) and unknown keys are dropped, so a client can never
 * set `sellerId`, `rating`, `reviewsCount`… The discount badge is computed here
 * from the prices rather than trusted from the client.
 */
export function cleanListing(
  input: ListingInput,
  opts: { partial: boolean; allowStatus: boolean; currentPrice?: number },
): Partial<Product> {
  const out: Partial<Product> = {};
  const has = (k: keyof ListingInput) => input[k] !== undefined;
  if (!opts.partial || has('name')) out.name = str(input.name, 'Name', { max: 200 });
  if (has('nameFr')) out.nameFr = optStr(input.nameFr, 'French name', 200);
  if (!opts.partial || has('price')) out.price = priceOf(input.price);
  if (has('originalPrice')) {
    out.originalPrice = input.originalPrice === null ? null : priceOf(input.originalPrice, 'Original price');
  }
  if (!opts.partial || has('category')) out.category = str(input.category, 'Category', { max: 100 });
  if (has('categoryFr')) out.categoryFr = optStr(input.categoryFr, 'French category', 100);
  if (has('stock')) out.stock = num(input.stock, 'Stock', { min: 0, max: 1_000_000, int: true });
  if (has('image')) out.image = optStr(input.image, 'Image', 500);
  if (has('description')) out.description = optStr(input.description, 'Description', 5000);
  if (has('deliveryDays')) {
    out.deliveryDays = num(input.deliveryDays, 'Delivery time (days)', { min: DELIVERY_DAYS.min, max: DELIVERY_DAYS.max, int: true });
  }
  if (has('variants')) {
    const groups = parseVariantGroups(input.variants);
    out.variants = groups.length ? JSON.stringify(groups) : null;
  }
  if (opts.allowStatus && has('status')) out.status = oneOf<ProductStatus>(input.status, STATUSES, 'Status');

  const p = out.price ?? opts.currentPrice;
  if (out.originalPrice !== undefined || out.price !== undefined) {
    const orig = out.originalPrice ?? undefined;
    out.discount = orig && p !== undefined && orig > p ? Math.min(90, Math.round(((orig - p) / orig) * 100)) : 0;
  }
  return out;
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly repo: Repository<Product>,
    @InjectRepository(FlashSale) private readonly flash: Repository<FlashSale>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    @InjectRepository(Campaign) private readonly campaigns: Repository<Campaign>,
    @InjectRepository(ProductView) private readonly views: Repository<ProductView>,
    private readonly emitter: RealtimeEmitter,
  ) {
    // A seller sees their OWN listings change live (including pending / rejected ones).
    this.emitter.registerFanout(['product:created', 'product:updated'], async (event, payload) => {
      const p = payload as Product;
      if (!p?.sellerId) return;
      const store = await this.sellers.findOne({ where: { id: p.sellerId } });
      this.emitter.toUser(store?.userId ?? p.sellerId, event, p);
    });
  }

  /** Flash sales running right now. */
  private async runningFlash(): Promise<FlashSale[]> {
    const now = Date.now();
    return (await this.flash.find({ where: { active: true } })).filter((f) => {
      const from = f.startsAt ? Date.parse(f.startsAt) : NaN;
      const to = f.endsAt ? Date.parse(f.endsAt) : NaN;
      return !(Number.isFinite(from) && now < from) && !(Number.isFinite(to) && now > to);
    });
  }

  /** Seller campaigns that are approved and inside their dates right now. */
  private async runningCampaigns(): Promise<Campaign[]> {
    const rows = await this.campaigns.find({ where: { status: In(['active', 'scheduled']) } });
    return rows.filter((c) => campaignRunning(c));
  }

  /**
   * Show (and charge) the effective price: the LOWEST of the listing price, a
   * running flash-sale price and a running seller-campaign discount (they never
   * stack; see products/pricing.ts). The normal price is kept as the "was"
   * price. Only the returned copy changes, never the stored row.
   */
  private async withPricing(products: Product[]): Promise<PricedProduct[]> {
    if (!products.length) return [];
    const [sales, camps] = await Promise.all([this.runningFlash(), this.runningCampaigns()]);
    const flashBy = new Map<string, number>();
    for (const f of sales) flashBy.set(f.productId, Math.min(flashBy.get(f.productId) ?? Infinity, f.flashPrice));
    return products.map((p) => {
      let camp: Campaign | undefined;
      for (const c of camps) {
        if (campaignCovers(c, p) && (!camp || c.discount > camp.discount)) camp = c;
      }
      const best = bestPrice(p.price, flashBy.get(p.id), camp?.discount);
      const extras = {
        basePrice: p.price,
        priceSource: best.source,
        campaignPct: best.campaignPct,
        campaignId: best.source === 'campaign' ? (camp?.id ?? null) : null,
        campaignName: best.source === 'campaign' ? (camp?.name ?? null) : null,
      };
      if (best.source === 'base') return Object.assign(Object.create(Object.getPrototypeOf(p)), p, extras) as PricedProduct;
      const was = Math.max(p.originalPrice ?? 0, p.price);
      return Object.assign(Object.create(Object.getPrototypeOf(p)), p, extras, {
        price: best.price,
        originalPrice: was,
        discount: Math.min(90, Math.round(((was - best.price) / was) * 100)),
      }) as PricedProduct;
    });
  }

  /** The stored row, without promotional pricing — use this whenever the row will be saved back. */
  getRaw(id: string): Promise<Product | null> {
    return this.repo.findOne({ where: { id } });
  }

  /**
   * Catalogue page. `status` filters exactly; without it soft-removed listings
   * are left out. `liveOnly` (shoppers) pushes "live" into the query; `ownerIds`
   * (a seller) additionally lets them see their own non-live listings.
   * `limit`/`offset` page the result (default {@link DEFAULT_LIMIT}).
   */
  async list(filter?: {
    category?: string;
    status?: string;
    sellerId?: string;
    liveOnly?: boolean;
    ownerIds?: string[];
    limit?: number;
    offset?: number;
  }): Promise<PricedProduct[]> {
    const base: Record<string, unknown> = {};
    if (filter?.category) base.category = filter.category;
    if (filter?.sellerId) base.sellerId = filter.sellerId;
    let where: Record<string, unknown> | Record<string, unknown>[];
    if (filter?.liveOnly) {
      where = filter.ownerIds?.length
        ? [
            { ...base, status: 'live' },
            { ...base, sellerId: In(filter.ownerIds), status: Not('removed') },
          ]
        : { ...base, status: 'live' };
    } else {
      where = { ...base, status: filter?.status ? filter.status : Not('removed') };
    }
    const rows = await this.repo.find({
      where: where as never,
      order: { createdAt: 'DESC', id: 'ASC' },
      take: Math.min(Math.max(1, filter?.limit ?? DEFAULT_LIMIT), MAX_LIMIT),
      skip: filter?.offset ?? 0,
    });
    return this.withPricing(rows);
  }

  /** A live listing by exact (case-insensitive) name — used to re-price snapshot order lines. */
  async findLiveByName(name: string): Promise<PricedProduct | null> {
    const hit = await this.repo
      .createQueryBuilder('p')
      .where("p.status = 'live' AND LOWER(TRIM(p.name)) = :n", { n: name.trim().toLowerCase() })
      .getOne();
    return hit ? (await this.withPricing([hit]))[0] : null;
  }

  /** How many listings (any status except removed) a store has — for plan quotas. */
  countForSeller(sellerIds: string[]): Promise<number> {
    return this.repo.count({ where: { sellerId: In(sellerIds), status: Not('removed') } });
  }

  /** Ids of every product a seller owns (for scoping their order view). */
  async idsBySeller(sellerId: string): Promise<string[]> {
    return (await this.repo.find({ where: { sellerId }, select: { id: true } })).map((p) => p.id);
  }

  async get(id: string): Promise<PricedProduct | null> {
    const p = await this.repo.findOne({ where: { id } });
    return p ? (await this.withPricing([p]))[0] : null;
  }

  /**
   * Count one product-detail view (shoppers only). One row per product per UTC
   * day, incremented atomically; the very first view of a day inserts the row
   * (a concurrent insert loses on the unique index and simply increments).
   */
  async recordView(productId: string): Promise<void> {
    const viewDate = new Date().toISOString().slice(0, 10);
    const bump = () =>
      this.views
        .createQueryBuilder()
        .update(ProductView)
        .set({ views: () => 'views + 1' })
        .where('productId = :productId AND viewDate = :viewDate', { productId, viewDate })
        .execute();
    if ((await bump()).affected) return;
    try {
      await this.views.insert({ productId, viewDate, views: 1 });
    } catch {
      await bump();
    }
  }

  /** A campaign got an order: bump its engagement counters. */
  async recordCampaignSale(campaignId: string, revenueUsd: number): Promise<void> {
    await this.campaigns
      .createQueryBuilder()
      .update(Campaign)
      .set({ orders: () => 'orders + 1', revenueUsd: () => `revenueUsd + ${Number(revenueUsd.toFixed(2))}` })
      .where('id = :campaignId', { campaignId })
      .execute();
  }

  /**
   * A campaign was approved / changed: tell shoppers' screens about the new
   * effective prices of the products it covers (capped, so a store-wide
   * campaign on a huge catalogue does not flood the sockets).
   */
  async broadcastCampaignPrices(campaign: Campaign, cap = 100): Promise<void> {
    const where = campaign.productIds?.length
      ? { id: In(campaign.productIds.slice(0, cap)) }
      : campaign.sellerId
        ? { sellerId: campaign.sellerId, status: 'live' as const }
        : null;
    if (!where) return;
    const rows = await this.repo.find({ where, take: cap });
    for (const p of await this.withPricing(rows)) {
      this.emitter.toRoles(['customer', ...ADMIN_ROLES], 'product:updated', p);
    }
  }

  async create(data: Partial<Product>): Promise<Product> {
    const product = await this.repo.save(this.repo.create(data));
    // Shoppers only hear about listings that are live; staff see every new one
    // (a pending listing lands in the moderation queue).
    this.emitter.toRoles(
      product.status === 'live' ? ['customer', ...ADMIN_ROLES] : ADMIN_ROLES,
      'product:created',
      product,
    );
    return product;
  }

  async update(id: string, patch: Partial<Product>): Promise<Product | null> {
    const before = await this.getRaw(id);
    await this.repo.update({ id }, patch);
    const product = await this.get(id);
    if (product) {
      // Shoppers get the update while it is live or when it just stopped being live
      // (so their screens drop it); a never-live listing stays staff-only.
      const shoppers = product.status === 'live' || before?.status === 'live';
      this.emitter.toRoles(shoppers ? ['customer', ...ADMIN_ROLES] : ADMIN_ROLES, 'product:updated', product);
    }
    return product;
  }

  /**
   * Atomically take `qty` units: the UPDATE only succeeds while enough stock is
   * left, so concurrent orders can never oversell. Returns false if there wasn't.
   */
  async reserve(id: string, qty: number): Promise<boolean> {
    const res = await this.repo
      .createQueryBuilder()
      .update(Product)
      .set({ stock: () => `stock - ${Math.trunc(qty)}` })
      .where('id = :id AND stock >= :qty', { id, qty: Math.trunc(qty) })
      .execute();
    if (!res.affected) return false;
    await this.broadcast(id);
    return true;
  }

  /** Return reserved units to stock (cancelled / failed orders). */
  async restock(id: string, qty: number): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(Product)
      .set({ stock: () => `stock + ${Math.trunc(qty)}` })
      .where('id = :id', { id })
      .execute();
    await this.broadcast(id);
  }

  private async broadcast(id: string) {
    const product = await this.get(id);
    if (product) {
      this.emitter.toRoles(['customer', ...ADMIN_ROLES], 'product:updated', product);
    }
  }

  /** Soft-remove a listing: hidden from storefront, kept for order history. */
  async remove(id: string): Promise<Product | null> {
    const product = await this.getRaw(id);
    if (!product) return null;
    product.status = 'removed';
    const saved = await this.repo.save(product);
    this.emitter.toRoles(
      ['customer', 'guest', ...ADMIN_ROLES],
      'product:updated',
      saved,
    );
    return saved;
  }
}
