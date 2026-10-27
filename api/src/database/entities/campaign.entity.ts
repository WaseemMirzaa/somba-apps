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

  @Column({ type: 'varchar' })
  name: string;

  /** Language `name` was written in; the other language is a `translations` row. */
  @Column({ type: 'varchar', length: 5, default: 'en' })
  sourceLang: string;

  /** Percentage discount applied to the promoted products. */
  @Column({ type: 'int', default: 0 })
  discount: number;

  /**
   * Ids of the products the discount applies to. Empty = every product of the
   * campaign's seller store. Stored as JSON text, exposed as string[].
   */
  @Column({
    type: 'text',
    nullable: true,
    transformer: {
      to: (v: string[] | null | undefined) => (v == null ? null : JSON.stringify(v)),
      from: (v: string | null) => {
        if (!v) return [] as string[];
        try {
          const a: unknown = JSON.parse(v);
          return Array.isArray(a) ? a.map(String) : [];
        } catch {
          return [];
        }
      },
    },
  })
  productIds: string[] | null;

  /** Number of products included in the campaign. */
  @Column({ type: 'int', default: 0 })
  productCount: number;

  /** Most the campaign may give away in discounts (0 = no limit). Reaching it ends the campaign. */
  @Column({ type: 'float', default: 0 })
  budgetUsd: number;

  /** Discount given so far on orders (list price minus the campaign price). */
  @Column({ type: 'float', default: 0 })
  spentUsd: number;

  /** Why marketing rejected it (shown to the seller). */
  @Column({ type: 'varchar', length: 300, nullable: true })
  rejectReason: string | null;

  /** Why it ended: 'dates' | 'budget' | 'withdrawn' | 'admin'. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  endedReason: string | null;

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
