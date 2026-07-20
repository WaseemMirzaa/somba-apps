import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product, ProductQuestion, Review } from '../database/entities';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    @InjectRepository(ProductQuestion)
    private readonly questions: Repository<ProductQuestion>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly emitter: RealtimeEmitter,
  ) {}

  listForProduct(productId: string): Promise<Review[]> {
    return this.reviews.find({
      where: { productId },
      order: { createdAt: 'DESC' },
    });
  }

  async create(
    user: { id: string; name: string },
    input: { productId: string; rating: number; text: string },
  ): Promise<Review> {
    const review = await this.reviews.save(
      this.reviews.create({
        productId: input.productId,
        userId: user.id,
        author: user.name,
        rating: Math.min(5, Math.max(1, Math.round(input.rating))),
        text: input.text,
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

  async ask(
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
