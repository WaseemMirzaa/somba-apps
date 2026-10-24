import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FlashSale, Order, Product, Promo } from '../database/entities';
import { num, oneOf, optStr, str } from '../common/validate';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';
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
};

/** A percent coupon's discount in USD, rounded to the cent (never to whole dollars). */
export function percentDiscount(subtotalUsd: number, percent: number): number {
  return Math.round(Number((subtotalUsd * percent).toFixed(6))) / 100;
}

@Injectable()
export class PromosService {
  constructor(
    @InjectRepository(Promo) private readonly promos: Repository<Promo>,
    @InjectRepository(FlashSale)
    private readonly flashSales: Repository<FlashSale>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly emitter: RealtimeEmitter,
    private readonly productsSvc?: ProductsService,
    private readonly translations?: TranslationService,
  ) {
    // A machine finished a flash sale's other language: tell the same rooms as any flash-sale change.
    this.translations?.registerRepublisher('flash_sale', async (id) => {
      const fs = await this.flashSales.findOne({ where: { id } });
      if (fs) this.emitter.toRoles(['customer', ...ADMIN_ROLES], 'flashsale:updated', (await this.presentFlash([fs]))[0]);
    });
  }

  /** Admins see every code; shoppers only active, public, unexpired ones (no internals). */
  async list(admin: boolean): Promise<Partial<Promo>[]> {
    const rows = await this.promos.find();
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

  /** Validate a code against a subtotal for a customer; returns the computed discount. */
  async validate(
    code: string,
    subtotalUsd: number,
    userId?: string,
  ): Promise<{ ok: boolean; discount: number; code?: string; reason?: string }> {
    const promo = await this.promos.findOne({ where: { code: String(code ?? '').trim().toUpperCase() } });
    if (!promo || !promo.active) return { ok: false, discount: 0, reason: 'Invalid code.' };
    if (promo.expiresAt && new Date(promo.expiresAt).getTime() <= Date.now()) {
      return { ok: false, discount: 0, reason: 'This code has expired.' };
    }
    if (!(Number(subtotalUsd) > 0) || subtotalUsd < promo.minOrder) {
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
        ? Math.min(percentDiscount(subtotalUsd, promo.value), subtotalUsd)
        : Math.min(promo.value, subtotalUsd);
    return { ok: true, discount, code: promo.code };
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
    await this.promos.update({ id }, { active });
    const promo = await this.promos.findOne({ where: { id } });
    if (promo) this.emitter.toRoles(ADMIN_ROLES, 'promo:updated', promo);
    return promo;
  }

  // ---- Flash sales ----
  /** Flash sales as served: `title` / `titleFr`, and `productName` / `productNameFr` joined from the product. */
  async presentFlash(rows: FlashSale[]): Promise<ServedFlashSale[]> {
    if (!rows.length) return [];
    const [texts, names] = await Promise.all([
      this.translations ? this.translations.present('flash_sale', rows) : Promise.resolve(new Map()),
      this.productsSvc ? this.productsSvc.names(rows.map((r) => r.productId)) : Promise.resolve(new Map<string, { name: string; nameFr: string }>()),
    ]);
    return rows.map((r) => {
      const t = texts.get(r.id);
      const n = names.get(r.productId);
      return Object.assign(Object.create(Object.getPrototypeOf(r)), r, {
        title: t?.texts.title ?? r.title,
        titleFr: t?.texts.titleFr ?? r.title,
        productName: n?.name ?? '',
        productNameFr: n?.nameFr ?? n?.name ?? '',
        machineTranslated: t?.machineTranslated ?? [],
        translationStatus: t?.translationStatus ?? 'done',
      }) as ServedFlashSale;
    });
  }

  /**
   * Shoppers: the flagged-active sales. `all` (marketing screens): every sale —
   * running, scheduled and ended — newest first (by start, else by creation order).
   */
  async listFlashSales(all = false): Promise<ServedFlashSale[]> {
    if (!all) return this.presentFlash(await this.flashSales.find({ where: { active: true } }));
    const rows = await this.flashSales.find();
    const stamp = (f: FlashSale) => {
      const t = Date.parse(f.startsAt ?? f.endsAt ?? '');
      return Number.isFinite(t) ? t : 0;
    };
    // Rows come back oldest-first, so reversing first makes ties newest-first.
    return this.presentFlash(rows.reverse().sort((a, b) => stamp(b) - stamp(a)));
  }

  /** Stop a flash sale right now (the end time becomes "now"; prices fall back at once). */
  async endFlashSale(id: string): Promise<ServedFlashSale> {
    const fs = await this.flashSales.findOne({ where: { id } });
    if (!fs) throw new NotFoundException('Flash sale not found.');
    fs.endsAt = new Date().toISOString();
    const saved = (await this.presentFlash([await this.flashSales.save(fs)]))[0];
    this.emitter.toRoles(['customer', ...ADMIN_ROLES], 'flashsale:updated', saved);
    return saved;
  }

  async createFlashSale(data: Record<string, unknown>): Promise<ServedFlashSale> {
    const productId = str(data?.productId, 'Product', { max: 64 });
    const product = await this.products.findOne({ where: { id: productId } });
    if (!product) throw new BadRequestException('That product does not exist.');
    const flashPrice = num(data?.flashPrice, 'Flash price', { min: 0.01, max: 1_000_000 });
    if (!(flashPrice < product.price)) {
      throw new BadRequestException(`The flash price must be below the normal price ($${product.price.toFixed(2)}).`);
    }
    const word = (k: string, label: string) => (data?.[k] === undefined ? undefined : data[k] === null || data[k] === '' ? null : str(data[k], label, { max: 150 }));
    const plan = planWrite({
      type: 'flash_sale',
      create: true,
      state: null,
      input: { title: { en: word('title', 'Title'), fr: word('titleFr', 'French title') } },
      clientSourceLang: data?.sourceLang,
      missingTitle: 'Enter a title in English or French.',
    });
    const fields = {
      discount: num(data?.discount ?? 0, 'Discount', { min: 0, max: 90, int: true }),
      startsAt: optStr(data?.startsAt, 'Start', 40),
      endsAt: optStr(data?.endsAt, 'End', 40),
      active: data?.active === undefined ? true : !!data.active,
    };
    const fs = await this.flashSales.manager.transaction(async (m) => {
      const row = await m.save(m.create(FlashSale, { ...fields, title: plan.base.title ?? '', sourceLang: plan.sourceLang, productId: product.id, flashPrice }));
      if (this.translations) await this.translations.applyPlan(m, 'flash_sale', row.id, plan, { title: row.title });
      return row;
    });
    await this.translations?.enqueue('flash_sale', fs.id);
    const served = (await this.presentFlash([fs]))[0];
    this.emitter.toRoles(['customer', ...ADMIN_ROLES], 'flashsale:updated', served);
    return served;
  }
}
