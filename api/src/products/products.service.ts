import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { Campaign, FlashSale, Product, ProductView, Seller } from '../database/entities';
import type { ProductStatus } from '../database/entities';
import { num, oneOf, price as priceOf, str } from '../common/validate';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';
import { parseVariantGroups } from '../common/variants/variants';
import type { VariantGroup } from '../common/variants/variants';
import { DEFAULT_LIMIT, MAX_LIMIT } from '../common/paging';
import { bestPrice, campaignCovers, campaignRunning } from './pricing';
import type { PriceSource } from './pricing';
import { DELIVERY_DAYS } from '../common/delivery/estimate';
import { CategoriesService } from '../catalog/categories.service';
import { TranslationService, chunk } from '../translation/translation.service';
import type { TranslationStatus } from '../translation/translation.service';
import { planWrite, sameShape } from '../translation/translatable';
import type { FieldInput, WritePlan, WriteState } from '../translation/translatable';
import { isLocale, otherLocale } from '../translation/translator.provider';
import type { Locale } from '../translation/translator.provider';
import { score } from '../search/rank';
import type { Searchable } from '../search/rank';

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
  /** The campaign's name in French (additive; `campaignName` is English). */
  campaignNameFr: string | null;
};

/**
 * What the API adds to a stored listing (plan §2.2): both languages composed from the base columns plus
 * `translations` rows, the category and store joined in, and where machine translation stands.
 */
export interface ServedFields {
  nameFr: string;
  descriptionFr: string | null;
  category: string;
  categoryFr: string;
  variantLabels: { en: VariantGroup[]; fr: VariantGroup[] };
  sellerName: string | null;
  machineTranslated: string[];
  translationStatus: TranslationStatus;
}
/** A listing exactly as it leaves the API. `name` / `description` are the English text, `nameFr` / `descriptionFr` the French. */
export type ServedProduct = PricedProduct & ServedFields;

const STATUSES = ['draft', 'pending', 'rejected', 'live', 'removed'] as const;

/** The words a client may send (any may be omitted; null / '' clears). */
export interface ProductTextInput {
  name?: unknown;
  nameFr?: unknown;
  description?: unknown;
  descriptionFr?: unknown;
  /** Option groups [{ name, options[] }] (or their JSON text), in the product's source language; empty / null clears them. */
  variants?: unknown;
  /** Optional display labels `{ en: Group[], fr: Group[] }`, index-aligned with `variants`; a wrong shape is dropped and re-translated (C-I4). */
  variantLabels?: unknown;
  /** Which language the title was written in, when both are sent. */
  sourceLang?: unknown;
}

/** Fields a SELLER may set on their own listing. */
export interface ListingInput extends ProductTextInput {
  price?: unknown;
  originalPrice?: unknown;
  /** Category by id (preferred) or by name in either language (older apps). */
  categoryId?: unknown;
  category?: unknown;
  stock?: unknown;
  image?: unknown;
  /** The seller's delivery time for this product, in days (1-30). */
  deliveryDays?: unknown;
  /** Moderation field — honoured only when `allowStatus` is true (admins). */
  status?: unknown;
}

/** A validated listing request: plain columns, the words, and the category reference. */
export interface CleanListing {
  columns: Partial<Pick<Product, 'price' | 'originalPrice' | 'discount' | 'stock' | 'image' | 'deliveryDays' | 'status'>>;
  text: {
    name?: string | null;
    nameFr?: string | null;
    description?: string | null;
    descriptionFr?: string | null;
    variants?: VariantGroup[];
    variantLabels?: Partial<Record<Locale, VariantGroup[]>>;
    sourceLang?: Locale;
  };
  category?: { id?: string; name?: string };
}

/** A word field: undefined = not sent, null = cleared (null / '' / blank), else the trimmed text. */
function word(x: unknown, label: string, max: number): string | null | undefined {
  if (x === undefined) return undefined;
  if (x === null || (typeof x === 'string' && x.trim() === '')) return null;
  return str(x, label, { max });
}

