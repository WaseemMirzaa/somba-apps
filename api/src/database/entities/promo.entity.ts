import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('promos')
export class Promo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 40 })
  code: string;

  @Column({ type: 'varchar', length: 20, default: 'percent' })
  type: 'percent' | 'fixed';

  @Column({ type: 'float' })
  value: number;

  @Column({ type: 'float', default: 0 })
  minOrder: number;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  /** Total redemptions allowed across all customers (null = unlimited). */
  @Column({ type: 'int', nullable: true })
  maxUses: number | null;

  /** Redemptions allowed per customer (null = unlimited). */
  @Column({ type: 'int', nullable: true })
  perUserLimit: number | null;

  /** After this moment the code stops working (null = never). */
  @Column({ type: 'datetime', nullable: true })
  expiresAt: Date | null;

  /** Listed in the app's Coupons screen? Private codes are handed out directly. */
  @Column({ type: 'boolean', default: true })
  isPublic: boolean;

  /**
   * The store that issued the coupon (null = a platform code). A store coupon discounts only that store's lines
   * and the store pays for it (it comes off the seller's earnings, see order_items.couponDiscountUsd).
   */
  @Index('IDX_promos_seller')
  @Column({ type: 'varchar', length: 36, nullable: true })
  sellerId: string | null;
}
