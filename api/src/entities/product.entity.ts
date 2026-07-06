import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProductStatus } from '../common/enums';
import { numeric } from '../common/numeric.transformer';
import { Seller } from './seller.entity';
import { Category } from './category.entity';
import { ProductImage } from './product-image.entity';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Seller, (seller) => seller.products, { onDelete: 'CASCADE', eager: true })
  @JoinColumn()
  seller: Seller;

  @ManyToOne(() => Category, (category) => category.products, { nullable: true, eager: true })
  @JoinColumn()
  category?: Category;

  @Column()
  name: string;

  @Column({ nullable: true })
  nameFr?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'text', nullable: true })
  descriptionFr?: string;

  @Index({ unique: true })
  @Column()
  sku: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: numeric })
  price: number;

  /** Optional promotional price (<= price). */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: numeric })
  discountPrice?: number;

  /** Manufacturer's list price (strikethrough). */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: numeric })
  mrp?: number;

  @Column({ type: 'int', default: 0 })
  stock: number;

  @Column({ type: 'varchar', default: ProductStatus.DRAFT })
  status: ProductStatus;

  @Column({ type: 'text', nullable: true })
  rejectionReason?: string;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0, transformer: numeric })
  rating: number;

  /** Number of published reviews (denormalised for fast catalog rendering). */
  @Column({ type: 'int', default: 0 })
  reviewCount: number;

  @Column({ type: 'int', default: 0 })
  sold: number;

  /**
   * Bilingual spec sheet: `[{ label, labelFr, value, valueFr }]`.
   * Replaces the app's hardcoded `specsFor()` mock.
   */
  @Column({ type: 'simple-json', nullable: true })
  specs?: Array<{ label: string; labelFr?: string; value: string; valueFr?: string }>;

  @OneToMany(() => ProductImage, (img) => img.product, { cascade: true, eager: true })
  images: ProductImage[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
