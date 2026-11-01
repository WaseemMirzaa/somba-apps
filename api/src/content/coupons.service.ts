import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Order, Promo, Seller } from '../database/entities';
import { num, oneOf, optStr, str } from '../common/validate';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';

/** A store may hold this many coupons at once (active or not). */
export const MAX_COUPONS_PER_STORE = 50;

/** The owning seller's coupon list follows its use count within this long (a burst of orders makes one push; 0 = at once). */
const USAGE_PUSH_MS = () => Number(process.env.COUPON_USAGE_PUSH_MS ?? 2000);

/** A store coupon as its owner sees it: the code's settings and how often it was used. */
export type ServedCoupon = Promo & { uses: number };

/**
 * Coupons issued by a seller for their own products. They live in the same table as platform promo codes
 * (`promos.sellerId` is set), so `orders:create` validates both with one code field; the difference is that a
 * store coupon discounts only that store's lines and comes off that store's earnings.
 */
@Injectable()
export class CouponsService {
  constructor(
    @InjectRepository(Promo) private readonly promos: Repository<Promo>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    private readonly emitter: RealtimeEmitter,
  ) {}

  private async withUses(rows: Promo[]): Promise<ServedCoupon[]> {
    if (!rows.length) return [];
    const counts = await this.orders
      .createQueryBuilder('o')
      .select('o.promoCode', 'code')
      .addSelect('COUNT(*)', 'n')
      .where("o.promoCode IN (:...codes) AND o.status != 'cancelled'", { codes: rows.map((r) => r.code) })
      .groupBy('o.promoCode')
      .getRawMany<{ code: string; n: string }>();
    const by = new Map(counts.map((c) => [c.code, Number(c.n)]));
    return rows.map((r) => Object.assign(Object.create(Object.getPrototypeOf(r)), r, { uses: by.get(r.code) ?? 0 }) as ServedCoupon);
  }

  /** The store a seller account runs (coupons are owned by the store row, not the login). */
  private async storeOf(userId: string): Promise<Seller> {
    const seller = await this.sellers.findOne({ where: { userId } });
    if (!seller) throw new BadRequestException('Open a store first.');
    return seller;
  }

  /** A seller: their own coupons. Admins with the content permission: every store's (`sellerId` narrows it). */
  async list(user: { id: string; role: string }, sellerId?: string): Promise<ServedCoupon[]> {
    if (user.role === 'seller') {
      const seller = await this.sellers.findOne({ where: { userId: user.id } });
      if (!seller) return [];
      return this.withUses(await this.promos.find({ where: { sellerId: seller.id }, order: { code: 'ASC' } }));
    }
    const rows = await this.promos.find({ where: sellerId ? { sellerId } : {}, order: { code: 'ASC' } });
    return this.withUses(rows.filter((r) => !!r.sellerId));
  }

  /** What a shopper may see on a store page: the store's active, public, unexpired coupons (no internals). */
  async publicOf(sellerId: string): Promise<Partial<Promo>[]> {
    const store = await this.sellers.findOne({ where: [{ id: sellerId }, { userId: sellerId }] });
    if (!store || store.status !== 'approved') return [];
    const now = Date.now();
    return (await this.promos.find({ where: { sellerId: store.id } }))
      .filter((p) => p.active && p.isPublic && (!p.expiresAt || new Date(p.expiresAt).getTime() > now))
      .map((p) => ({ code: p.code, type: p.type, value: p.value, minOrder: p.minOrder, description: p.description, sellerId: store.id }));
  }

