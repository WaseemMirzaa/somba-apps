import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SellerBadge, SellerStatus } from '../common/enums';
import { numeric } from '../common/numeric.transformer';
import { User } from './user.entity';
import { Product } from './product.entity';
import { Payout } from './payout.entity';
import { Promotion } from './promotion.entity';

@Entity('sellers')
export class Seller {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, (user) => user.seller, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column()
  storeName: string;

  @Index({ unique: true })
  @Column()
  slug: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', default: SellerStatus.PENDING })
  status: SellerStatus;

  @Column({ type: 'varchar', default: SellerBadge.BRONZE })
  badge: SellerBadge;

  /** Category-tiered commission override for this seller (percent). */
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 12, transformer: numeric })
  commissionRate: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0, transformer: numeric })
  rating: number;

  @Column({ type: 'int', default: 100 })
  healthScore: number;

  @Column({ nullable: true })
  logoUrl?: string;

  @Column({ nullable: true })
  city?: string;

  @Column({ nullable: true })
  phone?: string;

  /** Available (payable) balance in USD. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0, transformer: numeric })
  balanceUsd: number;

  @Column({ default: true })
  subscriptionActive: boolean;

  @OneToMany(() => Product, (product) => product.seller)
  products: Product[];

  @OneToMany(() => Payout, (payout) => payout.seller)
  payouts: Payout[];

  @OneToMany(() => Promotion, (promo) => promo.seller)
  promotions: Promotion[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
