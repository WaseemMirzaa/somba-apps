import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { Campaign, FlashSale, Product, ProductView, Seller, StockMovement, serializeVariantStock } from '../database/entities';
import { onVacation, totalDeliveryDays, vacationNotice } from '../sellers/storefront';
import type { ProductStatus, StockReason } from '../database/entities';
import { num, oneOf, optStr, price as priceOf, str } from '../common/validate';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';

/** Staff who follow the catalogue and its stock live: every admin role and the warehouse (it reads inventory). */
const STAFF_ROLES = [...ADMIN_ROLES, 'warehouse_staff'];
import { DEFAULT_VARIANT, parseVariantGroups, storedVariantGroups } from '../common/variants/variants';
import type { VariantGroup } from '../common/variants/variants';
import { productImageList, productImageUrl } from './image-url';
import { availableFor as availableOf, cleanVariantStock, deriveStock, planChange, pruneEntries } from './variant-stock';
import type { StockEntries } from './variant-stock';
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
/** Where the listing's store stands: on vacation (hide "Add to cart"), its handling time, the delivery time shoppers should expect. */
export interface StoreFields {
  sellerOnVacation: boolean;
  sellerVacationUntil: Date | null;
  sellerVacationNotice: { en: string; fr: string } | null;
  sellerHandlingDays: number;
  /** `deliveryDays` plus the store's handling time. */
  totalDeliveryDays: number;
}
export type ServedProduct = PricedProduct & ServedFields & StoreFields;

const STATUSES = ['draft', 'pending', 'rejected', 'live', 'removed'] as const;
const MAX_IMAGES = 8;

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
  /** The whole gallery, cover first (uploads or https). `image` alone still works and sets the cover. */
  images?: unknown;
  /** The seller's own stock code, unique among that seller's products. */
  sku?: unknown;
  brand?: unknown;
  weightGrams?: unknown;
  /** Convenience: kilograms, stored as grams. */
  weightKg?: unknown;
  /** Units per option label, `{ "Size: 42 · Colour: Black": 5 }`; null clears the split. */
  variantStock?: unknown;
  /** Moderation field — honoured only when `allowStatus` is true (admins). */
  status?: unknown;
}

/** A validated listing request: plain columns, the words, and the category reference. */
export interface CleanListing {
  columns: Partial<Pick<Product, 'price' | 'originalPrice' | 'discount' | 'stock' | 'image' | 'images' | 'sku' | 'brand' | 'weightGrams' | 'deliveryDays' | 'status'>>;
  /** Raw per-option stock as sent (checked against the product's options when it is saved). */
  variantStock?: unknown;
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
  if (has('images')) {
    const list = productImageList(input.images);
    // A cover sent next to the gallery wins and goes first.
    const cover = has('image') && input.image ? productImageUrl(input.image) : undefined;
    columns.images = cover ? [cover, ...list.filter((u) => u !== cover)].slice(0, MAX_IMAGES) : list;
    columns.image = columns.images[0] ?? null;
  } else if (has('image')) {
    columns.image = input.image === null || input.image === '' ? null : productImageUrl(input.image);
  }
  if (has('sku')) columns.sku = cleanSku(input.sku);
  if (has('brand')) columns.brand = input.brand === null || input.brand === '' ? null : optStr(input.brand, 'Brand', 80);
  if (has('weightGrams') || has('weightKg')) {
    if (has('weightGrams') && input.weightGrams !== null && input.weightGrams !== '') columns.weightGrams = num(input.weightGrams, 'Weight (g)', { min: 1, max: 1_000_000, int: true });
    else if (has('weightKg') && input.weightKg !== null && input.weightKg !== '') columns.weightGrams = Math.round(num(input.weightKg, 'Weight (kg)', { min: 0.001, max: 1000 }) * 1000);
    else columns.weightGrams = null;
  }
  if (has('deliveryDays')) {
    columns.deliveryDays = num(input.deliveryDays, 'Delivery time (days)', { min: DELIVERY_DAYS.min, max: DELIVERY_DAYS.max, int: true });
  }
  if (opts.allowStatus && has('status')) columns.status = oneOf<ProductStatus>(input.status, STATUSES, 'Status');

  const variantStock = has('variantStock') ? (input.variantStock ?? null) : undefined;

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
  return { columns, text, category, ...(variantStock !== undefined ? { variantStock } : {}) };
}

