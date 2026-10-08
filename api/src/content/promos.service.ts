import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FlashSale, Order, Promo } from '../database/entities';
import { num, oneOf, optStr, str } from '../common/validate';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';

@Injectable()
export class PromosService {
  constructor(
    @InjectRepository(Promo) private readonly promos: Repository<Promo>,
    @InjectRepository(FlashSale)
    private readonly flashSales: Repository<FlashSale>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly emitter: RealtimeEmitter,
  ) {}

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
        ? Math.round(subtotalUsd * (promo.value / 100))
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
  listFlashSales(): Promise<FlashSale[]> {
    return this.flashSales.find({ where: { active: true } });
  }

  async createFlashSale(data: Record<string, unknown>): Promise<FlashSale> {
    const fs = await this.flashSales.save(
      this.flashSales.create({
        title: str(data?.title, 'Title', { max: 150 }),
        productId: str(data?.productId, 'Product', { max: 64 }),
        productName: str(data?.productName, 'Product name', { max: 200 }),
        flashPrice: num(data?.flashPrice, 'Flash price', { min: 0.01, max: 1_000_000 }),
        discount: num(data?.discount ?? 0, 'Discount', { min: 0, max: 90, int: true }),
        startsAt: optStr(data?.startsAt, 'Start', 40),
        endsAt: optStr(data?.endsAt, 'End', 40),
        active: data?.active === undefined ? true : !!data.active,
      }),
    );
    this.emitter.toRoles(['customer', ...ADMIN_ROLES], 'flashsale:updated', fs);
    return fs;
  }
}
