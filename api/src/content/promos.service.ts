import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FlashSale, Promo } from '../database/entities';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';

@Injectable()
export class PromosService {
  constructor(
    @InjectRepository(Promo) private readonly promos: Repository<Promo>,
    @InjectRepository(FlashSale)
    private readonly flashSales: Repository<FlashSale>,
    private readonly emitter: RealtimeEmitter,
  ) {}

  list(): Promise<Promo[]> {
    return this.promos.find();
  }

  /** Validate a code against a subtotal; returns the computed discount. */
  async validate(
    code: string,
    subtotalUsd: number,
  ): Promise<{ ok: boolean; discount: number; code?: string; reason?: string }> {
    const promo = await this.promos.findOne({
      where: { code: code.toUpperCase() },
    });
    if (!promo || !promo.active) return { ok: false, discount: 0, reason: 'Invalid code.' };
    if (subtotalUsd < promo.minOrder) {
      return { ok: false, discount: 0, reason: `Minimum order $${promo.minOrder}.` };
    }
    const discount =
      promo.type === 'percent'
        ? Math.round(subtotalUsd * (promo.value / 100))
        : promo.value;
    return { ok: true, discount, code: promo.code };
  }

  async create(data: Partial<Promo>): Promise<Promo> {
    if (!data.code || data.value == null) {
      throw new BadRequestException('code and value are required.');
    }
    const promo = await this.promos.save(
      this.promos.create({ ...data, code: data.code.toUpperCase() }),
    );
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

  async createFlashSale(data: Partial<FlashSale>): Promise<FlashSale> {
    const fs = await this.flashSales.save(this.flashSales.create(data));
    this.emitter.toRoles(['customer', ...ADMIN_ROLES], 'flashsale:updated', fs);
    return fs;
  }
}
