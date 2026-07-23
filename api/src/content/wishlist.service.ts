import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WishlistItem } from '../database/entities';
import { RealtimeEmitter } from '../realtime/realtime-emitter';

/** Server-persisted shopper wishlist. */
@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(WishlistItem)
    private readonly items: Repository<WishlistItem>,
    private readonly emitter: RealtimeEmitter,
  ) {}

  /** The product ids on a user's wishlist. */
  async list(userId: string): Promise<string[]> {
    const rows = await this.items.find({ where: { userId } });
    return rows.map((r) => r.productId);
  }

  /** Add or remove a product; returns the full updated id list. */
  async toggle(userId: string, productId: string): Promise<string[]> {
    const existing = await this.items.findOne({ where: { userId, productId } });
    if (existing) {
      await this.items.remove(existing);
    } else {
      await this.items.save(this.items.create({ userId, productId }));
    }
    const ids = await this.list(userId);
    this.emitter.toUser(userId, 'wishlist:updated', ids);
    return ids;
  }
}
