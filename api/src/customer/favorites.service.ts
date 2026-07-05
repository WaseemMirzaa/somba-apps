import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Favorite } from '../entities/favorite.entity';
import { Product } from '../entities/product.entity';

@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(Favorite) private readonly favorites: Repository<Favorite>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

  async list(userId: string) {
    const rows = await this.favorites.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
    return rows.map((r) => r.product).filter(Boolean);
  }

  async add(userId: string, productId: string) {
    const product = await this.products.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');
    const existing = await this.favorites.findOne({
      where: { user: { id: userId }, product: { id: productId } },
    });
    if (existing) return existing;
    return this.favorites.save(
      this.favorites.create({ user: { id: userId } as any, product }),
    );
  }

  async remove(userId: string, productId: string) {
    await this.favorites.delete({ user: { id: userId }, product: { id: productId } });
    return { ok: true };
  }
}
