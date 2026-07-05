import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../entities/category.entity';
import { Product } from '../entities/product.entity';
import { ProductStatus, SellerStatus } from '../common/enums';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Category) private readonly categories: Repository<Category>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

  listCategories() {
    return this.categories.find({
      where: { active: true },
      order: { name: 'ASC' },
    });
  }

  async listProducts(opts: { categorySlug?: string; q?: string; page?: number; limit?: number }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(60, opts.limit ?? 20);
    const qb = this.products
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.category', 'c')
      .leftJoinAndSelect('p.seller', 's')
      .leftJoinAndSelect('p.images', 'img')
      .where('p.status = :status', { status: ProductStatus.LIVE })
      .andWhere('s.status = :sellerStatus', { sellerStatus: SellerStatus.ACTIVE });

    if (opts.categorySlug) qb.andWhere('c.slug = :slug', { slug: opts.categorySlug });
    if (opts.q) qb.andWhere('(p.name LIKE :q OR p.nameFr LIKE :q)', { q: `%${opts.q}%` });

    const [items, total] = await qb
      .orderBy('p.sold', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { items, total, page, limit };
  }

  async getProduct(id: string) {
    const product = await this.products.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }
}
