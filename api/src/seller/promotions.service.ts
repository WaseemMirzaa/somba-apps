import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Promotion } from '../entities/promotion.entity';
import { PromotionStatus } from '../common/enums';
import { CreatePromotionDto, UpdatePromotionDto } from './dto';

@Injectable()
export class PromotionsService {
  constructor(
    @InjectRepository(Promotion)
    private readonly promotions: Repository<Promotion>,
  ) {}

  private requireSeller(sellerId?: string): string {
    if (!sellerId) throw new ForbiddenException('No seller profile');
    return sellerId;
  }

  private computeStatus(startsAt: Date, endsAt: Date): PromotionStatus {
    const now = Date.now();
    if (now < startsAt.getTime()) return PromotionStatus.SCHEDULED;
    if (now > endsAt.getTime()) return PromotionStatus.ENDED;
    return PromotionStatus.ACTIVE;
  }

  list(sellerId: string | undefined) {
    const id = this.requireSeller(sellerId);
    return this.promotions.find({
      where: { seller: { id } },
      order: { createdAt: 'DESC' },
    });
  }

  private async findOwned(sellerId: string, id: string): Promise<Promotion> {
    const promo = await this.promotions.findOne({ where: { id } });
    if (!promo) throw new NotFoundException('Promotion not found');
    if (promo.seller?.id !== sellerId) {
      throw new ForbiddenException('Not your promotion');
    }
    return promo;
  }

  get(sellerId: string | undefined, id: string) {
    return this.findOwned(this.requireSeller(sellerId), id);
  }

  create(sellerId: string | undefined, dto: CreatePromotionDto) {
    const id = this.requireSeller(sellerId);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);

    const promo = this.promotions.create({
      seller: { id } as any,
      title: dto.title,
      type: dto.type,
      value: dto.value,
      productIds: dto.productIds,
      bannerUrl: dto.bannerUrl,
      startsAt,
      endsAt,
      status: this.computeStatus(startsAt, endsAt),
    });

    return this.promotions.save(promo);
  }

  async update(
    sellerId: string | undefined,
    id: string,
    dto: UpdatePromotionDto,
  ) {
    const promo = await this.findOwned(this.requireSeller(sellerId), id);

    if (dto.title !== undefined) promo.title = dto.title;
    if (dto.type !== undefined) promo.type = dto.type;
    if (dto.value !== undefined) promo.value = dto.value;
    if (dto.productIds !== undefined) promo.productIds = dto.productIds;
    if (dto.bannerUrl !== undefined) promo.bannerUrl = dto.bannerUrl;
    if (dto.startsAt !== undefined) promo.startsAt = new Date(dto.startsAt);
    if (dto.endsAt !== undefined) promo.endsAt = new Date(dto.endsAt);

    promo.status = this.computeStatus(promo.startsAt, promo.endsAt);

    return this.promotions.save(promo);
  }

  async remove(sellerId: string | undefined, id: string) {
    const promo = await this.findOwned(this.requireSeller(sellerId), id);
    await this.promotions.remove(promo);
    return { deleted: true };
  }
}
