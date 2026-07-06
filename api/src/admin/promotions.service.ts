import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Promotion } from '../entities/promotion.entity';
import { PromotionStatus } from '../common/enums';
import { AuthUser } from '../common/decorators';
import { AuditService } from './audit.service';
import { CreatePromotionDto, UpdatePromotionDto } from './dto';

@Injectable()
export class PromotionsService {
  constructor(
    @InjectRepository(Promotion) private readonly promotions: Repository<Promotion>,
    private readonly audit: AuditService,
  ) {}

  private computeStatus(startsAt: Date, endsAt: Date): PromotionStatus {
    const now = Date.now();
    if (now < startsAt.getTime()) return PromotionStatus.SCHEDULED;
    if (now > endsAt.getTime()) return PromotionStatus.ENDED;
    return PromotionStatus.ACTIVE;
  }

  list() {
    return this.promotions.find({
      where: { seller: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  async get(id: string) {
    const promo = await this.promotions.findOne({ where: { id } });
    if (!promo) throw new NotFoundException('Promotion not found');
    return promo;
  }

  async create(dto: CreatePromotionDto, user: AuthUser) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    const promo = this.promotions.create({
      seller: undefined,
      title: dto.title,
      type: dto.type,
      value: dto.value,
      productIds: dto.productIds,
      bannerUrl: dto.bannerUrl,
      startsAt,
      endsAt,
      status: this.computeStatus(startsAt, endsAt),
    });
    const saved = await this.promotions.save(promo);
    await this.audit.log(user, 'promotion.create', 'Promotion', saved.id, dto.title);
    return saved;
  }

  async update(id: string, dto: UpdatePromotionDto, user: AuthUser) {
    const promo = await this.get(id);
    if (dto.title !== undefined) promo.title = dto.title;
    if (dto.type !== undefined) promo.type = dto.type;
    if (dto.value !== undefined) promo.value = dto.value;
    if (dto.productIds !== undefined) promo.productIds = dto.productIds;
    if (dto.bannerUrl !== undefined) promo.bannerUrl = dto.bannerUrl;
    if (dto.startsAt !== undefined) promo.startsAt = new Date(dto.startsAt);
    if (dto.endsAt !== undefined) promo.endsAt = new Date(dto.endsAt);
    promo.status = this.computeStatus(promo.startsAt, promo.endsAt);
    const saved = await this.promotions.save(promo);
    await this.audit.log(user, 'promotion.update', 'Promotion', id, JSON.stringify(dto));
    return saved;
  }

  async remove(id: string, user: AuthUser) {
    const promo = await this.get(id);
    await this.promotions.remove(promo);
    await this.audit.log(user, 'promotion.delete', 'Promotion', id);
    return { deleted: true, id };
  }
}
