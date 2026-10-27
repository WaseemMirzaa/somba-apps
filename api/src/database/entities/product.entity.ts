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

/** A JSON list of strings kept in a text column; anything unreadable reads as []. */
const jsonList = {
  to: (v: string[] | null | undefined) => (v === undefined ? undefined : v && v.length ? JSON.stringify(v) : null),
  from: (v: string | null): string[] => {
    if (!v) return [];
    try {
      const a: unknown = JSON.parse(v);
      return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  },
};

/** Stock per option label, as JSON text with SORTED keys (so the text can be compared byte for byte). */
export function serializeVariantStock(v: Record<string, number> | null | undefined): string | null {
  if (!v) return null;
  const keys = Object.keys(v).sort();
  if (!keys.length) return null;
  return JSON.stringify(Object.fromEntries(keys.map((k) => [k, Math.trunc(Number(v[k]) || 0)])));
}

const variantStockColumn = {
  to: (v: Record<string, number> | null | undefined) => (v === undefined ? undefined : serializeVariantStock(v)),
  from: (v: string | null): Record<string, number> | null => {
    if (!v) return null;
    try {
      const o: unknown = JSON.parse(v);
      if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
      const out: Record<string, number> = {};
      for (const [k, n] of Object.entries(o as Record<string, unknown>)) out[k] = Math.max(0, Math.trunc(Number(n) || 0));
      return Object.keys(out).length ? out : null;
    } catch {
      return null;
    }
  },
};

@Index('IDX_products_status_seller', ['status', 'sellerId'])
@Index('UQ_products_seller_sku', ['sellerId', 'sku'], { unique: true })
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

  /** The cover image: always the first of `images` (kept for clients that only know one picture). */
  @Column({ type: 'varchar', nullable: true })
  image: string | null;

  /** The whole gallery (platform uploads or https URLs), cover first. Served as string[]. */
  @Column({ type: 'text', nullable: true, transformer: jsonList })
  images: string[];

  /** The seller's own stock code; unique among one seller's products (C-CM1). */
  @Column({ type: 'varchar', length: 60, nullable: true })
  sku: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  brand: string | null;

  /** Shipping weight in grams. */
  @Column({ type: 'int', nullable: true })
  weightGrams: number | null;

  /** Units on hand in total (every option together, plus any shared pool no option has claimed). */
  @Column({ type: 'int', default: 0 })
  stock: number;

  /**
   * Units set aside per option label ("Size: 42 · Colour: Black"). An option without an entry draws on the shared
   * pool `stock - sum(entries)`. null = stock is not split by option. See products/variant-stock.ts.
   */
  @Column({ type: 'text', nullable: true, transformer: variantStockColumn })
  variantStock: Record<string, number> | null;

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
