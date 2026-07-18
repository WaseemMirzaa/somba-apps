import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../database/entities';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly repo: Repository<Product>,
    private readonly emitter: RealtimeEmitter,
  ) {}

  list(filter?: { category?: string; status?: string }): Promise<Product[]> {
    const where: Record<string, string> = {};
    if (filter?.category) where.category = filter.category;
    if (filter?.status) where.status = filter.status;
    return this.repo.find({
      where: Object.keys(where).length ? where : undefined,
      order: { createdAt: 'DESC' },
    });
  }

  get(id: string): Promise<Product | null> {
    return this.repo.findOne({ where: { id } });
  }

  async create(data: Partial<Product>): Promise<Product> {
    const product = await this.repo.save(this.repo.create(data));
    // Live-update every open storefront/dashboard.
    this.emitter.toRoles(
      ['customer', ...ADMIN_ROLES],
      'product:created',
      product,
    );
    return product;
  }

  async update(id: string, patch: Partial<Product>): Promise<Product | null> {
    await this.repo.update({ id }, patch);
    const product = await this.get(id);
    if (product) {
      this.emitter.toRoles(
        ['customer', ...ADMIN_ROLES],
        'product:updated',
        product,
      );
    }
    return product;
  }

  /** Decrement stock when an order is placed; returns the new stock. */
  async decrementStock(id: string, qty: number): Promise<void> {
    const product = await this.get(id);
    if (!product) return;
    product.stock = Math.max(0, product.stock - qty);
    await this.repo.save(product);
    this.emitter.toRoles(
      ['customer', ...ADMIN_ROLES],
      'product:updated',
      product,
    );
  }
}
