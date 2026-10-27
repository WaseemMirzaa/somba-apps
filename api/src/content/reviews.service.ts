import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { In } from 'typeorm';
import { Order, Product, ProductQuestion, Review, ReviewHelpful, ReviewReport, Seller } from '../database/entities';
import type { ReviewStatus } from '../database/entities';
import { pageOf } from '../common/paging';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';
import { ProductsService } from '../products/products.service';

/** Staff who may answer a review on a seller's behalf (the same people who moderate reviews). */
const REPLY_STAFF = ['admin', 'admin_operations', 'admin_moderation'];
/** Staff who receive reported reviews. */
export const MODERATORS = REPLY_STAFF;

/** A question as the seller's inbox receives it: the question plus the product it is about. */
/** A question as shoppers and guests read it: the asker's FIRST name only, no account id, no store id. */
export interface PublicQuestion {
  id: string;
  productId: string;
  askedBy: string;
  question: string;
  answer: string | null;
  answeredBy: string | null;
  answeredAt: Date | null;
  createdAt: Date;
}

export function publicQuestion(q: ProductQuestion): PublicQuestion {
  return {
    id: q.id,
    productId: q.productId,
    askedBy: (q.askedBy ?? '').trim().split(/\s+/)[0] || '',
    question: q.question,
    answer: q.answer ?? null,
    answeredBy: q.answeredBy ?? null,
    answeredAt: q.answeredAt ?? null,
    createdAt: q.createdAt,
  };
}

