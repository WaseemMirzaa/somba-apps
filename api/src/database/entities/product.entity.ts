import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

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

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', nullable: true })
  nameFr: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Price in USD. */
  @Column({ type: 'float' })
  price: number;

  /** Pre-discount reference price (for the struck-through UI price). */
  @Column({ type: 'float', nullable: true })
  originalPrice: number | null;

  /** Percentage discount shown on cards. */
  @Column({ type: 'int', default: 0 })
  discount: number;

  @Index()
  @Column({ type: 'varchar' })
  category: string;

  @Column({ type: 'varchar', nullable: true })
  categoryFr: string | null;

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

  @Column({ type: 'varchar', nullable: true })
  sellerName: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