/** Display labels sent by a client; anything unreadable is dropped (the machine re-translates). */
function cleanLabels(raw: unknown): Partial<Record<Locale, VariantGroup[]>> {
  const out: Partial<Record<Locale, VariantGroup[]>> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const l of ['en', 'fr'] as const) {
    try {
      const g = parseVariantGroups((raw as Record<string, unknown>)[l]);
      if (g.length) out[l] = g;
    } catch {
      /* C-I4: dropped */
    }
  }
  return out;
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
): CleanListing {
  const columns: CleanListing['columns'] = {};
  const has = (k: keyof ListingInput) => input[k] !== undefined;
  if (!opts.partial || has('price')) columns.price = priceOf(input.price);
  if (has('originalPrice')) {
    columns.originalPrice = input.originalPrice === null ? null : priceOf(input.originalPrice, 'Original price');
  }
  if (has('stock')) columns.stock = num(input.stock, 'Stock', { min: 0, max: 1_000_000, int: true });
  if (has('image')) columns.image = input.image === null || input.image === '' ? null : str(input.image, 'Image', { max: 500 });
  if (has('deliveryDays')) {
    columns.deliveryDays = num(input.deliveryDays, 'Delivery time (days)', { min: DELIVERY_DAYS.min, max: DELIVERY_DAYS.max, int: true });
  }
  if (opts.allowStatus && has('status')) columns.status = oneOf<ProductStatus>(input.status, STATUSES, 'Status');

  const text: CleanListing['text'] = {
    name: word(input.name, 'Product title', 200),
    nameFr: word(input.nameFr, 'French product title', 200),
    description: word(input.description, 'Description', 5000),
    descriptionFr: word(input.descriptionFr, 'French description', 5000),
  };
  if (has('variants')) text.variants = parseVariantGroups(input.variants);
  if (has('variantLabels')) text.variantLabels = cleanLabels(input.variantLabels);
  if (input.sourceLang !== undefined && isLocale(input.sourceLang)) text.sourceLang = input.sourceLang;

  const p = columns.price ?? opts.currentPrice;
  if (columns.originalPrice !== undefined || columns.price !== undefined) {
    const orig = columns.originalPrice ?? undefined;
    columns.discount = orig && p !== undefined && orig > p ? Math.min(90, Math.round(((orig - p) / orig) * 100)) : 0;
  }

  const category =
    has('categoryId') || has('category')
      ? {
          id: typeof input.categoryId === 'string' && input.categoryId.trim() ? input.categoryId.trim() : undefined,
          name: typeof input.category === 'string' && input.category.trim() ? input.category.trim().slice(0, 100) : undefined,
        }
      : undefined;
  return { columns, text, category };
}

/** The variants field of a save: canonical groups in the source language, display labels in the other one. */
function variantInput(source: Locale, text: CleanListing['text'], current: string | null | undefined): FieldInput | undefined {
  if (text.variants === undefined) return undefined;
  const groups = text.variants;
  const json = groups.length ? JSON.stringify(groups) : null;
  const other = otherLocale(source);
  const labels = text.variantLabels?.[other];
  const labelsOk = !!labels && groups.length > 0 && sameShape(groups, labels); // C-I4
  const unchanged = json === (current ?? null);
  if (unchanged && !labelsOk) return undefined; // same options, nothing new to say: leave every translation alone
  return { [source]: json, [other]: labelsOk ? JSON.stringify(labels) : null };
}

/** Words of a save as planner input. */
function textInput(text: CleanListing['text']): Record<string, FieldInput> {
  return {
    name: { en: text.name, fr: text.nameFr },
    description: { en: text.description, fr: text.descriptionFr },
  };
}

/**
 * Did an edit change something a shopper reads (or sees)? French counts like English (re-review); a machine
 * translation never does: clearing a machine-made value, or sending it back unchanged, is not a change.
 */
