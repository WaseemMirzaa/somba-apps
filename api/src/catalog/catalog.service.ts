import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../entities/category.entity';
import { Product } from '../entities/product.entity';
import { Seller } from '../entities/seller.entity';
import { Review } from '../entities/review.entity';
import { ProductStatus, SellerStatus } from '../common/enums';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Category) private readonly categories: Repository<Category>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
  ) {}

  /** Active categories, each with a live-product count. */
  async listCategories() {
    const cats = await this.categories.find({ where: { active: true }, order: { name: 'ASC' } });
    const counts = await this.products
      .createQueryBuilder('p')
      .select('p.categoryId', 'categoryId')
      .addSelect('COUNT(*)', 'count')
      .where('p.status = :status', { status: ProductStatus.LIVE })
      .groupBy('p.categoryId')
      .getRawMany<{ categoryId: string; count: string }>();
    const byId = new Map(counts.map((c) => [c.categoryId, Number(c.count)]));
    return cats.map((c) => ({ ...c, productCount: byId.get(c.id) ?? 0 }));
  }

  private liveQuery() {
    return this.products
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.category', 'c')
      .leftJoinAndSelect('p.seller', 's')
      .leftJoinAndSelect('p.images', 'img')
      .where('p.status = :status', { status: ProductStatus.LIVE })
      .andWhere('s.status = :sellerStatus', { sellerStatus: SellerStatus.ACTIVE });
  }

  async listProducts(opts: {
    categorySlug?: string;
    q?: string;
    sellerSlug?: string;
    sort?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(60, opts.limit ?? 20);
    const qb = this.liveQuery();

    if (opts.categorySlug) qb.andWhere('c.slug = :slug', { slug: opts.categorySlug });
    if (opts.sellerSlug) qb.andWhere('s.slug = :sellerSlug', { sellerSlug: opts.sellerSlug });
    if (opts.q) qb.andWhere('(p.name LIKE :q OR p.nameFr LIKE :q)', { q: `%${opts.q}%` });

    if (opts.sort === 'price_asc') qb.orderBy('p.price', 'ASC');
    else if (opts.sort === 'price_desc') qb.orderBy('p.price', 'DESC');
    else if (opts.sort === 'rating') qb.orderBy('p.rating', 'DESC');
    else if (opts.sort === 'newest') qb.orderBy('p.createdAt', 'DESC');
    else qb.orderBy('p.sold', 'DESC');

    const [items, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { items, total, page, limit };
  }

  /** Discounted products (biggest savings first) — the "Deals" tab.
   * A deal is any product whose list price (mrp) exceeds its effective
   * selling price (discountPrice ?? price). */
  async listDeals(limit = 20) {
    const rows = await this.liveQuery()
      .andWhere('p.mrp IS NOT NULL')
      .andWhere('p.mrp > COALESCE(p.discountPrice, p.price)')
      .getMany();
    const savings = (p: Product) => Number(p.mrp) - Number(p.discountPrice ?? p.price);
    return rows
      .sort((a, b) => savings(b) - savings(a))
      .slice(0, Math.min(60, limit));
  }

  /** Best-selling products — the home "Featured" rail. */
  async listFeatured(limit = 12) {
    return this.liveQuery().orderBy('p.sold', 'DESC').take(Math.min(60, limit)).getMany();
  }

  async getProduct(id: string) {
    const product = await this.liveQuery().andWhere('p.id = :id', { id }).getOne();
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  /** Up to `limit` live products in the same category (excluding this one). */
  async relatedProducts(id: string, limit = 6) {
    const product = await this.products.findOne({ where: { id }, relations: { category: true } });
    if (!product) throw new NotFoundException('Product not found');
    const qb = this.liveQuery().andWhere('p.id != :id', { id });
    if (product.category) qb.andWhere('c.id = :cid', { cid: product.category.id });
    return qb.orderBy('p.sold', 'DESC').take(Math.min(24, limit)).getMany();
  }

  /** Published reviews for a product (newest first). */
  async productReviews(id: string) {
    return this.reviews.find({
      where: { product: { id } },
      order: { createdAt: 'DESC' },
    });
  }

  /** Active seller directory (browsable stores) with live-product counts. */
  async listStores() {
    const stores = await this.sellers.find({
      where: { status: SellerStatus.ACTIVE },
      order: { rating: 'DESC' },
    });
    const counts = await this.products
      .createQueryBuilder('p')
      .select('p.sellerId', 'sellerId')
      .addSelect('COUNT(*)', 'count')
      .where('p.status = :status', { status: ProductStatus.LIVE })
      .groupBy('p.sellerId')
      .getRawMany<{ sellerId: string; count: string }>();
    const byId = new Map(counts.map((c) => [c.sellerId, Number(c.count)]));
    return stores.map((s) => ({
      id: s.id,
      storeName: s.storeName,
      slug: s.slug,
      description: s.description,
      badge: s.badge,
      rating: s.rating,
      healthScore: s.healthScore,
      city: s.city,
      logoUrl: s.logoUrl,
      productCount: byId.get(s.id) ?? 0,
    }));
  }

  /** A single store (by slug) plus its live products. */
  async getStore(slug: string) {
    const store = await this.sellers.findOne({
      where: { slug, status: SellerStatus.ACTIVE },
    });
    if (!store) throw new NotFoundException('Store not found');
    const products = await this.liveQuery()
      .andWhere('s.slug = :slug', { slug })
      .orderBy('p.sold', 'DESC')
      .getMany();
    return {
      id: store.id,
      storeName: store.storeName,
      slug: store.slug,
      description: store.description,
      badge: store.badge,
      rating: store.rating,
      healthScore: store.healthScore,
      city: store.city,
      logoUrl: store.logoUrl,
      productCount: products.length,
      products,
    };
  }
}