export type SellerQuestion = ProductQuestion & { productName: string; productNameFr: string; productImage: string | null };

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    @InjectRepository(ProductQuestion)
    private readonly questions: Repository<ProductQuestion>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    private readonly emitter: RealtimeEmitter,
    private readonly notifications: NotificationsService,
    private readonly productsSvc: ProductsService,
    @InjectRepository(ReviewReport) private readonly reports: Repository<ReviewReport>,
    @InjectRepository(ReviewHelpful) private readonly helpfulVotes: Repository<ReviewHelpful>,
  ) {}

  /** The account that owns a product's store (null when the product or store is gone). */
  private async sellerUserOfProduct(product: Pick<Product, 'sellerId'> | null): Promise<string | null> {
    if (!product?.sellerId) return null;
    const store = await this.sellers.findOne({ where: { id: product.sellerId } });
    return store?.userId ?? product.sellerId;
  }

  /** Public list: hidden (moderated) reviews are left out unless a moderator asks for them. */
  listForProduct(productId: string, includeHidden = false): Promise<Review[]> {
    return this.reviews.find({
      where: includeHidden ? { productId } : { productId, status: 'visible' },
      order: { createdAt: 'DESC' },
      take: 500,
    });
  }

  /** Moderation queue: reviews across the catalogue, newest first, with the product name. */
  async listForModeration(filter: { status?: ReviewStatus; productId?: string; reported?: boolean }, paging?: unknown): Promise<Review[]> {
    const { take, skip } = pageOf(paging, { def: 200 });
    const where: Record<string, unknown> = {};
    if (filter.status) where.status = filter.status;
    if (filter.productId) where.productId = filter.productId;
    const rows = await this.reviews.find({ where: where as never, order: { createdAt: 'DESC' }, take, skip });
    const picked = filter.reported ? rows.filter((r) => r.reportCount > 0) : rows;
    const names = await this.productsSvc.names(picked.map((r) => r.productId));
    return picked.map((r) => Object.assign(r, { productName: names.get(r.productId)?.name ?? '', productNameFr: names.get(r.productId)?.nameFr ?? '' }));
  }

  /** The open reports on a review, for the moderation screen. */
  listReports(reviewId: string): Promise<ReviewReport[]> {
    return this.reports.find({ where: { reviewId: String(reviewId ?? '') }, order: { createdAt: 'DESC' }, take: 50 });
  }

  /**
   * Mark a review helpful. One vote per person: voting again changes nothing (the counter stays), and the answer says
   * whether this vote counted.
   */
  async markHelpful(id: string, userId: string): Promise<Review & { counted: boolean }> {
    const review = await this.reviews.findOne({ where: { id } });
    if (!review) throw new Error('Review not found.');
    // C-V1: one vote per user and review, enforced by the unique index as well.
    let counted = false;
    try {
      await this.helpfulVotes.insert({ reviewId: id, userId });
      counted = true;
    } catch {
      counted = false;
    }
    if (counted) {
      await this.reviews.createQueryBuilder().update(Review).set({ helpful: () => 'helpful + 1' }).where('id = :id', { id }).execute();
    }
    const saved = (await this.reviews.findOne({ where: { id } }))!;
    if (counted) this.emitter.toRoles(['customer', ...ADMIN_ROLES], 'review:updated', saved);
    return Object.assign(saved, { counted });
  }

  /** Every review across a seller's catalogue, newest first. */
  async listForSeller(sellerId: string | string[], paging?: unknown): Promise<Review[]> {
    const { take, skip } = pageOf(paging);
    const owned = await this.products.find({
      where: { sellerId: In(Array.isArray(sellerId) ? sellerId : [sellerId]) },
      select: { id: true },
    });
    if (owned.length === 0) return [];
    const rows = await this.reviews.find({
      where: { productId: In(owned.map((p) => p.id)), status: 'visible' },
      order: { createdAt: 'DESC' },
      take,
      skip,
    });
    // Attach the product name (both languages) so the seller UI needn't re-join client-side.
    const names = await this.productsSvc.names(rows.map((r) => r.productId));
    return rows.map((r) =>
      Object.assign(r, { productName: names.get(r.productId)?.name ?? '', productNameFr: names.get(r.productId)?.nameFr ?? '' }),
    );
  }

  async create(
    user: { id: string; name: string },
    input: { productId: string; rating: number; text: string },
  ): Promise<Review> {
    const text = String(input?.text ?? '').trim();
    const rating = Number(input?.rating);
    if (!input?.productId || !Number.isFinite(rating) || text.length < 3) {
      throw new BadRequestException('Give a rating and write a short review.');
    }
    // Only people who actually received the product can review it — once.
    const bought = await this.orders
      .createQueryBuilder('o')
      .innerJoin('o.items', 'i')
      .where('o.customerId = :uid AND o.status = :st AND i.productId = :pid', {
        uid: user.id,
        st: 'delivered',
        pid: input.productId,
      })
      .getCount();
    if (!bought) {
      throw new BadRequestException('You can review a product after it has been delivered to you.');
    }
    if (await this.reviews.count({ where: { productId: input.productId, userId: user.id } })) {
      throw new BadRequestException('You have already reviewed this product.');
    }
    const review = await this.reviews.save(
      this.reviews.create({
        productId: input.productId,
        userId: user.id,
        author: user.name,
        rating: Math.min(5, Math.max(1, Math.round(rating))),
        text: text.slice(0, 2000),
      }),
    );
    await this.recomputeRating(input.productId);
    this.emitter.toRoles(['customer', ...ADMIN_ROLES], 'review:created', review);
    // The seller hears about it at once.
    const product = await this.products.findOne({ where: { id: input.productId } });
    const sellerUser = await this.sellerUserOfProduct(product);
    if (sellerUser) {
      this.emitter.toUser(sellerUser, 'review:created', review);
      await this.notifications.toUser(sellerUser, {
        title: 'New review on your product',
        body: `${product?.name ?? ''}: ${review.rating}★ ${review.text.slice(0, 120)}`,
        type: 'review',
        entityId: review.id,
      });
    }
    return review;
  }

  /** Refresh the denormalised product rating + review count (visible reviews only). */
  async recomputeRating(productId: string): Promise<void> {
    const agg = await this.reviews
      .createQueryBuilder('r')
      .select('COUNT(*)', 'n')
      .addSelect('COALESCE(AVG(r.rating), 0)', 'avg')
      .where("r.productId = :productId AND r.status = 'visible'", { productId })
      .getRawOne<{ n: string; avg: string }>();
    const product = await this.products.findOne({ where: { id: productId } });
    if (!product) return;
    const n = Number(agg?.n ?? 0);
    product.rating = n ? Number(Number(agg?.avg ?? 0).toFixed(2)) : 0;
    product.reviewsCount = n;
    await this.products.save(product);
    await this.productsSvc.publishUpdated([product], ['customer', ...ADMIN_ROLES]);
  }

  /**
   * A seller asks the moderators to look at a review of one of their products. One report per seller and review.
   * The review stays visible until a moderator hides it.
   */
  async report(actor: { id: string; name: string; role: string }, reviewId: string, rawReason: unknown): Promise<ReviewReport> {
    const reason = String(rawReason ?? '').trim();
    if (reason.length < 5 || reason.length > 500) throw new BadRequestException('Tell the moderators what is wrong with this review (5 to 500 characters).');
    const review = await this.reviews.findOne({ where: { id: String(reviewId ?? '') } });
    const product = review ? await this.products.findOne({ where: { id: review.productId } }) : null;
    const store = await this.sellers.findOne({ where: { userId: actor.id } });
    const mine = !!product?.sellerId && (product.sellerId === store?.id || product.sellerId === actor.id);
    // Same answer for "missing" and "not yours".
    if (!review || actor.role !== 'seller' || !mine) throw new NotFoundException('Review not found.');
    if (review.status === 'hidden') throw new BadRequestException('This review is already hidden.');
    // C-V2: one report per seller and review (the unique index holds it too).
    let report: ReviewReport;
    try {
      report = await this.reports.save(this.reports.create({ reviewId: review.id, reporterId: actor.id, reporterName: actor.name, reason: reason.slice(0, 500), status: 'open' }));
    } catch {
      throw new BadRequestException('You already reported this review.');
    }
    await this.reviews.createQueryBuilder().update(Review).set({ reportCount: () => 'reportCount + 1' }).where('id = :id', { id: review.id }).execute();
    const fresh = (await this.reviews.findOne({ where: { id: review.id } }))!;
    this.emitter.toRoles(MODERATORS, 'review:reported', { review: fresh, report, productName: product?.name ?? '' });
    await this.notifications.toRole('admin_moderation', {
      title: 'Review reported',
      body: `${product?.name ?? ''}: ${reason.slice(0, 140)}`,
      type: 'review',
      entityId: review.id,
    });
    return report;
  }

  /** Moderators hide / restore a review. Hidden reviews drop out of public lists and the product rating. */
  async setStatus(reviewId: string, status: ReviewStatus, rawReason?: unknown): Promise<Review> {
    const review = await this.reviews.findOne({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found.');
    const reason = String(rawReason ?? '').trim().slice(0, 500);
    const changed = review.status !== status;
    if (changed) {
      review.status = status;
      review.moderationReason = status === 'hidden' ? reason || null : null;
      await this.reviews.save(review);
      await this.recomputeRating(review.productId);
      // Reports on a review that was dealt with are closed.
      await this.reports.update({ reviewId: review.id, status: 'open' }, { status: 'resolved' });
      if (review.reportCount) await this.reviews.update({ id: review.id }, { reportCount: 0 });
      review.reportCount = 0;
    }
    // Shoppers only learn that it is gone (no content); staff get the full row.
    this.emitter.toRoles(
      ['customer', 'guest'],
      'review:updated',
      status === 'hidden' ? { id: review.id, productId: review.productId, status } : review,
    );
    this.emitter.toRoles(ADMIN_ROLES, 'review:updated', review);
    if (changed) {
      const product = await this.products.findOne({ where: { id: review.productId } });
      const sellerUser = await this.sellerUserOfProduct(product);
      const why = reason ? `: ${reason}` : '';
      const name = product?.name ?? '';
      this.emitter.toUser(review.userId, 'review:updated', review);
      if (sellerUser) this.emitter.toUser(sellerUser, 'review:updated', review);
      if (review.userId !== 'seed') {
        await this.notifications.toUser(review.userId, {
          title: status === 'hidden' ? 'Your review was hidden' : 'Your review is visible again',
          body: `${name}${why}`,
          type: 'review',
          entityId: review.id,
        });
      }
      if (sellerUser) {
        await this.notifications.toUser(sellerUser, {
          title: status === 'hidden' ? 'A review on your product was hidden' : 'A review on your product is visible again',
          body: `${name}${why}`,
          type: 'review',
          entityId: review.id,
        });
      }
    }
    return review;
  }

  /**
   * The seller of the reviewed product (or an admin) answers publicly. A second
   * reply replaces the first. The author is notified live.
   */
  async reply(actor: { id: string; role: string; name: string }, reviewId: string, rawText: unknown): Promise<Review> {
    const text = String(rawText ?? '').trim();
    if (text.length < 2 || text.length > 1000) throw new BadRequestException('Write a reply of 2 to 1000 characters.');
    const review = await this.reviews.findOne({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found.');
    const product = await this.products.findOne({ where: { id: review.productId } });
    if (!REPLY_STAFF.includes(actor.role)) {
      const store = await this.sellers.findOne({ where: { userId: actor.id } });
      const mine = !!product?.sellerId && (product.sellerId === store?.id || product.sellerId === actor.id);
      // Same answer for "missing" and "not yours" so reviews of other stores cannot be probed.
      if (actor.role !== 'seller' || !mine) throw new NotFoundException('Review not found.');
    }
    review.sellerReply = text;
    review.sellerReplyAt = new Date();
    const saved = await this.reviews.save(review);
    if (saved.status === 'visible') this.emitter.toRoles(['customer', 'guest'], 'review:updated', saved);
    this.emitter.toRoles(ADMIN_ROLES, 'review:updated', saved);
    this.emitter.toUser(saved.userId, 'review:updated', saved);
    if (product?.sellerId) {
      const store = await this.sellers.findOne({ where: { id: product.sellerId } });
      if (store?.userId) this.emitter.toUser(store.userId, 'review:updated', saved);
    }
    if (saved.userId !== 'seed') {
      await this.notifications.toUser(saved.userId, {
        title: 'The seller replied to your review',
        body: `${product?.name ?? 'Your review'}: ${text.slice(0, 140)}`,
        type: 'review',
        entityId: saved.id,
      });
    }
    return saved;
  }

  // ---- Q&A ----
  /** A product's questions, newest first, for anyone: first names only (`limit` default 200, `offset` pages further back). */
  async listQuestions(productId: string, paging?: unknown): Promise<PublicQuestion[]> {
    const { take, skip } = pageOf(paging, { def: 200 });
    const rows = await this.questions.find({ where: { productId }, order: { createdAt: 'DESC', id: 'ASC' }, take, skip });
    return rows.map(publicQuestion);
  }

  /** The inbox of a seller: questions on their products, with the product's name and image. */
  async listQuestionsForSeller(
    sellerIds: string[],
    filter: { status?: string; limit?: number; offset?: number } = {},
  ): Promise<SellerQuestion[]> {
    const { take, skip } = pageOf(filter, { def: 100 });
    const owned = await this.products.find({ where: { sellerId: In(sellerIds) }, select: { id: true, image: true } });
    if (!owned.length) return [];
    const qb = this.questions
      .createQueryBuilder('q')
      .where('q.productId IN (:...pids)', { pids: owned.map((p) => p.id) })
      .orderBy('q.createdAt', 'DESC')
      .take(take)
      .skip(skip);
    if (filter.status === 'unanswered') qb.andWhere('q.answer IS NULL');
    else if (filter.status === 'answered') qb.andWhere('q.answer IS NOT NULL');
    const rows = await qb.getMany();
    const names = await this.productsSvc.names(rows.map((r) => r.productId));
    const images = new Map(owned.map((p) => [p.id, p.image]));
    return rows.map((q) =>
      Object.assign(q, {
        productName: names.get(q.productId)?.name ?? '',
        productNameFr: names.get(q.productId)?.nameFr ?? '',
        productImage: images.get(q.productId) ?? null,
      }),
    );
  }

  /** How many questions wait for an answer (the seller's badge). */
  async countUnanswered(sellerIds: string[]): Promise<number> {
    const owned = await this.products.find({ where: { sellerId: In(sellerIds) }, select: { id: true } });
    if (!owned.length) return 0;
    return this.questions
      .createQueryBuilder('q')
      .where('q.productId IN (:...pids) AND q.answer IS NULL', { pids: owned.map((p) => p.id) })
      .getCount();
  }

  private async askUnchecked(
    user: { id: string; name: string },
    input: { productId: string; question: string },
  ): Promise<ProductQuestion> {
    const product = await this.products.findOne({ where: { id: input.productId } });
    const q = await this.questions.save(
      this.questions.create({
        productId: input.productId,
        askedBy: user.name,
        askerId: user.id,
        sellerId: product?.sellerId ?? null,
        question: input.question,
      }),
    );
    // Shoppers get the public view (first name, no ids); the store and the admins get the full row.
    this.emitter.toRoles(['customer'], 'question:created', publicQuestion(q));
    this.emitter.toRoles(ADMIN_ROLES, 'question:created', q);
    const sellerUser = await this.sellerUserOfProduct(product);
    if (sellerUser) {
      this.emitter.toUser(sellerUser, 'question:created', q);
      await this.notifications.toUser(sellerUser, {
        title: 'New question on your product',
        body: `${product?.name ?? ''}: ${q.question.slice(0, 140)}`,
        type: 'question',
        entityId: q.id,
      });
    }
    await this.notifications.toRole('admin_moderation', {
      title: 'New product question',
      body: `${product?.name ?? ''}: ${q.question.slice(0, 140)}`,
      type: 'question',
      entityId: q.id,
    });
    return q;
  }

  /** The product a question belongs to (for ownership checks). */
  async productIdOfQuestion(id: string): Promise<string | null> {
    return (await this.questions.findOne({ where: { id } }))?.productId ?? null;
  }

  async productSellerId(productId: string): Promise<string | null> {
    return (await this.products.findOne({ where: { id: productId } }))?.sellerId ?? null;
  }

  async ask(
    user: { id: string; name: string },
    input: { productId: string; question: string },
  ): Promise<ProductQuestion> {
    const question = String(input?.question ?? '').trim();
    if (!input?.productId || question.length < 3) {
      throw new BadRequestException('Write your question first.');
    }
    return this.askUnchecked(user, { productId: input.productId, question: question.slice(0, 1000) });
  }

  async answer(
    id: string,
    answer: string,
    answeredBy: string,
  ): Promise<ProductQuestion | null> {
    await this.questions.update({ id }, { answer, answeredBy, answeredAt: new Date() });
    const q = await this.questions.findOne({ where: { id } });
    if (!q) return null;
    this.emitter.toRoles(['customer', 'guest'], 'question:updated', publicQuestion(q));
    this.emitter.toRoles(ADMIN_ROLES, 'question:updated', q);
    const product = await this.products.findOne({ where: { id: q.productId } });
    const sellerUser = await this.sellerUserOfProduct(product);
    if (sellerUser) this.emitter.toUser(sellerUser, 'question:updated', q);
    if (q.askerId) {
      // The asker hears about it even if they are not looking at the product.
      this.emitter.toUser(q.askerId, 'question:updated', publicQuestion(q));
      await this.notifications.toUser(q.askerId, {
        title: 'Your question was answered',
        body: `${product?.name ?? ''}: ${answer.slice(0, 140)}`,
        type: 'question',
        entityId: q.productId,
      });
    }
    return q;
  }
}
