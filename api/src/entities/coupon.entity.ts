import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numeric } from '../common/numeric.transformer';

/**
 * A customer-facing promo/coupon code (mirrors the app `Promo` model).
 * Either `percentOff` (0–100) or `amountOffUsd` applies once the subtotal
 * meets `minOrderUsd`.
 */
@Entity('coupons')
export class Coupon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  code: string;

  @Column()
  description: string;

  @Column({ nullable: true })
  descriptionFr?: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0, transformer: numeric })
  minOrderUsd: number;

  /** Percent discount 0–100 (null when a flat amount applies). */
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true, transformer: numeric })
  percentOff?: number;

  /** Flat USD discount (null when a percent applies). */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: numeric })
  amountOffUsd?: number;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
