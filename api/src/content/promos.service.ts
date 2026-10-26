import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FlashSale, Order, Product, Promo, Seller } from '../database/entities';
import type { FlashSalePhase } from '../database/entities';
import { num, oneOf, optStr, str } from '../common/validate';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES, NotificationsService } from '../notifications/notifications.service';
import { ProductsService } from '../products/products.service';
import { TranslationService } from '../translation/translation.service';
import type { TranslationStatus } from '../translation/translation.service';
import { planWrite } from '../translation/translatable';

/** A flash sale as clients receive it: title and product name in both languages (the product name is joined, never stored). */
export type ServedFlashSale = FlashSale & {
  titleFr: string;
  productName: string;
  productNameFr: string;
  machineTranslated: string[];
  translationStatus: TranslationStatus;
  /** Where the schedule stands right now (computed from the dates, not the stored column). */
  phase: FlashSalePhase;
  /** Milliseconds until it starts / ends (null when there is no such date or it has passed): for a countdown. */
  startsInMs: number | null;
  /** Milliseconds left; null when there is no end date (`endsAt: null`) OR the sale is over (`ended: true`): tell them apart with those two. */
  endsInMs: number | null;
  /** The sale is over (its end passed, it was ended by hand, or it was declined). False for a sale with no end date and for a nomination still waiting for marketing. */
  ended: boolean;
  sellerName: string | null;
  /** The list price the sale is measured against. */
  basePrice: number | null;
};

/** The percent off a flash price is worth against the normal price (whole percent, 0-90). */
export function flashDiscountPct(normalPrice: number, flashPrice: number): number {
  if (!(normalPrice > 0) || !(flashPrice < normalPrice)) return 0;
  return Math.min(90, Math.round(((normalPrice - flashPrice) / normalPrice) * 100));
}

/** A percent coupon's discount in USD, rounded to the cent (never to whole dollars). */
export function percentDiscount(subtotalUsd: number, percent: number): number {
  return Math.round(Number((subtotalUsd * percent).toFixed(6))) / 100;
}

/** One line of the cart a code is checked against (the price is what will be charged, flash/campaign already applied). */
export interface CouponLine {
  productId: string;
  sellerId: string | null;
  priceUsd: number;
  qty: number;
}

export interface PromoVerdict {
  ok: boolean;
  discount: number;
  code?: string;
  reason?: string;
  /** Set for a store coupon: the store that pays for it. */
  sellerId?: string | null;
  /** Set for a store coupon: the name of that store (so the cart can say "10% off Kinshasa Traders"). */
  sellerName?: string | null;
  /** For a store coupon: each input line's share of `discount`, index-aligned with the lines given (0 for ineligible ones). */
  lineDiscounts?: number[];
}

const round2 = (n: number) => Number(n.toFixed(2));

/**
 * Split `total` over the weights in cents so the shares add up to exactly `total` (the last non-zero share takes the
 * rounding). Zero weights get 0.
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((t, w) => t + w, 0);
  const out = weights.map(() => 0);
  if (!(sum > 0) || !(total > 0)) return out;
  let given = 0;
  let last = -1;
  weights.forEach((w, i) => {
    if (w > 0) last = i;
  });
  weights.forEach((w, i) => {
    if (w <= 0 || i === last) return;
    out[i] = round2((total * w) / sum);
    given += out[i];
  });
  if (last >= 0) out[last] = round2(total - given);
  return out;
}

/** Where a flash sale stands at `now`: before its start, running, or over (inactive / past its end). */
export function flashPhase(f: Pick<FlashSale, 'active' | 'startsAt' | 'endsAt' | 'status'>, now = Date.now()): FlashSalePhase {
  if (f.status && f.status !== 'approved') return 'ended';
  if (!f.active) return 'ended';
  const from = f.startsAt ? Date.parse(f.startsAt) : NaN;
  const to = f.endsAt ? Date.parse(f.endsAt) : NaN;
  if (Number.isFinite(to) && now >= to) return 'ended';
  if (Number.isFinite(from) && now < from) return 'scheduled';
  return 'running';
}

