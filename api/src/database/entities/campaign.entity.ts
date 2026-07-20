import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type CampaignStatus =
  | 'draft'
  | 'pending'
  | 'scheduled'
  | 'active'
  | 'ended'
  | 'rejected';

/**
 * A seller marketing campaign (promoted products at a discount for a window).
 * Sellers create them; admins/marketing approve. Engagement metrics accrue as
 * shoppers view/click/convert on the promoted products.
 */
@Entity('campaigns')
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 24 })
  reference: string;

  @Index()
  @Column({ type: 'varchar', nullable: true })
  sellerId: string | null;

  @Column({ type: 'varchar', nullable: true })
  sellerName: string | null;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', nullable: true })
  nameFr: string | null;

  /** Percentage discount applied to the promoted products. */
  @Column({ type: 'int', default: 0 })
  discount: number;

  /** Number of products included in the campaign. */
  @Column({ type: 'int', default: 0 })
  productCount: number;

  @Column({ type: 'float', default: 0 })
  budgetUsd: number;

  @Column({ type: 'varchar', nullable: true })
  startDate: string | null;

  @Column({ type: 'varchar', nullable: true })
  endDate: string | null;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: CampaignStatus;

  // ── Engagement metrics ──
  @Column({ type: 'int', default: 0 })
  views: number;

  @Column({ type: 'int', default: 0 })
  clicks: number;

  @Column({ type: 'int', default: 0 })
  orders: number;

  @Column({ type: 'float', default: 0 })
  revenueUsd: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