export function materialTextChange(existing: ServedProduct, clean: CleanListing, categoryId?: string): boolean {
  const t = clean.text;
  const served: [string, string | null | undefined, string | null][] = [
    ['name', t.name, existing.name],
    ['nameFr', t.nameFr, existing.nameFr],
    ['description', t.description, existing.description],
    ['descriptionFr', t.descriptionFr, existing.descriptionFr],
  ];
  for (const [field, sent, now] of served) {
    if (sent === undefined) continue;
    const machine = existing.machineTranslated.includes(field);
    if (sent === null) {
      if (now !== null && !machine) return true;
    } else if (sent !== (now ?? null)) return true;
  }
  if (t.variants !== undefined && (t.variants.length ? JSON.stringify(t.variants) : null) !== (existing.variants ?? null)) return true;
  if (t.variantLabels) {
    const other = otherLocale(existing.sourceLang as Locale);
    const sent = t.variantLabels[other];
    if (sent && JSON.stringify(sent) !== JSON.stringify(existing.variantLabels[other])) return true;
  }
  if (categoryId !== undefined && categoryId !== existing.categoryId) return true;
  if (clean.columns.image !== undefined && (clean.columns.image ?? null) !== (existing.image ?? null)) return true;
  return false;
}

@Injectable()
export class ProductsService {
  /** Searchable corpus, rebuilt at most every few seconds (a search keystroke must not rebuild 5000 products). */
  private corpus: { at: number; rows: Searchable[] } | null = null;

