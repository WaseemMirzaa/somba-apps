import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderItem, Product, Review, Seller } from '../database/entities';
import { ADMIN_ROLES, NotificationsService } from '../notifications/notifications.service';
import { SellersService } from '../ops/sellers.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { averageRating, badgeFor, fulfilmentRateOf } from './seller-scoring';
import type { Scores } from './seller-scoring';

/**
 * Keeps every store's `rating`, `ratingCount`, `fulfilmentRate` and `badge` true to what shoppers wrote and what the
 * store delivered: recomputed on a schedule (default hourly, `SELLER_SCORE_SWEEP_MS`; 0 turns it off) from the
 * visible reviews of its products and from its settled order lines.
 */
@Injectable()
export class SellerScoringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('SellerScoring');
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    @InjectRepository(OrderItem) private readonly items: Repository<OrderItem>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly emitter: RealtimeEmitter,
    private readonly notifications: NotificationsService,
    private readonly sellersSvc: SellersService,
  ) {}

  onModuleInit(): void {
    const every = Number(process.env.SELLER_SCORE_SWEEP_MS ?? 3_600_000);
    if (every > 0) {
      this.timer = setInterval(() => void this.recomputeAll().catch((e) => this.logger.warn(`score sweep failed: ${(e as Error).message}`)), every);
      this.timer.unref();
    }
  }
  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Reviews and delivery record of one store. */
  async scoresOf(seller: Pick<Seller, 'id' | 'userId'>): Promise<Scores> {
    const ids = [seller.id, ...(seller.userId ? [seller.userId] : [])];
    const ratings = await this.reviews
      .createQueryBuilder('r')
      .innerJoin(Product, 'p', 'p.id = r.productId')
      .select('r.rating', 'rating')
      .where("r.status = 'visible' AND p.sellerId IN (:...ids)", { ids })
      .getRawMany<{ rating: number }>();
    const lines = await this.items
      .createQueryBuilder('i')
      .innerJoin(Order, 'o', 'o.id = i.orderId')
      .select('COUNT(*)', 'settled')
      .addSelect("COALESCE(SUM(CASE WHEN i.fulfilment = 'cancelled' THEN 1 ELSE 0 END), 0)", 'cancelled')
      .where("i.sellerId IN (:...ids) AND (o.status = 'delivered' OR i.fulfilment = 'cancelled')", { ids })
      .getRawOne<{ settled: string; cancelled: string }>();
    return {
      rating: averageRating(ratings.map((r) => Number(r.rating))),
      ratingCount: ratings.length,
      fulfilmentRate: fulfilmentRateOf(Number(lines?.settled ?? 0), Number(lines?.cancelled ?? 0)),
    };
  }

  /** Recompute one store; saves and announces only what changed. Returns the stored row. */
  async recompute(seller: Seller): Promise<Seller> {
    const scores = await this.scoresOf(seller);
    // No reviews and no settled orders, and never scored: nothing to base a score on, so the stored values (a demo
    // store's curated rating, a badge set by hand) are left alone. Once a store has been scored it always follows the data.
    if (scores.ratingCount === 0 && scores.fulfilmentRate === null && !seller.scoreUpdatedAt) return seller;
    const badge = badgeFor(scores, seller.badge);
    const changed = seller.rating !== scores.rating || seller.ratingCount !== scores.ratingCount || seller.fulfilmentRate !== scores.fulfilmentRate || seller.badge !== badge;
    const badgeChanged = seller.badge !== badge;
    const previous = seller.badge;
    seller.rating = scores.rating;
    seller.ratingCount = scores.ratingCount;
    seller.fulfilmentRate = scores.fulfilmentRate;
    seller.badge = badge;
    seller.scoreUpdatedAt = new Date();
    const saved = await this.sellers.save(seller);
    if (changed) {
      const view = await this.sellersSvc.withPlanState(saved);
      this.emitter.toRoles(ADMIN_ROLES, 'seller:updated', view);
      if (saved.userId) this.emitter.toUser(saved.userId, 'seller:updated', view);
    }
    if (badgeChanged && saved.userId) {
      await this.notifications.toUser(saved.userId, {
        title: 'Seller badge updated',
        body: `Your store badge is now ${badge} (was ${previous}).`,
        type: 'seller',
        entityId: saved.id,
      });
    }
    return saved;
  }

  async recomputeAll(): Promise<number> {
    const all = await this.sellers.find();
    let n = 0;
    for (const s of all) {
      if (s.status === 'rejected') continue;
      await this.recompute(s);
      n++;
    }
    return n;
  }
}
