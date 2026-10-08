import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../database/entities';
import type { ProductStatus } from '../database/entities';
import { num, oneOf, optStr, price as priceOf, str } from '../common/validate';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';

const STATUSES = ['draft', 'pending', 'approved', 'rejected', 'live', 'removed'] as const;

/** Fields a SELLER may set on their own listing. */
export interface ListingInput {
  name?: unknown;
  nameFr?: unknown;
  price?: unknown;
  originalPrice?: unknown;
  category?: unknown;
  categoryFr?: unknown;
  stock?: unknown;
  image?: unknown;
  description?: unknown;
  /** Moderation field — honoured only when `allowStatus` is true (admins). */
  status?: unknown;
}

/**
 * Validate and normalise listing fields. Every value is range-checked (no
 * negative prices/stock) and unknown keys are dropped, so a client can never
 * set `sellerId`, `rating`, `reviewsCount`… The discount badge is computed here
 * from the prices rather than trusted from the client.
 */
export function cleanListing(
  input: ListingInput,
  opts: { partial: boolean; allowStatus: boolean; currentPrice?: number },
): Partial<Product> {
  const out: Partial<Product> = {};
  const has = (k: keyof ListingInput) => input[k] !== undefined;
  if (!opts.partial || has('name')) out.name = str(input.name, 'Name', { max: 200 });
  if (has('nameFr')) out.nameFr = optStr(input.nameFr, 'French name', 200);
  if (!opts.partial || has('price')) out.price = priceOf(input.price);
  if (has('originalPrice')) {
    out.originalPrice = input.originalPrice === null ? null : priceOf(input.originalPrice, 'Original price');
  }
  if (!opts.partial || has('category')) out.category = str(input.category, 'Category', { max: 100 });
  if (has('categoryFr')) out.categoryFr = optStr(input.categoryFr, 'French category', 100);
  if (has('stock')) out.stock = num(input.stock, 'Stock', { min: 0, max: 1_000_000, int: true });
  if (has('image')) out.image = optStr(input.image, 'Image', 500);
  if (has('description')) out.description = optStr(input.description, 'Description', 5000);
  if (opts.allowStatus && has('status')) out.status = oneOf<ProductStatus>(input.status, STATUSES, 'Status');

  const p = out.price ?? opts.currentPrice;
  if (out.originalPrice !== undefined || out.price !== undefined) {
    const orig = out.originalPrice ?? undefined;
    out.discount = orig && p !== undefined && orig > p ? Math.min(90, Math.round(((orig - p) / orig) * 100)) : 0;
  }
  return out;
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly repo: Repository<Product>,
    private readonly emitter: RealtimeEmitter,
  ) {}

  async list(filter?: { category?: string; status?: string }): Promise<Product[]> {
    const where: Record<string, string> = {};
    if (filter?.category) where.category = filter.category;
    if (filter?.status) where.status = filter.status;
    const rows = await this.repo.find({
      where: Object.keys(where).length ? where : undefined,
      order: { createdAt: 'DESC' },
    });
    // Soft-removed listings never appear unless explicitly requested.
    return filter?.status ? rows : rows.filter((p) => p.status !== 'removed');
  }

  /** A live listing by exact (case-insensitive) name — used to re-price snapshot order lines. */
  async findLiveByName(name: string): Promise<Product | null> {
    const rows = await this.repo.find({ where: { status: 'live' } });
    const n = name.trim().toLowerCase();
    return rows.find((p) => p.name.trim().toLowerCase() === n) ?? null;
  }

  /** Ids of every product a seller owns (for scoping their order view). */
  async idsBySeller(sellerId: string): Promise<string[]> {
    return (await this.repo.find({ where: { sellerId }, select: { id: true } })).map((p) => p.id);
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

  /**
   * Atomically take `qty` units: the UPDATE only succeeds while enough stock is
   * left, so concurrent orders can never oversell. Returns false if there wasn't.
   */
  async reserve(id: string, qty: number): Promise<boolean> {
    const res = await this.repo
      .createQueryBuilder()
      .update(Product)
      .set({ stock: () => `stock - ${Math.trunc(qty)}` })
      .where('id = :id AND stock >= :qty', { id, qty: Math.trunc(qty) })
      .execute();
    if (!res.affected) return false;
    await this.broadcast(id);
    return true;
  }

  /** Return reserved units to stock (cancelled / failed orders). */
  async restock(id: string, qty: number): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(Product)
      .set({ stock: () => `stock + ${Math.trunc(qty)}` })
      .where('id = :id', { id })
      .execute();
    await this.broadcast(id);
  }

  private async broadcast(id: string) {
    const product = await this.get(id);
    if (product) {
      this.emitter.toRoles(['customer', ...ADMIN_ROLES], 'product:updated', product);
    }
  }

  /** Soft-remove a listing: hidden from storefront, kept for order history. */
  async remove(id: string): Promise<Product | null> {
    const product = await this.get(id);
    if (!product) return null;
    product.status = 'removed';
    const saved = await this.repo.save(product);
    this.emitter.toRoles(
      ['customer', 'guest', ...ADMIN_ROLES],
      'product:updated',
      saved,
    );
    return saved;
  }
}