  constructor(
    @InjectRepository(Product) private readonly repo: Repository<Product>,
    @InjectRepository(FlashSale) private readonly flash: Repository<FlashSale>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    @InjectRepository(Campaign) private readonly campaigns: Repository<Campaign>,
    @InjectRepository(ProductView) private readonly views: Repository<ProductView>,
    private readonly emitter: RealtimeEmitter,
    private readonly categories: CategoriesService,
    private readonly translations: TranslationService,
  ) {
    // A seller sees their OWN listings change live (including pending / rejected ones).
    this.emitter.registerFanout(['product:created', 'product:updated'], async (event, payload) => {
      const p = payload as Product;
      if (!p?.sellerId) return;
      const store = await this.sellers.findOne({ where: { id: p.sellerId } });
      this.emitter.toUser(store?.userId ?? p.sellerId, event, p);
    });
    // A machine finished (or gave up on) a listing's other language: tell the same rooms as any other change.
    this.translations.registerRepublisher('product', (id) => this.republish(id));
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
    const campTexts = camps.length ? await this.translations.present('campaign', camps) : new Map();
    const flashBy = new Map<string, number>();
    for (const f of sales) flashBy.set(f.productId, Math.min(flashBy.get(f.productId) ?? Infinity, f.flashPrice));
    return products.map((p) => {
      let camp: Campaign | undefined;
      for (const c of camps) {
        if (campaignCovers(c, p) && (!camp || c.discount > camp.discount)) camp = c;
      }
      const best = bestPrice(p.price, flashBy.get(p.id), camp?.discount);
      const won = best.source === 'campaign' ? camp : undefined;
      const extras = {
        basePrice: p.price,
        priceSource: best.source,
        campaignPct: best.campaignPct,
        campaignId: won?.id ?? null,
        campaignName: won ? (campTexts.get(won.id)?.texts.name ?? won.name) : null,
        campaignNameFr: won ? (campTexts.get(won.id)?.texts.nameFr ?? won.name) : null,
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

  /** Names of the stores that own the given ids (a seller id, or on old demo data the owner's user id). */
  private async sellerNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    for (const part of chunk(unique)) {
      for (const s of await this.sellers.find({ where: [{ id: In(part) }, { userId: In(part) }], select: { id: true, userId: true, name: true } })) {
        out.set(s.id, s.name);
        if (s.userId && !out.has(s.userId)) out.set(s.userId, s.name);
      }
    }
    return out;
  }

  /** The composed words, category and store of listings (no pricing): what warehouse and search read. */
  async describe(products: Product[]): Promise<Map<string, ServedFields & { name: string; description: string | null }>> {
    const out = new Map<string, ServedFields & { name: string; description: string | null }>();
    if (!products.length) return out;
    const [pres, cats, stores] = await Promise.all([
      this.translations.present('product', products),
      this.categories.names(products.map((p) => p.categoryId).filter((x): x is string => !!x)),
      this.sellerNames(products.map((p) => p.sellerId)),
    ]);
    for (const p of products) {
      const t = pres.get(p.id)!;
      const cat = p.categoryId ? cats.get(p.categoryId) : undefined;
      out.set(p.id, {
        name: t.texts.name ?? p.name,
        nameFr: t.texts.nameFr ?? p.name,
        description: t.texts.description ?? null,
        descriptionFr: t.texts.descriptionFr ?? null,
        category: cat?.name ?? '',
        categoryFr: cat?.nameFr ?? cat?.name ?? '',
        variantLabels: t.variantLabels ?? { en: [], fr: [] },
        sellerName: p.sellerId ? (stores.get(p.sellerId) ?? null) : null,
        machineTranslated: t.machineTranslated,
        translationStatus: t.translationStatus,
      });
    }
    return out;
  }

  /**
   * THE composer. Every listing that leaves the API (lists, detail, `product:created` / `product:updated`, the
   * storefront, the warehouse) goes through here: effective price, both languages, category and store names.
   */
  async present(products: Product[]): Promise<ServedProduct[]> {
    const [priced, texts] = await Promise.all([this.withPricing(products), this.describe(products)]);
    return priced.map((p) => Object.assign(p, texts.get(p.id)!) as ServedProduct);
  }

  /** The stored row, without promotional pricing — use this whenever the row will be saved back. */
  getRaw(id: string): Promise<Product | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** Category filter of a list request: an id, or a name in either language. Unknown names match nothing. */
  private async categoryFilter(filter: { category?: string; categoryId?: string }): Promise<string | null | undefined> {
    if (filter.categoryId) return filter.categoryId;
    if (!filter.category) return undefined;
    try {
      return await this.categories.resolveRef({ name: filter.category });
    } catch {
      return null;
    }
  }

  /**
   * Catalogue page. `status` filters exactly; without it soft-removed listings
   * are left out. `liveOnly` (shoppers) pushes "live" into the query; `ownerIds`
   * (a seller) additionally lets them see their own non-live listings.
   * `limit`/`offset` page the result (default {@link DEFAULT_LIMIT}).
   */
  async list(filter?: {
    category?: string;
    categoryId?: string;
    status?: string;
    sellerId?: string;
    liveOnly?: boolean;
    ownerIds?: string[];
    limit?: number;
    offset?: number;
  }): Promise<ServedProduct[]> {
    const base: Record<string, unknown> = {};
    const cat = filter ? await this.categoryFilter(filter) : undefined;
    if (cat === null) return [];
    if (cat) base.categoryId = cat;
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
    return this.present(rows);
  }

  /** A live listing by exact (case-insensitive) name — used to re-price snapshot order lines. */
  async findLiveByName(name: string): Promise<ServedProduct | null> {
    const hit = await this.repo
      .createQueryBuilder('p')
      .where("p.status = 'live' AND LOWER(TRIM(p.name)) = :n", { n: name.trim().toLowerCase() })
      .getOne();
    return hit ? (await this.present([hit]))[0] : null;
  }

  /** How many listings (any status except removed) a store has — for plan quotas. */
  countForSeller(sellerIds: string[]): Promise<number> {
    return this.repo.count({ where: { sellerId: In(sellerIds), status: Not('removed') } });
  }

  /** Ids of every product a seller owns (for scoping their order view). */
  async idsBySeller(sellerId: string): Promise<string[]> {
    return (await this.repo.find({ where: { sellerId }, select: { id: true } })).map((p) => p.id);
  }

  async get(id: string): Promise<ServedProduct | null> {
    const p = await this.repo.findOne({ where: { id } });
    return p ? (await this.present([p]))[0] : null;
  }

  /** Titles of listings in both languages (flash sales, reviews…), by id. */
  async names(ids: string[]): Promise<Map<string, { name: string; nameFr: string }>> {
    const out = new Map<string, { name: string; nameFr: string }>();
    for (const part of chunk([...new Set(ids)])) {
      const rows = await this.repo.find({ where: { id: In(part) }, select: { id: true, name: true, sourceLang: true } });
      const pres = await this.translations.present('product', rows);
      for (const r of rows) out.set(r.id, { name: pres.get(r.id)?.texts.name ?? r.name, nameFr: pres.get(r.id)?.texts.nameFr ?? r.name });
    }
    return out;
  }

  /**
   * Live listings in the shape the search ranks (English and French title and description, category, store),
   * rebuilt at most every 10 s.
   */
  async searchable(limit = 5000): Promise<Searchable[]> {
    if (this.corpus && Date.now() - this.corpus.at < 10_000) return this.corpus.rows;
    const rows = await this.repo.find({
      where: { status: 'live' },
      select: ['id', 'name', 'sourceLang', 'description', 'categoryId', 'sellerId', 'rating', 'reviewsCount'],
      take: limit,
    });
    const texts = await this.describe(rows);
    const result = rows.map((p) => {
      const t = texts.get(p.id)!;
      return {
        id: p.id,
        name: t.name,
        nameFr: t.nameFr,
        description: t.description,
        descriptionFr: t.descriptionFr,
        category: t.category,
        categoryFr: t.categoryFr,
        sellerName: t.sellerName,
        rating: p.rating,
        reviewsCount: p.reviewsCount,
      } satisfies Searchable;
    });
    this.corpus = { at: Date.now(), rows: result };
    return result;
  }

  /** `products:search`: live product ids ranked by relevance. */
  async search(q: string, limit: number): Promise<{ ids: string[]; total: number }> {
    const ranked = (await this.searchable())
      .map((p) => ({ id: p.id, s: score(p, q) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s);
    return { ids: ranked.slice(0, limit).map((r) => r.id), total: ranked.length };
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
    for (const p of await this.present(rows)) {
      this.emitter.toRoles(['customer', ...ADMIN_ROLES], 'product:updated', p);
    }
  }

  /** The rooms that hear about a listing: shoppers only while it is live, staff always. */
  private roomsFor(status: ProductStatus, wasLive = false): string[] {
    return status === 'live' || wasLive ? ['customer', 'guest', ...ADMIN_ROLES] : ADMIN_ROLES;
  }

  /** Re-emit a listing after a machine produced (or failed to produce) its other language. */
  async republish(id: string): Promise<void> {
    const product = await this.get(id);
    if (product) this.emitter.toRoles(this.roomsFor(product.status), 'product:updated', product);
  }

  /** Re-emit the given stored rows composed (rating changed, a store was suspended…). `rooms` defaults to shoppers + staff. */
  async publishUpdated(rows: Product[], rooms: string[] = ['customer', 'guest', ...ADMIN_ROLES]): Promise<void> {
    for (const p of await this.present(rows)) this.emitter.toRoles(rooms, 'product:updated', p);
  }

  /** Source texts of a listing after a save (what each author row was written against). */
  private static sources(base: { name?: string | null; description?: string | null; variants?: string | null }) {
    return { name: base.name ?? null, description: base.description ?? null, variants: base.variants ?? null };
  }

  /**
   * Create a listing. Words: `name` / `nameFr` (at least one: C-I1), `description` / `descriptionFr`, options.
   * Only the English given -> sourceLang en; only the French -> fr. The other language, if typed, is an author
   * row; if not, a machine fills it in the background.
   */
  async create(clean: CleanListing, meta: { sellerId: string | null; status: ProductStatus }): Promise<ServedProduct> {
    const categoryId = await this.categories.resolveRef(clean.category ?? {});
    const t = clean.text;
    // C-I1 (data layer): planWrite refuses a listing with no title in either language.
    const first = planWrite({ type: 'product', create: true, state: null, input: textInput(t), clientSourceLang: t.sourceLang, missingTitle: 'Enter a product title in English or French.' });
    const variants = variantInput(first.sourceLang, t, null);
    const plan = variants
      ? planWrite({ type: 'product', create: true, state: null, input: { ...textInput(t), variants }, clientSourceLang: t.sourceLang, missingTitle: 'Enter a product title in English or French.' })
      : first;
    const saved = await this.repo.manager.transaction(async (m) => {
      const row = await m.save(
        m.create(Product, {
          ...clean.columns,
          stock: clean.columns.stock ?? 0,
          name: plan.base.name ?? '',
          description: plan.base.description ?? null,
          variants: plan.base.variants ?? null,
          sourceLang: plan.sourceLang,
          categoryId, // C-I3: the listing points at the category, not at a copy of its name
          status: meta.status,
          sellerId: meta.sellerId,
        }),
      );
      await this.translations.applyPlan(m, 'product', row.id, plan, ProductsService.sources(row));
      return row;
    });
    await this.translations.enqueue('product', saved.id);
    this.corpus = null;
    const product = (await this.get(saved.id))!;
    // Shoppers only hear about listings that are live; staff see every new one
    // (a pending listing lands in the moderation queue).
    this.emitter.toRoles(product.status === 'live' ? ['customer', ...ADMIN_ROLES] : ADMIN_ROLES, 'product:created', product);
    return product;
  }

  async update(id: string, clean: CleanListing): Promise<ServedProduct | null> {
    const before = await this.getRaw(id);
    if (!before) return null;
    const set: Partial<Product> = { ...clean.columns };
    if (clean.category) set.categoryId = await this.categories.resolveRef(clean.category);
    const t = clean.text;
    const touchesText = ['name', 'nameFr', 'description', 'descriptionFr', 'variants'].some((k) => (t as Record<string, unknown>)[k] !== undefined);
    let plan: WritePlan | null = null;
    if (touchesText) {
      const rows = (await this.translations.rowsFor('product', [id])).get(id) ?? [];
      const authors: WriteState['authors'] = {};
      for (const r of rows) if (r.origin === 'author' && isLocale(r.locale)) (authors[r.field] ??= {})[r.locale] = r.value;
      const state: WriteState = {
        sourceLang: isLocale(before.sourceLang) ? before.sourceLang : 'en',
        base: { name: before.name, description: before.description, variants: before.variants },
        authors,
      };
      const missingTitle = 'Enter a product title in English or French.';
      const first = planWrite({ type: 'product', create: false, state, input: textInput(t), missingTitle });
      const variants = variantInput(first.sourceLang, t, before.variants);
      plan = variants ? planWrite({ type: 'product', create: false, state, input: { ...textInput(t), variants }, missingTitle }) : first;
      if (typeof plan.base.name === 'string') set.name = plan.base.name;
      if ('description' in plan.base) set.description = plan.base.description;
      if ('variants' in plan.base) set.variants = plan.base.variants;
      if (plan.flipped) set.sourceLang = plan.sourceLang;
    }
    await this.repo.manager.transaction(async (m) => {
      if (Object.keys(set).length) await m.update(Product, { id }, set);
      if (plan) {
        const after = { name: set.name ?? before.name, description: 'description' in set ? set.description : before.description, variants: 'variants' in set ? set.variants : before.variants };
        await this.translations.applyPlan(m, 'product', id, plan, ProductsService.sources(after));
      }
    });
    if (plan?.touched || plan?.flipped) await this.translations.enqueue('product', id);
    this.corpus = null;
    const product = await this.get(id);
    if (product) this.emitter.toRoles(this.roomsFor(product.status, before.status === 'live'), 'product:updated', product);
    return product;
  }

  /** The seller asked for a fresh machine translation of their listing (author rows are kept). */
  async retranslate(id: string): Promise<ServedProduct | null> {
    if (!(await this.repo.exist({ where: { id } }))) return null;
    await this.translations.retranslate('product', id);
    return this.get(id);
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
  async remove(id: string): Promise<ServedProduct | null> {
    const product = await this.getRaw(id);
    if (!product) return null;
    product.status = 'removed';
    const saved = await this.repo.save(product);
    this.corpus = null;
    const served = (await this.present([saved]))[0];
    this.emitter.toRoles(['customer', 'guest', ...ADMIN_ROLES], 'product:updated', served);
    return served;
  }
}