/** A stock code: letters, digits and . _ - / # (spaces inside allowed), 1-60 characters; blank clears it. */
export function cleanSku(x: unknown): string | null {
  if (x === null || x === undefined || (typeof x === 'string' && x.trim() === '')) return null;
  const s = str(x, 'SKU', { max: 60 });
  if (!/^[A-Za-z0-9][A-Za-z0-9._\-/# ]*$/.test(s)) throw new Error('SKU can use letters, numbers and . _ - / # (up to 60 characters).');
  return s;
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
  if (clean.columns.images !== undefined && JSON.stringify(clean.columns.images) !== JSON.stringify(existing.images ?? [])) return true;
  if (clean.columns.brand !== undefined && (clean.columns.brand ?? null) !== (existing.brand ?? null)) return true;
  return false;
}

/** What a change of stock did, for the ledger, the low-stock notice and anyone listening. */
export interface StockChange {
  productId: string;
  sellerId: string | null;
  variant: string | null;
  delta: number;
  /** The product's total before and after. */
  before: number;
  after: number;
  /** Units of that option before and after, when it has an entry of its own. */
  entryBefore: number | null;
  entryAfter: number | null;
  reason: StockReason;
}

/** Who and why behind a change of stock (all optional: a plain sale needs none). */
export interface StockOpts {
  /** The option label. Omit for a product without options. */
  variant?: string | null;
  orderId?: string | null;
  reason?: StockReason;
  actorId?: string | null;
  note?: string | null;
}

type StockListener = (change: StockChange) => void | Promise<void>;

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);
  private readonly stockListeners: StockListener[] = [];
  private campaignSaleHook: ((campaignId: string) => void | Promise<void>) | null = null;
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
    @InjectRepository(StockMovement) private readonly movements?: Repository<StockMovement>,
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
    return (await this.flash.find({ where: { active: true, status: 'approved' } })).filter((f) => {
      const from = f.startsAt ? Date.parse(f.startsAt) : NaN;
      const to = f.endsAt ? Date.parse(f.endsAt) : NaN;
      return !(Number.isFinite(from) && now < from) && !(Number.isFinite(to) && now >= to);
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

  /** Vacation and handling time of each listing's store (one lookup per call; only stores that set either are kept). */
  private async storeFields(products: Product[]): Promise<Map<string, StoreFields>> {
    const out = new Map<string, StoreFields>();
    const keys = [...new Set(products.map((p) => p.sellerId).filter((x): x is string => !!x))];
    const away = new Map<string, Seller>();
    for (const part of chunk(keys)) {
      const rows = await this.sellers.find({ where: [{ id: In(part) }, { userId: In(part) }] });
      for (const s of rows) {
        if (!onVacation(s) && !(s.handlingDays > 0)) continue;
        away.set(s.id, s);
        if (s.userId) away.set(s.userId, s);
      }
    }
    for (const p of products) {
      const s = p.sellerId ? away.get(p.sellerId) : undefined;
      const vacation = !!s && onVacation(s);
      out.set(p.id, {
        sellerOnVacation: vacation,
        sellerVacationUntil: vacation ? s!.vacationUntil : null,
        sellerVacationNotice: vacation ? vacationNotice(s!.name, s!.vacationUntil as Date) : null,
        sellerHandlingDays: s?.handlingDays ?? 0,
        totalDeliveryDays: totalDeliveryDays(p.deliveryDays, s),
      });
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
    const [priced, texts, stores] = await Promise.all([this.withPricing(products), this.describe(products), this.storeFields(products)]);
    return priced.map((p) => {
      const served = Object.assign(p, texts.get(p.id)!, stores.get(p.id)!) as ServedProduct;
      // Listings from before galleries existed (and seed data) have a cover but no list: serve it as a gallery of one.
      if (!served.images?.length && served.image) served.images = [served.image];
      return served;
    });
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
    /** With `ownerIds`: ONLY those stores' listings (a seller's catalogue), not the marketplace plus their own drafts. */
    ownOnly?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<ServedProduct[]> {
    const base: Record<string, unknown> = {};
    const cat = filter ? await this.categoryFilter(filter) : undefined;
    if (cat === null) return [];
    if (cat) base.categoryId = cat;
    if (filter?.sellerId) base.sellerId = filter.sellerId;
    let where: Record<string, unknown> | Record<string, unknown>[];
    if (filter?.ownOnly) {
      if (!filter.ownerIds?.length) return [];
      where = { ...base, sellerId: In(filter.ownerIds), status: filter.status ? filter.status : Not('removed') };
    } else if (filter?.liveOnly) {
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

  /** CampaignsService listens here to end a campaign whose budget ran out and to tell its seller live. */
  onCampaignSale(fn: (campaignId: string) => void | Promise<void>): void {
    this.campaignSaleHook = fn;
  }

  /**
   * A campaign got an order: bump its engagement counters and the discount it has given so far (`discountUsd`:
   * list price minus campaign price, times quantity). The budget is checked by the listener.
   */
  async recordCampaignSale(campaignId: string, revenueUsd: number, discountUsd = 0): Promise<void> {
    await this.campaigns
      .createQueryBuilder()
      .update(Campaign)
      .set({
        orders: () => 'orders + 1',
        revenueUsd: () => `revenueUsd + ${Number(revenueUsd.toFixed(2))}`,
        spentUsd: () => `spentUsd + ${Number(Math.max(0, discountUsd).toFixed(2))}`,
      })
      .where('id = :campaignId', { campaignId })
      .execute();
    if (this.campaignSaleHook) await Promise.resolve(this.campaignSaleHook(campaignId)).catch((e) => this.logger.warn(`campaign sale hook failed: ${(e as Error).message}`));
  }

  /** Products a campaign covers, in pages of 200 (no cap): its listed products, else the whole store. */
  private async *coveredPages(campaign: Pick<Campaign, 'productIds' | 'sellerId'>): AsyncGenerator<Product[]> {
    const PAGE = 200;
    if (campaign.productIds?.length) {
      for (const part of chunk(campaign.productIds, PAGE)) {
        const rows = await this.repo.find({ where: { id: In(part) } });
        if (rows.length) yield rows;
      }
      return;
    }
    if (!campaign.sellerId) return;
    let last = '';
    for (;;) {
      const rows = await this.repo
        .createQueryBuilder('p')
        .where("p.sellerId = :sid AND p.status = 'live' AND p.id > :last", { sid: campaign.sellerId, last })
        .orderBy('p.id', 'ASC')
        .take(PAGE)
        .getMany();
      if (!rows.length) return;
      yield rows;
      last = rows[rows.length - 1].id;
      if (rows.length < PAGE) return;
    }
  }

  /**
   * A campaign started, stopped or changed: tell shoppers' screens the new effective prices of EVERY product it
   * covers (sent in pages of 200, so a store-wide campaign on a big catalogue is not capped and not one huge burst).
   * Returns how many products were announced.
   */
  async broadcastCampaignPrices(campaign: Campaign): Promise<number> {
    let n = 0;
    for await (const rows of this.coveredPages(campaign)) {
      for (const p of await this.present(rows)) {
        this.emitter.toRoles(this.roomsFor(p.status), 'product:updated', p);
        n++;
      }
    }
    return n;
  }

  /** The rooms that hear about a listing: shoppers only while it is live, staff always. */
  private roomsFor(status: ProductStatus, wasLive = false): string[] {
    return status === 'live' || wasLive ? ['customer', 'guest', ...STAFF_ROLES] : STAFF_ROLES;
  }

  /** Re-emit a listing after a machine produced (or failed to produce) its other language. */
  async republish(id: string): Promise<void> {
    const product = await this.get(id);
    if (product) this.emitter.toRoles(this.roomsFor(product.status), 'product:updated', product);
  }

  /** Re-emit the given stored rows composed (rating changed, a store was suspended…). `rooms` defaults to shoppers + staff. */
  async publishUpdated(rows: Product[], rooms: string[] = ['customer', 'guest', ...STAFF_ROLES]): Promise<void> {
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
  async create(clean: CleanListing, meta: { sellerId: string | null; status: ProductStatus; stockReason?: StockReason; actorId?: string | null }): Promise<ServedProduct> {
    const categoryId = await this.categories.resolveRef(clean.category ?? {});
    const t = clean.text;
    // C-I1 (data layer): planWrite refuses a listing with no title in either language.
    const first = planWrite({ type: 'product', create: true, state: null, input: textInput(t), clientSourceLang: t.sourceLang, missingTitle: 'Enter a product title in English or French.' });
    const variants = variantInput(first.sourceLang, t, null);
    const plan = variants
      ? planWrite({ type: 'product', create: true, state: null, input: { ...textInput(t), variants }, clientSourceLang: t.sourceLang, missingTitle: 'Enter a product title in English or French.' })
      : first;
    // Per-option stock is checked against the options being saved; the total follows it (C-CM2).
    const groups = storedVariantGroups(plan.base.variants);
    const entries = clean.variantStock !== undefined ? cleanVariantStock(clean.variantStock, groups, plan.base.name ?? 'this product') : null;
    const stock = entries ? deriveStock({ oldStock: 0, oldEntries: null, entries, explicit: clean.columns.stock }) : (clean.columns.stock ?? 0);
    const images = clean.columns.images ?? (clean.columns.image ? [clean.columns.image] : []);
    if (clean.columns.sku) await this.assertSkuFree(meta.sellerId, clean.columns.sku, null); // C-CM1
    const saved = await this.guardSku(() => this.repo.manager.transaction(async (m) => {
      const row = await m.save(
        m.create(Product, {
          ...clean.columns,
          stock,
          variantStock: entries,
          images,
          image: images[0] ?? clean.columns.image ?? null,
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
    }));
    if (saved.stock > 0) {
      await this.log({ productId: saved.id, sellerId: saved.sellerId, variant: null, delta: saved.stock, stockAfter: saved.stock, reason: meta.stockReason ?? 'initial', orderId: null, actorId: meta.actorId ?? null, note: null });
    }
    await this.translations.enqueue('product', saved.id);
    this.corpus = null;
    const product = (await this.get(saved.id))!;
    // Shoppers only hear about listings that are live; staff see every new one
    // (a pending listing lands in the moderation queue).
    this.emitter.toRoles(product.status === 'live' ? ['customer', ...STAFF_ROLES] : STAFF_ROLES, 'product:created', product);
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
    // The gallery: a whole list replaces it; a lone cover replaces only the first picture.
    if (clean.columns.images !== undefined) {
      set.images = clean.columns.images;
      set.image = clean.columns.images[0] ?? null;
    } else if (clean.columns.image !== undefined) {
      const rest = (before.images ?? []).filter((u) => u !== before.image && u !== clean.columns.image);
      set.images = clean.columns.image ? [clean.columns.image, ...rest].slice(0, MAX_IMAGES) : rest;
      set.image = set.images[0] ?? null;
    }
    if (set.sku) await this.assertSkuFree(before.sellerId, set.sku, id); // C-CM1
    // Stock per option: validated against the options as they will be, and the total follows it (C-CM2).
    const groups = storedVariantGroups('variants' in set ? set.variants : before.variants);
    let entries: StockEntries = before.variantStock;
    if (clean.variantStock !== undefined) entries = cleanVariantStock(clean.variantStock, groups, set.name ?? before.name);
    else if ('variants' in set) entries = pruneEntries(entries, groups);
    const entriesChanged = serializeVariantStock(entries) !== serializeVariantStock(before.variantStock);
    if (entriesChanged) set.variantStock = entries;
    if (entries && (entriesChanged || clean.columns.stock !== undefined)) {
      set.stock = deriveStock({ oldStock: before.stock, oldEntries: before.variantStock, entries, explicit: clean.columns.stock });
    }
    await this.guardSku(() => this.repo.manager.transaction(async (m) => {
      if (Object.keys(set).length) await m.update(Product, { id }, set);
      if (plan) {
        const after = { name: set.name ?? before.name, description: 'description' in set ? set.description : before.description, variants: 'variants' in set ? set.variants : before.variants };
        await this.translations.applyPlan(m, 'product', id, plan, ProductsService.sources(after));
      }
    }));
    if (set.stock !== undefined && set.stock !== before.stock) {
      await this.log({ productId: id, sellerId: before.sellerId, variant: null, delta: set.stock - before.stock, stockAfter: set.stock, reason: 'manual_adjust', orderId: null, actorId: null, note: 'Edited in the product form' });
    }
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

  // ---- Stock ---------------------------------------------------------------
  /** Be told after every change of stock (the low-stock notice listens here). Errors in a listener never fail the change. */
  onStockChange(fn: StockListener): void {
    this.stockListeners.push(fn);
  }

  /** Units a shopper can buy of one option of a product right now (0 for an unknown product). */
  async availableFor(id: string, variant?: string | null): Promise<number> {
    const row = await this.repo.findOne({ where: { id }, select: { id: true, stock: true, variantStock: true } });
    return row ? availableOf(row.stock, row.variantStock, variant && variant !== DEFAULT_VARIANT ? variant : null) : 0;
  }

  /**
   * THE one place stock moves. Applies `delta` (negative = take) to the product and, when the option has an entry
   * of its own, to that entry too. Atomic: the common case (no per-option split) is one conditional UPDATE; a split
   * product is compare-and-swapped on (stock, variantStock), retried when someone else got there first, so
   * concurrent orders can never oversell either.
   */
  private async change(id: string, delta: number, opts: StockOpts): Promise<{ ok: true; change: StockChange } | { ok: false; available: number; missing: boolean }> {
    const label = opts.variant && opts.variant !== DEFAULT_VARIANT ? opts.variant : null;
    const reason: StockReason = opts.reason ?? (delta < 0 ? 'sale' : 'cancel_restock');
    const done = async (before: number, after: number, entryBefore: number | null, entryAfter: number | null): Promise<{ ok: true; change: StockChange }> => {
      const meta = await this.repo.findOne({ where: { id }, select: { id: true, sellerId: true } });
      return { ok: true, change: { productId: id, sellerId: meta?.sellerId ?? null, variant: label, delta, before, after, entryBefore, entryAfter, reason } };
    };
    // Hot path: a product with no per-option stock moves with one statement.
    const hot = await this.repo
      .createQueryBuilder()
      .update(Product)
      .set({ stock: () => `stock + ${Math.trunc(delta)}` })
      .where('id = :id AND variantStock IS NULL AND stock + :d >= 0', { id, d: Math.trunc(delta) })
      .execute();
    if (hot.affected) {
      const row = await this.repo.findOne({ where: { id }, select: { id: true, stock: true } });
      const after = row?.stock ?? 0;
      return done(after - delta, after, null, null);
    }
    for (let attempt = 0; attempt < 12; attempt++) {
      const row = await this.repo.findOne({ where: { id }, select: { id: true, stock: true, variantStock: true } });
      if (!row) return { ok: false, available: 0, missing: true };
      const plan = planChange(row.stock, row.variantStock, label, delta);
      if (!plan.ok) return { ok: false, available: plan.available, missing: false };
      const guard = row.variantStock ? 'variantStock = :oldVs' : 'variantStock IS NULL';
      const res = await this.repo
        .createQueryBuilder()
        .update(Product)
        .set({ stock: plan.stock, variantStock: plan.entries })
        .where(`id = :id AND stock = :oldStock AND ${guard}`, { id, oldStock: row.stock, oldVs: serializeVariantStock(row.variantStock) })
        .execute();
      if (!res.affected) continue; // someone changed it between our read and write: look again
      const had = label && row.variantStock && Object.prototype.hasOwnProperty.call(row.variantStock, label);
      return done(row.stock, plan.stock, had ? row.variantStock![label!] : null, had && plan.entries ? plan.entries[label!] : null);
    }
    return { ok: false, available: 0, missing: false };
  }

  /** Ledger line + live update + listeners, after a change went through. */
  private async afterChange(c: StockChange, opts: StockOpts): Promise<void> {
    await this.log({
      productId: c.productId,
      sellerId: c.sellerId,
      variant: c.variant,
      delta: c.delta,
      stockAfter: c.after,
      reason: c.reason,
      orderId: opts.orderId ?? null,
      actorId: opts.actorId ?? null,
      note: opts.note ?? null,
    });
    await this.broadcast(c.productId);
    for (const fn of this.stockListeners) {
      try {
        await fn(c);
      } catch (e) {
        this.logger.warn(`stock listener failed: ${(e as Error).message}`);
      }
    }
  }

  private async log(row: Partial<StockMovement>): Promise<void> {
    if (!this.movements) return;
    try {
      await this.movements.insert(this.movements.create(row));
    } catch (e) {
      this.logger.warn(`could not write a stock movement: ${(e as Error).message}`);
    }
  }

  /**
   * Atomically take `qty` units of an option: the change only succeeds while enough is left, so concurrent orders
   * can never oversell. Returns false if there wasn't.
   */
  async reserve(id: string, qty: number, opts: StockOpts = {}): Promise<boolean> {
    const n = Math.trunc(qty);
    if (!(n > 0)) return true;
    const r = await this.change(id, -n, { ...opts, reason: opts.reason ?? 'sale' });
    if (!r.ok) return false;
    await this.afterChange(r.change, opts);
    return true;
  }

  /**
   * Return units to stock (a cancelled / failed order, a returned item). Pass the line's `variant` so the option's
   * own count is restored (C-CM2), `orderId` and a `reason` ('cancel_restock' by default, 'return_restock' for goods
   * that came back).
   */
  async restock(id: string, qty: number, opts: StockOpts = {}): Promise<void> {
    const n = Math.trunc(qty);
    if (!(n > 0)) return;
    const r = await this.change(id, n, { ...opts, reason: opts.reason ?? 'cancel_restock' });
    if (r.ok) await this.afterChange(r.change, opts);
  }

  /**
   * A person corrects the stock by a number of units (`delta`, never an absolute value, so it composes with sales
   * that happen at the same time). Throws when it would take more than there is.
   */
  async adjustStock(id: string, delta: number, opts: StockOpts): Promise<StockChange> {
    const d = Math.trunc(delta);
    if (!d) throw new BadRequestException('Enter a number of units other than zero.');
    const r = await this.change(id, d, { ...opts, reason: opts.reason ?? 'manual_adjust' });
    if (!r.ok) {
      if (r.missing) throw new BadRequestException('Product not found.');
      throw new BadRequestException(`There ${r.available === 1 ? 'is' : 'are'} only ${r.available} in stock${opts.variant && opts.variant !== DEFAULT_VARIANT ? ` for "${opts.variant}"` : ''}: you cannot remove ${-d}.`);
    }
    await this.afterChange(r.change, opts);
    return r.change;
  }

  /** The ledger of one product, newest first. */
  async movementsOf(productId: string, page: { take: number; skip: number }): Promise<{ items: StockMovement[]; total: number }> {
    if (!this.movements) return { items: [], total: 0 };
    const [items, total] = await this.movements.findAndCount({ where: { productId }, order: { createdAt: 'DESC', id: 'ASC' }, take: page.take, skip: page.skip });
    return { items, total };
  }

  private async broadcast(id: string) {
    const product = await this.get(id);
    if (product) {
      this.emitter.toRoles(this.roomsFor(product.status), 'product:updated', product);
    }
  }

  // ---- SKU -----------------------------------------------------------------
  /** One seller never has two products with the same SKU (the database enforces it too: UQ_products_seller_sku). */
  private async assertSkuFree(sellerId: string | null, sku: string, exceptId: string | null): Promise<void> {
    if (!sellerId) return;
    const qb = this.repo.createQueryBuilder('p').where('p.sellerId = :sellerId AND LOWER(p.sku) = LOWER(:sku)', { sellerId, sku });
    if (exceptId) qb.andWhere('p.id <> :exceptId', { exceptId });
    if (await qb.getExists()) throw new BadRequestException(`The SKU "${sku}" is already used by another of your products.`);
  }

  /** Turns the database's duplicate-SKU refusal (two saves racing) into the same message as the check above. */
  private async guardSku<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (/UQ_products_seller_sku|products\.sellerId, products\.sku|Duplicate entry .* for key '(?:products\.)?UQ_products_seller_sku'/i.test((e as Error).message ?? '')) {
        throw new BadRequestException('That SKU is already used by another of your products.');
      }
      throw e;
    }
  }

  /** Soft-remove a listing: hidden from storefront, kept for order history. */
  async remove(id: string): Promise<ServedProduct | null> {
    const product = await this.getRaw(id);
    if (!product) return null;
    product.status = 'removed';
    product.sku = null; // a removed listing frees its SKU for a new one (C-CM1 only covers listings that exist)
    const saved = await this.repo.save(product);
    this.corpus = null;
    const served = (await this.present([saved]))[0];
    this.emitter.toRoles(['customer', 'guest', ...STAFF_ROLES], 'product:updated', served);
    return served;
  }
}
