import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, Product, ProductQuestion, Review } from '../database/entities';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    @InjectRepository(ProductQuestion)
    private readonly questions: Repository<ProductQuestion>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly emitter: RealtimeEmitter,
  ) {}

  listForProduct(productId: string): Promise<Review[]> {
    return this.reviews.find({
      where: { productId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Mark a review helpful (increments the counter). */
  async markHelpful(id: string): Promise<Review> {
    const review = await this.reviews.findOne({ where: { id } });
    if (!review) throw new Error('Review not found.');
    review.helpful = (review.helpful ?? 0) + 1;
    const saved = await this.reviews.save(review);
    this.emitter.toRoles(['customer', ...ADMIN_ROLES], 'review:updated', saved);
    return saved;
  }

  /** Every review across a seller's catalogue, newest first. */
  async listForSeller(sellerId: string): Promise<Review[]> {
    const owned = await this.products.find({ where: { sellerId } });
    if (owned.length === 0) return [];
    const byId = new Map(owned.map((p) => [p.id, p.name]));
    const rows = await this.reviews.find({
      where: owned.map((p) => ({ productId: p.id })),
      order: { createdAt: 'DESC' },
    });
    // Attach the product name so the seller UI needn't re-join client-side.
    return rows.map((r) =>
      Object.assign(r, { productName: byId.get(r.productId) ?? '' }),
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
    return review;
  }

  /** Refresh the denormalised product rating + review count. */
  private async recomputeRating(productId: string): Promise<void> {
    const rows = await this.reviews.find({ where: { productId } });
    const product = await this.products.findOne({ where: { id: productId } });
    if (!product || rows.length === 0) return;
    const avg = rows.reduce((s, r) => s + r.rating, 0) / rows.length;
    product.rating = Number(avg.toFixed(2));
    product.reviewsCount = rows.length;
    await this.products.save(product);
    this.emitter.toRoles(['customer', ...ADMIN_ROLES], 'product:updated', product);
  }

  // ---- Q&A ----
  listQuestions(productId: string): Promise<ProductQuestion[]> {
    return this.questions.find({
      where: { productId },
      order: { createdAt: 'DESC' },
    });
  }

  private async askUnchecked(
    user: { id: string; name: string },
    input: { productId: string; question: string },
  ): Promise<ProductQuestion> {
    const q = await this.questions.save(
      this.questions.create({
        productId: input.productId,
        askedBy: user.name,
        question: input.question,
      }),
    );
    this.emitter.toRoles(['customer', ...ADMIN_ROLES], 'question:created', q);
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
    await this.questions.update({ id }, { answer, answeredBy });
    const q = await this.questions.findOne({ where: { id } });
    if (q) this.emitter.toRoles(['customer', ...ADMIN_ROLES], 'question:updated', q);
    return q;
  }
}