  async create(userId: string, data: Record<string, unknown>): Promise<ServedCoupon> {
    const seller = await this.storeOf(userId);
    if (seller.status !== 'approved') throw new BadRequestException('Your store must be approved before you can issue coupons.');
    if ((await this.promos.count({ where: { sellerId: seller.id } })) >= MAX_COUPONS_PER_STORE) {
      throw new BadRequestException(`A store can hold ${MAX_COUPONS_PER_STORE} coupons: delete one you no longer use.`);
    }
    const type = oneOf(data?.type ?? 'percent', ['percent', 'fixed'] as const, 'Type');
    const clean: Partial<Promo> = {
      code: str(data?.code, 'Code', { min: 3, max: 40 }).toUpperCase(),
      type,
      value: type === 'percent' ? num(data?.value, 'Discount', { min: 1, max: 90 }) : num(data?.value, 'Discount', { min: 0.01, max: 500 }),
      minOrder: num(data?.minOrder ?? 0, 'Minimum order', { min: 0, max: 100000 }),
      description: optStr(data?.description, 'Description', 200),
      maxUses: data?.maxUses == null || data.maxUses === '' ? null : num(data.maxUses, 'Max uses', { min: 1, max: 10_000_000, int: true }),
      perUserLimit: data?.perUserLimit == null || data.perUserLimit === '' ? null : num(data.perUserLimit, 'Per-customer limit', { min: 1, max: 1000, int: true }),
      expiresAt: data?.expiresAt ? new Date(String(data.expiresAt)) : null,
      isPublic: data?.isPublic === undefined ? true : !!data.isPublic,
      active: data?.active === undefined ? true : !!data.active,
      sellerId: seller.id,
    };
    if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(clean.code!)) throw new BadRequestException('A code can use letters, numbers, - and _.');
    if (clean.expiresAt && Number.isNaN(clean.expiresAt.getTime())) throw new BadRequestException('Invalid expiry date.');
    if (clean.expiresAt && clean.expiresAt.getTime() <= Date.now()) throw new BadRequestException('The expiry date must be in the future.');
    if (await this.promos.findOne({ where: { code: clean.code } })) throw new BadRequestException('That code already exists.');
    const promo = await this.promos.save(this.promos.create(clean));
    const served = (await this.withUses([promo]))[0];
    this.publish(seller, served);
    return served;
  }

  /** The owner changes a coupon. Its code and kind stay; the amount, limits, expiry and visibility can move. */
  async update(userId: string, id: string, patch: Record<string, unknown>): Promise<ServedCoupon> {
    const seller = await this.storeOf(userId);
    const promo = await this.promos.findOne({ where: { id, sellerId: seller.id } });
    if (!promo) throw new NotFoundException('Coupon not found.');
    const has = (k: string) => patch?.[k] !== undefined;
    if (has('value')) promo.value = promo.type === 'percent' ? num(patch.value, 'Discount', { min: 1, max: 90 }) : num(patch.value, 'Discount', { min: 0.01, max: 500 });
    if (has('minOrder')) promo.minOrder = num(patch.minOrder, 'Minimum order', { min: 0, max: 100000 });
    if (has('description')) promo.description = optStr(patch.description, 'Description', 200);
    if (has('maxUses')) promo.maxUses = patch.maxUses == null || patch.maxUses === '' ? null : num(patch.maxUses, 'Max uses', { min: 1, max: 10_000_000, int: true });
    if (has('perUserLimit')) promo.perUserLimit = patch.perUserLimit == null || patch.perUserLimit === '' ? null : num(patch.perUserLimit, 'Per-customer limit', { min: 1, max: 1000, int: true });
    if (has('expiresAt')) {
      promo.expiresAt = patch.expiresAt ? new Date(String(patch.expiresAt)) : null;
      if (promo.expiresAt && Number.isNaN(promo.expiresAt.getTime())) throw new BadRequestException('Invalid expiry date.');
    }
    if (has('isPublic')) promo.isPublic = !!patch.isPublic;
    if (has('active')) promo.active = !!patch.active;
    const saved = await this.promos.save(promo);
    const served = (await this.withUses([saved]))[0];
    this.publish(seller, served);
    return served;
  }

  async setActive(userId: string, id: string, active: boolean): Promise<ServedCoupon> {
    return this.update(userId, id, { active });
  }

  /** Removes a coupon nobody used. One that already discounted an order is switched off instead (history keeps its code). */
  async remove(userId: string, id: string): Promise<{ id: string; deleted: boolean; coupon?: ServedCoupon }> {
    const seller = await this.storeOf(userId);
    const promo = await this.promos.findOne({ where: { id, sellerId: seller.id } });
    if (!promo) throw new NotFoundException('Coupon not found.');
    const used = await this.orders.count({ where: { promoCode: promo.code } });
    if (used > 0) {
      promo.active = false;
      const coupon = (await this.withUses([await this.promos.save(promo)]))[0];
      this.publish(seller, coupon);
      return { id, deleted: false, coupon };
    }
    await this.promos.delete({ id });
    this.emitter.toUser(userId, 'coupon:removed', { id });
    this.emitter.toRoles(ADMIN_ROLES, 'coupon:removed', { id, sellerId: seller.id });
    return { id, deleted: true };
  }

  private readonly usageDirty = new Set<string>();
  private usageTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * An order started or stopped using `code` (placed with it, or cancelled): the coupon's use count moved. Tell its
   * seller (`coupon:updated`), at most once per window however many orders came in. Platform promo codes have no seller
   * and are ignored.
   */
  usageChanged(code: string | null | undefined): void {
    const c = String(code ?? '').trim();
    if (!c) return;
    this.usageDirty.add(c);
    if (this.usageTimer) return;
    const wait = USAGE_PUSH_MS();
    if (wait <= 0) {
      void this.flushUsagePushes();
      return;
    }
    this.usageTimer = setTimeout(() => void this.flushUsagePushes(), wait);
    this.usageTimer.unref();
  }

  /** Send the pending use-count pushes now (the throttle's timer calls this; tests call it too). */
  async flushUsagePushes(): Promise<void> {
    if (this.usageTimer) clearTimeout(this.usageTimer);
    this.usageTimer = null;
    const codes = [...this.usageDirty];
    this.usageDirty.clear();
    if (!codes.length) return;
    try {
      const promos = (await this.promos.find({ where: { code: In(codes) } })).filter((p) => !!p.sellerId);
      for (const promo of promos) {
        const seller = await this.sellers.findOne({ where: { id: promo.sellerId as string } });
        if (!seller) continue;
        const [coupon] = await this.withUses([promo]);
        this.publish(seller, coupon);
      }
    } catch {
      // The push is a courtesy: the count is in the database either way.
    }
  }

  private publish(seller: Seller, coupon: ServedCoupon): void {
    if (seller.userId) this.emitter.toUser(seller.userId, 'coupon:updated', coupon);
    this.emitter.toRoles(ADMIN_ROLES, 'coupon:updated', coupon);
  }

  /** Store coupons of several stores (for the admin marketing list). */
  async ofStores(ids: string[]): Promise<Promo[]> {
    return ids.length ? this.promos.find({ where: { sellerId: In(ids) } }) : [];
  }
}