/** How often flash sales are started and ended on their dates (FLASH_SWEEP_MS, 0 turns it off). */
const FLASH_SWEEP_MS = Number(process.env.FLASH_SWEEP_MS ?? 30_000);

/** A start or end older than this is not worth a notice any more. */
const STALE_MS = 6 * 3_600_000;

const when = (iso: string | null) => (iso ? `${iso.slice(0, 16).replace('T', ' ')} UTC` : '');

@Injectable()
export class PromosService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PromosService.name);
  private sweeper: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(Promo) private readonly promos: Repository<Promo>,
    @InjectRepository(FlashSale)
    private readonly flashSales: Repository<FlashSale>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly emitter: RealtimeEmitter,
    private readonly productsSvc?: ProductsService,
    private readonly translations?: TranslationService,
    @InjectRepository(Seller) private readonly sellers?: Repository<Seller>,
    private readonly notifications?: NotificationsService,
  ) {
    // A machine finished a flash sale's other language: tell the same rooms as any flash-sale change.
    this.translations?.registerRepublisher('flash_sale', async (id) => {
      const fs = await this.flashSales.findOne({ where: { id } });
      if (fs) this.emitter.toRoles(['customer', 'guest', ...ADMIN_ROLES], 'flashsale:updated', (await this.presentFlash([fs]))[0]);
    });
  }

  onModuleInit(): void {
    if (FLASH_SWEEP_MS > 0) {
      this.sweeper = setInterval(() => void this.sweepFlash().catch((e) => this.logger.warn(`flash sweep failed: ${(e as Error).message}`)), FLASH_SWEEP_MS);
      this.sweeper.unref();
    }
  }

  onModuleDestroy(): void {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  /** Admins see every platform code; shoppers only active, public, unexpired ones (no internals). Store coupons are never listed here. */
  async list(admin: boolean): Promise<Partial<Promo>[]> {
    const rows = (await this.promos.find()).filter((p) => !p.sellerId);
    if (admin) return rows;
    const now = Date.now();
    return rows
      .filter((p) => p.active && p.isPublic && (!p.expiresAt || new Date(p.expiresAt).getTime() > now))
      .map((p) => ({ code: p.code, type: p.type, value: p.value, minOrder: p.minOrder, description: p.description, active: true }));
  }

  /** Redemptions so far (orders that used the code and weren't cancelled). */
  private async uses(code: string, userId?: string): Promise<number> {
    const qb = this.orders
      .createQueryBuilder('o')
      .where("o.promoCode = :code AND o.status != 'cancelled'", { code });
    if (userId) qb.andWhere('o.customerId = :userId', { userId });
    return qb.getCount();
  }

  /** Every id a store's products may carry as `sellerId` (the store row, and the owner's user id on old demo data). */
  private async storeKeys(sellerId: string): Promise<{ keys: Set<string>; name: string }> {
    const keys = new Set([sellerId]);
    const row = this.sellers ? await this.sellers.findOne({ where: [{ id: sellerId }, { userId: sellerId }] }) : null;
    if (row) {
      keys.add(row.id);
      if (row.userId) keys.add(row.userId);
    }
    return { keys, name: row?.name ?? 'this store' };
  }

  /**
   * Validate a code against a subtotal for a customer; returns the computed discount.
   *
   * A platform code discounts the whole subtotal. A STORE coupon (`promo.sellerId`) needs the cart's `lines`: it
   * discounts only that store's lines, its minimum order is measured on them, and the verdict carries each line's
   * share (`lineDiscounts`) because the store pays for it.
   */
  async validate(
    code: string,
    subtotalUsd: number,
    userId?: string,
    lines?: CouponLine[],
  ): Promise<PromoVerdict> {
    const promo = await this.promos.findOne({ where: { code: String(code ?? '').trim().toUpperCase() } });
    if (!promo || !promo.active) return { ok: false, discount: 0, reason: 'Invalid code.' };
    if (promo.expiresAt && new Date(promo.expiresAt).getTime() <= Date.now()) {
      return { ok: false, discount: 0, reason: 'This code has expired.' };
    }
    let base = subtotalUsd;
    let lineDiscounts: number[] | undefined;
    let storeName: string | null = null;
    let eligible: number[] = [];
    if (promo.sellerId) {
      const store = await this.storeKeys(promo.sellerId);
      storeName = store.name === 'this store' ? null : store.name;
      if (!lines) return { ok: false, discount: 0, reason: 'This coupon applies to one store’s products: add them to your cart first.' };
      eligible = lines.map((l) => (l.sellerId && store.keys.has(l.sellerId) ? round2(l.priceUsd * l.qty) : 0));
      base = round2(eligible.reduce((t, n) => t + n, 0));
      if (!(base > 0)) return { ok: false, discount: 0, reason: `This coupon only applies to products from ${store.name}.` };
    }
    if (!(Number(base) > 0) || base < promo.minOrder) {
      return { ok: false, discount: 0, reason: `Minimum order $${promo.minOrder}.` };
    }
    if (promo.maxUses != null && (await this.uses(promo.code)) >= promo.maxUses) {
      return { ok: false, discount: 0, reason: 'This code is no longer available.' };
    }
    if (promo.perUserLimit != null && userId && (await this.uses(promo.code, userId)) >= promo.perUserLimit) {
      return { ok: false, discount: 0, reason: 'You have already used this code.' };
    }
    const discount =
      promo.type === 'percent'
        ? Math.min(percentDiscount(base, promo.value), base)
        : Math.min(promo.value, base);
    if (promo.sellerId) lineDiscounts = allocate(round2(discount), eligible);
    return { ok: true, discount, code: promo.code, ...(promo.sellerId ? { sellerId: promo.sellerId, sellerName: storeName, lineDiscounts } : {}) };
  }

  async create(data: Record<string, unknown>): Promise<Promo> {
    const type = oneOf(data?.type ?? 'percent', ['percent', 'fixed'] as const, 'Type');
    const clean: Partial<Promo> = {
      code: str(data?.code, 'Code', { min: 3, max: 40 }).toUpperCase(),
      type,
      value: type === 'percent' ? num(data?.value, 'Discount', { min: 1, max: 90 }) : num(data?.value, 'Discount', { min: 0.01, max: 1000 }),
      minOrder: num(data?.minOrder ?? 0, 'Minimum order', { min: 0, max: 100000 }),
      description: optStr(data?.description, 'Description', 200),
      maxUses: data?.maxUses == null || data.maxUses === '' ? null : num(data.maxUses, 'Max uses', { min: 1, max: 10_000_000, int: true }),
      perUserLimit: data?.perUserLimit == null || data.perUserLimit === '' ? null : num(data.perUserLimit, 'Per-customer limit', { min: 1, max: 1000, int: true }),
      expiresAt: data?.expiresAt ? new Date(String(data.expiresAt)) : null,
      isPublic: data?.isPublic === undefined ? true : !!data.isPublic,
      active: data?.active === undefined ? true : !!data.active,
    };
    if (clean.expiresAt && Number.isNaN(clean.expiresAt.getTime())) throw new BadRequestException('Invalid expiry date.');
    if (await this.promos.findOne({ where: { code: clean.code } })) throw new BadRequestException('That code already exists.');
    const promo = await this.promos.save(this.promos.create(clean));
    this.emitter.toRoles(ADMIN_ROLES, 'promo:updated', promo);
    return promo;
  }

  async setActive(id: string, active: boolean): Promise<Promo | null> {
    // A store's own coupons are switched by the store (coupons:setActive), not through the platform list.
    const existing = await this.promos.findOne({ where: { id } });
    if (existing?.sellerId) return null;
    await this.promos.update({ id }, { active });
    const promo = await this.promos.findOne({ where: { id } });
    if (promo) this.emitter.toRoles(ADMIN_ROLES, 'promo:updated', promo);
    return promo;
  }

  // ---- Flash sales ----
  /** Names of the stores owning the given ids (a seller id, or an owner's user id on old demo data). */
  private async storeNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (!unique.length || !this.sellers) return out;
    for (const s of await this.sellers.find({ where: [{ id: In(unique) }, { userId: In(unique) }], select: { id: true, userId: true, name: true } })) {
      out.set(s.id, s.name);
      if (s.userId) out.set(s.userId, s.name);
    }
    return out;
  }

  /** Flash sales as served: `title` / `titleFr`, `productName` / `productNameFr` joined from the product, and the live schedule. */
  async presentFlash(rows: FlashSale[], now = Date.now()): Promise<ServedFlashSale[]> {
    if (!rows.length) return [];
    const [texts, names, stores, prices] = await Promise.all([
      this.translations ? this.translations.present('flash_sale', rows) : Promise.resolve(new Map()),
      this.productsSvc ? this.productsSvc.names(rows.map((r) => r.productId)) : Promise.resolve(new Map<string, { name: string; nameFr: string }>()),
      this.storeNames(rows.map((r) => r.sellerId)),
      this.products.find({ where: { id: In(rows.map((r) => r.productId)) }, select: { id: true, price: true } }),
    ]);
    const base = new Map(prices.map((p) => [p.id, p.price]));
    return rows.map((r) => {
      const t = texts.get(r.id);
      const n = names.get(r.productId);
      const from = r.startsAt ? Date.parse(r.startsAt) : NaN;
      const to = r.endsAt ? Date.parse(r.endsAt) : NaN;
      const phase = r.status === 'nominated' || r.status === 'declined' ? 'ended' : flashPhase(r, now);
      return Object.assign(Object.create(Object.getPrototypeOf(r)), r, {
        title: t?.texts.title ?? r.title,
        titleFr: t?.texts.titleFr ?? r.title,
        productName: n?.name ?? '',
        productNameFr: n?.nameFr ?? n?.name ?? '',
        machineTranslated: t?.machineTranslated ?? [],
        translationStatus: t?.translationStatus ?? 'done',
        phase,
        // Over for good: declined, or its end passed / it was ended by hand. A nomination waiting for an answer is not "ended" until its date passes.
        ended: r.status === 'declined' || (r.status === 'nominated' ? Number.isFinite(to) && now >= to : phase === 'ended'),
        // No end date is null, never an empty string.
        endsAt: r.endsAt || null,
        startsInMs: Number.isFinite(from) && from > now ? from - now : null,
        endsInMs: Number.isFinite(to) && to > now ? to - now : null,
        sellerName: r.sellerId ? (stores.get(r.sellerId) ?? null) : null,
        basePrice: base.get(r.productId) ?? null,
      }) as ServedFlashSale;
    });
  }

  /**
   * Shoppers: the sales RUNNING right now (`upcoming: true` adds the ones that start later, each with `phase` and a
   * countdown). `all` (marketing screens): every sale, nominations included, newest first.
   */
  async listFlashSales(all = false, opts: { upcoming?: boolean; now?: number } = {}): Promise<ServedFlashSale[]> {
    const now = opts.now ?? Date.now();
    if (!all) {
      const rows = await this.flashSales.find({ where: { active: true, status: 'approved' } });
      const live = rows.filter((f) => {
        const ph = flashPhase(f, now);
        return ph === 'running' || (opts.upcoming === true && ph === 'scheduled');
      });
      return this.presentFlash(live, now);
    }
    const rows = await this.flashSales.find();
    const stamp = (f: FlashSale) => {
      const t = Date.parse(f.startsAt ?? f.endsAt ?? '');
      return Number.isFinite(t) ? t : (f.createdAt ? f.createdAt.getTime() : 0);
    };
    // Rows come back oldest-first, so reversing first makes ties newest-first.
    return this.presentFlash(rows.reverse().sort((a, b) => stamp(b) - stamp(a)), now);
  }

  /** The sales on one store's products (running, past, and the store's own nominations). */
  async flashSalesOfStore(sellerKeys: string[]): Promise<ServedFlashSale[]> {
    const ids = (await this.products.find({ where: { sellerId: In(sellerKeys) }, select: { id: true } })).map((p) => p.id);
    const rows = await this.flashSales.find({ where: [{ sellerId: In(sellerKeys) }, ...(ids.length ? [{ productId: In(ids) }] : [])] });
    const seen = new Set<string>();
    const unique = rows.filter((r) => !seen.has(r.id) && !!seen.add(r.id));
    return this.presentFlash(unique.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)));
  }

  /** The seller account behind a product (the store row's owner; old demo products hold the user id directly). */
  private async ownerUserId(product: Pick<Product, 'sellerId'>): Promise<string | null> {
    if (!product.sellerId) return null;
    const row = this.sellers ? await this.sellers.findOne({ where: { id: product.sellerId } }) : null;
    return row?.userId ?? (row ? null : product.sellerId);
  }

  private async notifySellers(product: Product, title: string, body: string, saleId: string): Promise<void> {
    try {
      const userId = await this.ownerUserId(product);
      if (userId && this.notifications) await this.notifications.toUser(userId, { title, body, type: 'flash', entityId: saleId });
    } catch {
      /* best effort: the sale itself is already saved */
    }
  }

  /** Tell every screen a sale changed: its own event for shoppers and staff, the product's new price for everyone, the owning store. */
  private async announce(sale: FlashSale, opts: { removed?: boolean; now?: number } = {}): Promise<ServedFlashSale | null> {
    const served = opts.removed ? null : (await this.presentFlash([sale], opts.now))[0];
    if (opts.removed) this.emitter.toRoles(['customer', 'guest', ...ADMIN_ROLES], 'flashsale:removed', { id: sale.id, productId: sale.productId });
    else if (served && (sale.status === 'approved' || sale.status === undefined)) this.emitter.toRoles(['customer', 'guest', ...ADMIN_ROLES], 'flashsale:updated', served);
    else if (served) this.emitter.toRoles(ADMIN_ROLES, 'flashsale:updated', served);
    if (sale.sellerId) {
      const owner = await this.ownerUserId({ sellerId: sale.sellerId } as Product);
      if (owner && served) this.emitter.toUser(owner, 'flashsale:updated', served);
    }
    await this.productsSvc?.republish(sale.productId).catch(() => undefined);
    return served;
  }

  /** Stop a flash sale right now (the end time becomes "now"; prices fall back at once). */
  async endFlashSale(id: string): Promise<ServedFlashSale> {
    const fs = await this.flashSales.findOne({ where: { id } });
    if (!fs) throw new NotFoundException('Flash sale not found.');
    fs.endsAt = new Date().toISOString();
    fs.phase = 'ended';
    const saved = await this.flashSales.save(fs);
    const served = (await this.announce(saved))!;
    const product = await this.products.findOne({ where: { id: saved.productId } });
    if (product) await this.notifySellers(product, 'Flash sale ended', `${served.productName}: the flash sale has ended; the price is back to normal.`, saved.id);
    return served;
  }

  /** Validated, whitelisted fields of a sale (`partial` for an edit). */
  private cleanFlash(data: Record<string, unknown>, partial: boolean) {
    const fields: Partial<FlashSale> = {};
    const has = (k: string) => data?.[k] !== undefined;
    if (!partial || has('flashPrice')) fields.flashPrice = num(data?.flashPrice, 'Flash price', { min: 0.01, max: 1_000_000 });
    if (!partial || has('discount')) fields.discount = num(data?.discount ?? 0, 'Discount', { min: 0, max: 90, int: true });
    if (!partial || has('startsAt')) fields.startsAt = optStr(data?.startsAt, 'Start', 40);
    if (!partial || has('endsAt')) fields.endsAt = optStr(data?.endsAt, 'End', 40);
    for (const k of ['startsAt', 'endsAt'] as const) {
      const v = fields[k];
      if (typeof v === 'string' && !Number.isFinite(Date.parse(v))) throw new BadRequestException(`${k === 'startsAt' ? 'Start' : 'End'} is not a valid date.`);
    }
    if (typeof fields.startsAt === 'string' && typeof fields.endsAt === 'string' && Date.parse(fields.endsAt) <= Date.parse(fields.startsAt)) {
      throw new BadRequestException('The end of a flash sale must be after its start.');
    }
    if (has('active')) fields.active = !!data.active;
    return fields;
  }

  async createFlashSale(data: Record<string, unknown>): Promise<ServedFlashSale> {
    return this.insertFlash(data, { status: 'approved', sellerId: null });
  }

  private async insertFlash(data: Record<string, unknown>, meta: { status: 'approved' | 'nominated'; sellerId: string | null }): Promise<ServedFlashSale> {
    const productId = str(data?.productId, 'Product', { max: 64 });
    const product = await this.products.findOne({ where: { id: productId } });
    if (!product) throw new BadRequestException('That product does not exist.');
    const fields = this.cleanFlash(data, false);
    if (!(fields.flashPrice! < product.price)) {
      throw new BadRequestException(`The flash price must be below the normal price ($${product.price.toFixed(2)}).`);
    }
    // The percent badge follows the prices unless the caller names one.
    if (data?.discount === undefined || data.discount === null || data.discount === '') fields.discount = flashDiscountPct(product.price, fields.flashPrice!);
    const word = (k: string, label: string) => (data?.[k] === undefined ? undefined : data[k] === null || data[k] === '' ? null : str(data[k], label, { max: 150 }));
    const plan = planWrite({
      type: 'flash_sale',
      create: true,
      state: null,
      input: { title: { en: word('title', 'Title'), fr: word('titleFr', 'French title') } },
      clientSourceLang: data?.sourceLang,
      missingTitle: 'Enter a title in English or French.',
    });
    const nominated = meta.status === 'nominated';
    const row = {
      ...fields,
      active: nominated ? false : (fields.active ?? true),
      status: meta.status,
      sellerId: meta.sellerId,
    };
    row.active = nominated ? false : row.active;
    const fs = await this.flashSales.manager.transaction(async (m) => {
      const saved = await m.save(m.create(FlashSale, { ...row, title: plan.base.title ?? '', sourceLang: plan.sourceLang, productId: product.id }));
      if (this.translations) await this.translations.applyPlan(m, 'flash_sale', saved.id, plan, { title: saved.title });
      return saved;
    });
    fs.phase = nominated ? 'scheduled' : flashPhase(fs);
    await this.flashSales.update({ id: fs.id }, { phase: fs.phase });
    await this.translations?.enqueue('flash_sale', fs.id);
    const served = (await this.announce(fs))!;
    if (!nominated) await this.noticeStart(fs, product, served);
    return served;
  }

  /** The owning store hears its product is (or will be) on flash sale. */
  private async noticeStart(fs: FlashSale, product: Product, served: Pick<ServedFlashSale, 'productName'>): Promise<void> {
    const price = fs.flashPrice.toFixed(2);
    if (fs.phase === 'scheduled') {
      await this.notifySellers(product, 'Flash sale scheduled', `${served.productName} goes on flash sale at $${price} from ${when(fs.startsAt)}.`, fs.id);
    } else if (fs.phase === 'running') {
      await this.notifySellers(product, 'Flash sale started', `${served.productName} is now on flash sale at $${price}.`, fs.id);
    }
  }

  /** Marketing edits a sale (price, dates, title, on/off). Shoppers' prices follow at once. */
  async updateFlashSale(id: string, patch: Record<string, unknown>): Promise<ServedFlashSale> {
    const fs = await this.flashSales.findOne({ where: { id } });
    if (!fs) throw new NotFoundException('Flash sale not found.');
    const fields = this.cleanFlash(patch ?? {}, true);
    if (fields.flashPrice !== undefined) {
      const product = await this.products.findOne({ where: { id: fs.productId } });
      if (product && !(fields.flashPrice < product.price)) throw new BadRequestException(`The flash price must be below the normal price ($${product.price.toFixed(2)}).`);
    }
    // A new price without a new percent badge re-derives the badge from the prices.
    if (fields.flashPrice !== undefined && patch.discount === undefined) {
      const product = await this.products.findOne({ where: { id: fs.productId } });
      if (product) fields.discount = flashDiscountPct(product.price, fields.flashPrice);
    }
    const next = { ...fs, ...fields };
    if (typeof next.startsAt === 'string' && typeof next.endsAt === 'string' && Date.parse(next.endsAt) <= Date.parse(next.startsAt)) {
      throw new BadRequestException('The end of a flash sale must be after its start.');
    }
    Object.assign(fs, fields);
    const wordsSent = patch.title !== undefined || patch.titleFr !== undefined;
    if (wordsSent) {
      const t = (k: string) => (patch[k] === undefined ? undefined : patch[k] === null || patch[k] === '' ? null : str(patch[k], 'Title', { max: 150 }));
      const plan = planWrite({
        type: 'flash_sale',
        create: false,
        state: { sourceLang: fs.sourceLang === 'fr' ? 'fr' : 'en', base: { title: fs.title }, authors: {} },
        input: { title: { en: t('title'), fr: t('titleFr') } },
        missingTitle: 'Enter a title in English or French.',
      });
      if (typeof plan.base.title === 'string') fs.title = plan.base.title;
      if (plan.flipped) fs.sourceLang = plan.sourceLang;
      if (this.translations) {
        await this.flashSales.manager.transaction(async (m) => {
          await m.save(fs);
          await this.translations!.applyPlan(m, 'flash_sale', fs.id, plan, { title: fs.title });
        });
        if (plan.touched || plan.flipped) await this.translations.enqueue('flash_sale', fs.id);
      } else await this.flashSales.save(fs);
    } else await this.flashSales.save(fs);
    fs.phase = flashPhase(fs);
    await this.flashSales.update({ id }, { phase: fs.phase });
    return (await this.announce(fs))!;
  }

  /** Marketing deletes a sale; the price goes back to normal at once. */
  async deleteFlashSale(id: string): Promise<{ id: string }> {
    const fs = await this.flashSales.findOne({ where: { id } });
    if (!fs) throw new NotFoundException('Flash sale not found.');
    await this.flashSales.delete({ id });
    await this.announce(fs, { removed: true });
    return { id };
  }

  /** A store proposes a flash sale on one of ITS products. It waits for marketing and changes no price until approved. */
  async nominate(seller: Pick<Seller, 'id' | 'userId' | 'name'>, data: Record<string, unknown>): Promise<ServedFlashSale> {
    const productId = str(data?.productId, 'Product', { max: 64 });
    const product = await this.products.findOne({ where: { id: productId } });
    if (!product || (product.sellerId !== seller.id && product.sellerId !== seller.userId)) throw new BadRequestException('You can only propose a flash sale on your own products.');
    if (product.status !== 'live') throw new BadRequestException('Only a live product can go on flash sale.');
    const open = await this.flashSales.count({ where: { productId, status: 'nominated' } });
    if (open) throw new BadRequestException('You already proposed a flash sale for this product: wait for marketing to answer.');
    if (!data?.endsAt) throw new BadRequestException('Give the date the flash sale ends.');
    // A nomination needs no title of its own: it is named after the product until marketing renames it.
    const titled = data?.title || data?.titleFr ? data : { ...data, title: (await this.productsSvc?.names([productId]))?.get(productId)?.name ?? product.name };
    const served = await this.insertFlash({ ...titled, active: false }, { status: 'nominated', sellerId: seller.id });
    await this.notifications?.toRole('admin_marketing', {
      title: 'Flash sale nominated',
      body: `${seller.name} proposes ${served.productName} at $${served.flashPrice.toFixed(2)}.`,
      type: 'flash',
      entityId: served.id,
    });
    return served;
  }

  /** Marketing answers a nomination. Approving turns the sale on (its dates decide when prices change). */
  async decide(id: string, approve: boolean, reasonRaw?: unknown): Promise<ServedFlashSale> {
    const fs = await this.flashSales.findOne({ where: { id } });
    if (!fs) throw new NotFoundException('Flash sale not found.');
    if (fs.status !== 'nominated') throw new BadRequestException('This flash sale is not waiting for a decision.');
    const reason = typeof reasonRaw === 'string' ? reasonRaw.trim().slice(0, 300) : '';
    if (!approve && reason.length < 3) throw new BadRequestException('Give the seller a reason for declining (at least 3 characters).');
    const product = await this.products.findOne({ where: { id: fs.productId } });
    if (approve) {
      if (product && !(fs.flashPrice < product.price)) throw new BadRequestException(`The flash price must be below the normal price ($${product.price.toFixed(2)}).`);
      if (fs.endsAt && Date.parse(fs.endsAt) <= Date.now()) throw new BadRequestException('The end date of this flash sale has already passed.');
    }
    const claim = await this.flashSales
      .createQueryBuilder()
      .update(FlashSale)
      .set(approve ? { status: 'approved', active: true, rejectReason: null } : { status: 'declined', active: false, rejectReason: reason })
      .where("id = :id AND status = 'nominated'", { id })
      .execute();
    if (!claim.affected) throw new BadRequestException('This flash sale was just decided. Refresh and try again.');
    const saved = (await this.flashSales.findOne({ where: { id } }))!;
    saved.phase = flashPhase(saved);
    await this.flashSales.update({ id }, { phase: saved.phase });
    const served = (await this.announce(saved))!;
    if (product) {
      await this.notifySellers(
        product,
        approve ? 'Flash sale approved' : 'Flash sale declined',
        approve ? `Your flash sale for ${served.productName} was approved.` : `Your flash sale for ${served.productName} was declined: ${reason}`,
        saved.id,
      );
      if (approve) await this.noticeStart(saved, product, served);
    }
    return served;
  }

  /**
   * Move every approved sale along its dates: announce a sale that has just started or ended (shoppers' prices flip
   * live) and tell the store. Each move is claimed with a conditional update, so two API instances announce it once.
   */
  async sweepFlash(now = Date.now()): Promise<number> {
    let moved = 0;
    const rows = await this.flashSales.find({ where: { status: 'approved' } });
    for (const f of rows) {
      const next = flashPhase(f, now);
      if (next === f.phase) continue;
      const claim = await this.flashSales.createQueryBuilder().update(FlashSale).set({ phase: next }).where('id = :id AND phase = :from', { id: f.id, from: f.phase }).execute();
      if (!claim.affected) continue;
      moved++;
      f.phase = next;
      const served = (await this.announce(f, { now }))!;
      const product = await this.products.findOne({ where: { id: f.productId } });
      if (!product) continue;
      // A sweep that runs long after the date (the API was down) does not tell sellers about something old.
      const fresh = (iso: string | null, fallback?: Date) => {
        const t = iso ? Date.parse(iso) : fallback?.getTime();
        return !t || !Number.isFinite(t) || now - t < STALE_MS;
      };
      if (next === 'running' && fresh(f.startsAt, f.createdAt)) await this.notifySellers(product, 'Flash sale started', `${served.productName} is now on flash sale at $${f.flashPrice.toFixed(2)}.`, f.id);
      else if (next === 'ended' && fresh(f.endsAt)) await this.notifySellers(product, 'Flash sale ended', `${served.productName}: the flash sale has ended; the price is back to normal.`, f.id);
    }
    return moved;
  }
}
