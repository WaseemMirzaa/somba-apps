import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PromotionStatus, PromotionType } from '../common/enums';
import { numeric } from '../common/numeric.transformer';
import { Seller } from './seller.entity';

@Entity('promotions')
export class Promotion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Null seller ⇒ platform-wide flash sale (admin/marketing owned). */
  @ManyToOne(() => Seller, (seller) => seller.promotions, { nullable: true, onDelete: 'CASCADE', eager: true })
  @JoinColumn()
  seller?: Seller;

  @Column()
  title: string;

  @Column({ type: 'varchar', default: PromotionType.PERCENT })
  type: PromotionType;

  /** Percent (0–100) or flat USD depending on `type`. */
  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: numeric })
  value: number;

  @Column({ type: 'varchar', default: PromotionStatus.SCHEDULED })
  status: PromotionStatus;

  @Column({ type: 'simple-array', nullable: true })
  productIds?: string[];

  @Column({ nullable: true })
  bannerUrl?: string;

  @Column({ type: 'datetime' })
  startsAt: Date;

  @Column({ type: 'datetime' })
  endsAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
