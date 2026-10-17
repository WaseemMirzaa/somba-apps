import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { encryptedColumn } from '../../common/crypto/field-crypto';

export type SellerStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

@Entity('sellers')
export class Seller {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  /** Owning user account (nullable for seed-only demo stores). */
  @Column({ type: 'varchar', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: SellerStatus;

  @Column({ type: 'varchar', length: 20, default: 'bronze' })
  badge: 'gold' | 'silver' | 'bronze' | 'somba_assured';

  @Column({ type: 'float', default: 0 })
  rating: number;

  @Column({ type: 'int', default: 0 })
  productCount: number;

  /** Where riders collect this seller's parcels (encrypted at rest). */
  @Column({ type: 'text', nullable: true, transformer: encryptedColumn })
  pickupAddress: string | null;

  /** Subscription plan id (see the `sellerPlans` setting). 'free' = no paid plan. */
  @Column({ type: 'varchar', length: 30, default: 'free' })
  plan: string;

  /** When the paid plan lapses (null for free / never subscribed). */
  @Column({ type: 'datetime', nullable: true })
  planExpiresAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
