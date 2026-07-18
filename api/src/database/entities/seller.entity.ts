import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

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

  @CreateDateColumn()
  createdAt: Date;
}
