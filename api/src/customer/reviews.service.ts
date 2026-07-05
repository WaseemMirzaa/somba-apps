import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from '../entities/review.entity';
import { Product } from '../entities/product.entity';
import { User } from '../entities/user.entity';
import { CreateReviewDto } from './dto';
import { round2 } from '../common/util';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async create(userId: string, productId: string, dto: CreateReviewDto) {
    const product = await this.products.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');
    const user = await this.users.findOne({ where: { id: userId } });

    const review = await this.reviews.save(
      this.reviews.create({
        product,
        user: user ?? undefined,
        authorName: user?.name ?? 'Customer',
        stars: dto.stars,
        text: dto.text,
        photos: dto.photos ?? 0,
      }),
    );

    // Recompute the product's denormalised rating + review count.
    const { avg, count } = await this.reviews
      .createQueryBuilder('r')
      .select('AVG(r.stars)', 'avg')
      .addSelect('COUNT(*)', 'count')
      .where('r.productId = :productId', { productId })
      .getRawOne<{ avg: string; count: string }>()
      .then((raw) => ({ avg: Number(raw?.avg ?? 0), count: Number(raw?.count ?? 0) }));
    product.rating = round2(avg);
    product.reviewCount = count;
    await this.products.save(product);

    return review;
  }
}
