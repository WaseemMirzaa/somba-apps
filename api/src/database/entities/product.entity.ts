import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Category } from './category.entity';

export type ProductStatus =
  | 'draft'
  | 'pending'
  | 'rejected'
  | 'live'
  | 'removed';

@Index('IDX_products_status_seller', ['status', 'sellerId'])
@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The title as the seller wrote it, in `sourceLang`. Other languages are `translations` rows; see products.service `present()`. */
  @Column({ type: 'varchar' })
  name: string;

  /** The description as the seller wrote it, in `sourceLang`. */
  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Language of `name` / `description` / `variants` as authored ('en' | 'fr'). */
  @Column({ type: 'varchar', length: 5, default: 'en' })
  sourceLang: string;

  /** Price in USD. */
  @Column({ type: 'float' })
  price: number;

  /** Pre-discount reference price (for the struck-through UI price). */
  @Column({ type: 'float', nullable: true })
  originalPrice: number | null;

  /** Percentage discount shown on cards. */
  @Column({ type: 'int', default: 0 })
  discount: number;

  /** The category the listing sits in (renaming the category never moves its products). */
  @Index('IDX_products_category')
  @Column({ type: 'varchar', length: 36, nullable: true })
  categoryId: string | null;

  /** Declares the foreign key (C-I2 also holds at the database); never loaded: the served `category` is composed. */
  @ManyToOne(() => Category, { nullable: true, onDelete: 'RESTRICT', createForeignKeyConstraints: true })
  @JoinColumn({ name: 'categoryId' })
  categoryRef?: Category | null;

  @Column({ type: 'varchar', nullable: true })
  image: string | null;

  @Column({ type: 'int', default: 0 })
  stock: number;

  /** Options a shopper picks before buying, as JSON text: [{ name, options[] }] (null = none). See common/variants. */
  @Column({ type: 'text', nullable: true })
  variants: string | null;

  @Column({ type: 'float', default: 0 })
  rating: number;

  /** Number of customer reviews (denormalised for cards/listings). */
  @Column({ type: 'int', default: 0 })
  reviewsCount: number;

  /** Estimated delivery time in days. */
  @Column({ type: 'int', default: 3 })
  deliveryDays: number;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'live' })
  status: ProductStatus;

  @Index('IDX_products_seller')
  @Column({ type: 'varchar', nullable: true })
  sellerId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
