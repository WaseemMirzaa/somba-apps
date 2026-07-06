import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Seller } from '../entities/seller.entity';
import { Product } from '../entities/product.entity';
import { OrderItem } from '../entities/order-item.entity';
import { SellerStatus } from '../common/enums';
import { AuthUser } from '../common/decorators';
import { AuditService } from './audit.service';
import { UpdateSellerDto } from './dto';

@Injectable()
export class SellersService {
  constructor(
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(OrderItem) private readonly items: Repository<OrderItem>,
    private readonly audit: AuditService,
  ) {}

  private async counts(sellerId: string) {
    const productCount = await this.products.count({
      where: { seller: { id: sellerId } },
    });
    const orderCount = await this.items
      .createQueryBuilder('i')
      .leftJoin('i.seller', 's')
      .leftJoin('i.order', 'o')
      .where('s.id = :sellerId', { sellerId })
      .select('COUNT(DISTINCT o.id)', 'count')
      .getRawOne<{ count: string }>();
    return {
      productCount,
      orderCount: parseInt(orderCount?.count ?? '0', 10),
    };
  }

  async list(opts: { status?: SellerStatus; q?: string }) {
    const qb = this.sellers
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.user', 'u')
      .orderBy('s.createdAt', 'DESC');

    if (opts.status) qb.andWhere('s.status = :status', { status: opts.status });
    if (opts.q) {
      qb.andWhere('(s.storeName LIKE :q OR s.slug LIKE :q)', { q: `%${opts.q}%` });
    }

    const rows = await qb.getMany();
    return Promise.all(
      rows.map(async (s) => ({ ...s, ...(await this.counts(s.id)) })),
    );
  }

  async get(id: string) {
    const seller = await this.sellers.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!seller) throw new NotFoundException('Seller not found');
    const recentProducts = await this.products.find({
      where: { seller: { id } },
      order: { createdAt: 'DESC' },
      take: 8,
    });
    return { ...seller, ...(await this.counts(id)), recentProducts };
  }

  private async setStatus(id: string, status: SellerStatus): Promise<Seller> {
    const seller = await this.sellers.findOne({ where: { id } });
    if (!seller) throw new NotFoundException('Seller not found');
    seller.status = status;
    return this.sellers.save(seller);
  }

  async approve(id: string, user: AuthUser) {
    const seller = await this.setStatus(id, SellerStatus.ACTIVE);
    await this.audit.log(user, 'seller.approve', 'Seller', id);
    return seller;
  }

  async suspend(id: string, user: AuthUser) {
    const seller = await this.setStatus(id, SellerStatus.SUSPENDED);
    await this.audit.log(user, 'seller.suspend', 'Seller', id);
    return seller;
  }

  async reject(id: string, reason: string, user: AuthUser) {
    const seller = await this.setStatus(id, SellerStatus.REJECTED);
    await this.audit.log(user, 'seller.reject', 'Seller', id, reason);
    return seller;
  }

  async update(id: string, dto: UpdateSellerDto, user: AuthUser) {
    const seller = await this.sellers.findOne({ where: { id } });
    if (!seller) throw new NotFoundException('Seller not found');
    if (dto.commissionRate !== undefined) seller.commissionRate = dto.commissionRate;
    if (dto.badge !== undefined) seller.badge = dto.badge;
    if (dto.status !== undefined) seller.status = dto.status;
    const saved = await this.sellers.save(seller);
    await this.audit.log(user, 'seller.update', 'Seller', id, JSON.stringify(dto));
    return saved;
  }
}
