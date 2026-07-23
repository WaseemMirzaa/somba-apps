import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, Payout, Product, Seller } from '../database/entities';
import type { SellerStatus } from '../database/entities/seller.entity';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import {
  ADMIN_ROLES,
  NotificationsService,
} from '../notifications/notifications.service';

@Injectable()
export class SellersService {
  constructor(
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Payout) private readonly payouts: Repository<Payout>,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  list(status?: SellerStatus): Promise<Seller[]> {
    return this.sellers.find({
      where: status ? { status } : undefined,
      order: { createdAt: 'DESC' },
    });
  }

  get(id: string): Promise<Seller | null> {
    return this.sellers.findOne({ where: { id } });
  }

  byUser(userId: string): Promise<Seller | null> {
    return this.sellers.findOne({ where: { userId } });
  }

  async register(
    user: { id: string; name: string },
    data: { name?: string },
  ): Promise<Seller> {
    const existing = await this.byUser(user.id);
    if (existing) return existing;
    const seller = await this.sellers.save(
      this.sellers.create({
        name: data.name ?? user.name,
        userId: user.id,
        status: 'pending',
        badge: 'bronze',
      }),
    );
    this.emitter.toRoles(ADMIN_ROLES, 'seller:updated', seller);
    await this.notifications.toRole('admin_moderation', {
      title: 'New seller application',
      body: seller.name,
      type: 'seller',
      entityId: seller.id,
    });
    return seller;
  }

  /** A seller edits their own store profile (name). */
  async updateProfile(
    userId: string,
    patch: { name?: string },
  ): Promise<Seller> {
    const seller = await this.byUser(userId);
    if (!seller) throw new NotFoundException('Store not found.');
    if (patch.name != null && patch.name.trim()) seller.name = patch.name.trim();
    const saved = await this.sellers.save(seller);
    this.emitter.toRoles(ADMIN_ROLES, 'seller:updated', saved);
    if (saved.userId) this.emitter.toUser(saved.userId, 'seller:updated', saved);
    return saved;
  }

  async setStatus(id: string, status: SellerStatus): Promise<Seller> {
    const seller = await this.sellers.findOne({ where: { id } });
    if (!seller) throw new NotFoundException('Seller not found.');
    seller.status = status;
    const saved = await this.sellers.save(seller);
    this.emitter.toRoles(ADMIN_ROLES, 'seller:updated', saved);
    if (saved.userId) {
      this.emitter.toUser(saved.userId, 'seller:updated', saved);
      await this.notifications.toUser(saved.userId, {
        title: `Store ${status}`,
        body: `Your store "${saved.name}" is now ${status}.`,
        type: 'seller',
        entityId: saved.id,
      });
    }
    return saved;
  }

  /** Public storefront: the seller + their live products. */
  async storefront(id: string) {
    const seller = await this.get(id);
    if (!seller) return null;
    const products = await this.products.find({
      where: { sellerId: id, status: 'live' },
    });
    return { seller, products };
  }

  /** Seller dashboard KPIs for the signed-in seller. */
  async stats(sellerId: string) {
    const products = await this.products.count({ where: { sellerId } });
    const allOrders = await this.orders.find();
    // Orders that contain at least one of this seller's products.
    const productIds = new Set(
      (await this.products.find({ where: { sellerId } })).map((p) => p.id),
    );
    const sellerOrders = allOrders.filter((o) =>
      o.items?.some((it) => productIds.has(it.productId)),
    );
    const revenue = sellerOrders.reduce(
      (s, o) =>
        s +
        (o.items ?? [])
          .filter((it) => productIds.has(it.productId))
          .reduce((t, it) => t + it.priceUsd * it.qty, 0),
      0,
    );
    const payouts = await this.payouts.find({ where: { sellerId } });
    const paidOut = payouts
      .filter((p) => p.status === 'paid')
      .reduce((s, p) => s + p.amountUsd, 0);
    return {
      products,
      orders: sellerOrders.length,
      revenue: Number(revenue.toFixed(2)),
      paidOut: Number(paidOut.toFixed(2)),
      pendingPayouts: payouts.filter((p) => p.status === 'requested').length,
    };
  }
}
