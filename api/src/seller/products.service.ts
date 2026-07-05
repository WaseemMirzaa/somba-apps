import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { ProductImage } from '../entities/product-image.entity';
import { Category } from '../entities/category.entity';
import { ProductStatus } from '../common/enums';
import { refCode } from '../common/util';
import { CreateProductDto, UpdateProductDto } from './dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(ProductImage)
    private readonly images: Repository<ProductImage>,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
  ) {}

  private requireSeller(sellerId?: string): string {
    if (!sellerId) throw new ForbiddenException('No seller profile');
    return sellerId;
  }

  async list(sellerId: string | undefined, opts: { status?: string; q?: string }) {
    const id = this.requireSeller(sellerId);
    const qb = this.products
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.category', 'c')
      .leftJoinAndSelect('p.images', 'img')
      .where('p.seller.id = :id', { id });

    if (opts.status) qb.andWhere('p.status = :status', { status: opts.status });
    if (opts.q) qb.andWhere('(p.name LIKE :q OR p.sku LIKE :q)', { q: `%${opts.q}%` });

    return qb.orderBy('p.createdAt', 'DESC').getMany();
  }

  async findOwned(sellerId: string, id: string): Promise<Product> {
    const product = await this.products.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.seller?.id !== sellerId) {
      throw new ForbiddenException('Not your product');
    }
    return product;
  }

  async get(sellerId: string | undefined, id: string) {
    return this.findOwned(this.requireSeller(sellerId), id);
  }

  private buildImages(urls?: string[]): ProductImage[] {
    if (!urls?.length) return [];
    return urls.map((url, position) =>
      this.images.create({ url, position }),
    );
  }

  async create(sellerId: string | undefined, dto: CreateProductDto) {
    const id = this.requireSeller(sellerId);

    let category: Category | undefined;
    if (dto.categoryId) {
      const found = await this.categories.findOne({ where: { id: dto.categoryId } });
      if (!found) throw new NotFoundException('Category not found');
      category = found;
    }

    const product = this.products.create({
      seller: { id } as any,
      category,
      name: dto.name,
      nameFr: dto.nameFr,
      description: dto.description,
      descriptionFr: dto.descriptionFr,
      price: dto.price,
      discountPrice: dto.discountPrice,
      mrp: dto.mrp,
      stock: dto.stock,
      sku: dto.sku || refCode('SKU'),
      status: ProductStatus.DRAFT,
      images: this.buildImages(dto.imageUrls),
    });

    return this.products.save(product);
  }

  async update(sellerId: string | undefined, id: string, dto: UpdateProductDto) {
    const product = await this.findOwned(this.requireSeller(sellerId), id);

    if (dto.categoryId !== undefined) {
      if (dto.categoryId) {
        const found = await this.categories.findOne({ where: { id: dto.categoryId } });
        if (!found) throw new NotFoundException('Category not found');
        product.category = found;
      } else {
        product.category = undefined;
      }
    }

    if (dto.name !== undefined) product.name = dto.name;
    if (dto.nameFr !== undefined) product.nameFr = dto.nameFr;
    if (dto.description !== undefined) product.description = dto.description;
    if (dto.descriptionFr !== undefined) product.descriptionFr = dto.descriptionFr;
    if (dto.price !== undefined) product.price = dto.price;
    if (dto.discountPrice !== undefined) product.discountPrice = dto.discountPrice;
    if (dto.mrp !== undefined) product.mrp = dto.mrp;
    if (dto.stock !== undefined) product.stock = dto.stock;
    if (dto.sku !== undefined && dto.sku) product.sku = dto.sku;

    if (dto.imageUrls !== undefined) {
      if (product.images?.length) {
        await this.images.remove(product.images);
      }
      product.images = this.buildImages(dto.imageUrls);
    }

    return this.products.save(product);
  }

  async remove(sellerId: string | undefined, id: string) {
    const product = await this.findOwned(this.requireSeller(sellerId), id);
    await this.products.remove(product);
    return { deleted: true };
  }

  async submit(sellerId: string | undefined, id: string) {
    const product = await this.findOwned(this.requireSeller(sellerId), id);
    if (
      product.status !== ProductStatus.DRAFT &&
      product.status !== ProductStatus.REJECTED
    ) {
      throw new ForbiddenException('Only draft or rejected products can be submitted');
    }
    product.status = ProductStatus.PENDING;
    product.rejectionReason = undefined;
    return this.products.save(product);
  }
}
