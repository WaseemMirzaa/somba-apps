import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Seller } from '../entities/seller.entity';
import { Product } from '../entities/product.entity';
import { Promotion } from '../entities/promotion.entity';
import { UpdateProfileDto } from './dto';

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Promotion)
    private readonly promotions: Repository<Promotion>,
  ) {}

  private requireSeller(sellerId?: string): string {
    if (!sellerId) throw new ForbiddenException('No seller profile');
    return sellerId;
  }

  private async getSeller(id: string): Promise<Seller> {
    const seller = await this.sellers.findOne({ where: { id } });
    if (!seller) throw new NotFoundException('Seller not found');
    return seller;
  }

  async get(sellerId: string | undefined) {
    const id = this.requireSeller(sellerId);
    const seller = await this.getSeller(id);
    const [productCount, promotionCount] = await Promise.all([
      this.products.count({ where: { seller: { id } } }),
      this.promotions.count({ where: { seller: { id } } }),
    ]);
    return { ...seller, productCount, promotionCount };
  }

  async update(sellerId: string | undefined, dto: UpdateProfileDto) {
    const id = this.requireSeller(sellerId);
    const seller = await this.getSeller(id);

    if (dto.storeName !== undefined) seller.storeName = dto.storeName;
    if (dto.description !== undefined) seller.description = dto.description;
    if (dto.city !== undefined) seller.city = dto.city;
    if (dto.phone !== undefined) seller.phone = dto.phone;
    if (dto.logoUrl !== undefined) seller.logoUrl = dto.logoUrl;

    return this.sellers.save(seller);
  }
}
