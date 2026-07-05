import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Coupon } from '../entities/coupon.entity';
import { round2 } from '../common/util';

@Injectable()
export class CouponsService {
  constructor(@InjectRepository(Coupon) private readonly coupons: Repository<Coupon>) {}

  list() {
    return this.coupons.find({ where: { active: true }, order: { minOrderUsd: 'ASC' } });
  }

  private discountFor(c: Coupon, subtotal: number): number {
    if (subtotal < Number(c.minOrderUsd)) return 0;
    if (c.percentOff != null) return round2((subtotal * Number(c.percentOff)) / 100);
    if (c.amountOffUsd != null) return round2(Number(c.amountOffUsd));
    return 0;
  }

  async find(code: string) {
    return this.coupons.findOne({ where: { code: code.trim().toUpperCase(), active: true } });
  }

  async validate(code: string, subtotal: number) {
    const coupon = await this.find(code);
    if (!coupon) throw new BadRequestException('Invalid promo code');
    if (subtotal < Number(coupon.minOrderUsd)) {
      throw new BadRequestException(
        `Minimum order of $${Number(coupon.minOrderUsd).toFixed(0)} not met`,
      );
    }
    return { coupon, discount: this.discountFor(coupon, subtotal), valid: true };
  }
}
