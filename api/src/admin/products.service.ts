import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { ProductStatus } from '../common/enums';
import { AuthUser } from '../common/decorators';
import { AuditService } from './audit.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly audit: AuditService,
  ) {}

  list(opts: { status?: ProductStatus; q?: string; sellerId?: string }) {
    const qb = this.products
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.seller', 's')
      .leftJoinAndSelect('p.category', 'c')
      .leftJoinAndSelect('p.images', 'img')
      .orderBy('p.createdAt', 'DESC');

    if (opts.status) qb.andWhere('p.status = :status', { status: opts.status });
    if (opts.sellerId) qb.andWhere('s.id = :sellerId', { sellerId: opts.sellerId });
    if (opts.q) {
      qb.andWhere('(p.name LIKE :q OR p.nameFr LIKE :q OR p.sku LIKE :q)', {
        q: `%${opts.q}%`,
      });
    }
    return qb.getMany();
  }

  async get(id: string) {
    const product = await this.products.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async approve(id: string, user: AuthUser) {
    const product = await this.get(id);
    product.status = ProductStatus.LIVE;
    product.rejectionReason = undefined;
    const saved = await this.products.save(product);
    await this.audit.log(user, 'product.approve', 'Product', id);
    return saved;
  }

  async reject(id: string, reason: string, user: AuthUser) {
    const product = await this.get(id);
    product.status = ProductStatus.REJECTED;
    product.rejectionReason = reason;
    const saved = await this.products.save(product);
    await this.audit.log(user, 'product.reject', 'Product', id, reason);
    return saved;
  }
}
