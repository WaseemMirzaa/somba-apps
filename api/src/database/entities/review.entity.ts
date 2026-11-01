import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ReviewStatus = 'visible' | 'hidden';

@Entity('reviews')
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar' })
  productId: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'varchar' })
  author: string;

  @Column({ type: 'int', default: 5 })
  rating: number;

  @Column({ type: 'text' })
  text: string;

  /** How many shoppers found this review helpful. */
  @Column({ type: 'int', default: 0 })
  helpful: number;

  /** Moderation: hidden reviews are excluded from public lists and from the product rating. */
  @Column({ type: 'varchar', length: 10, default: 'visible' })
  status: ReviewStatus;

  /** The seller's public answer to the review. */
  @Column({ type: 'text', nullable: true })
  sellerReply: string | null;

  @Column({ type: 'datetime', nullable: true })
  sellerReplyAt: Date | null;

  /** How many open reports sellers filed against this review. */
  @Column({ type: 'int', default: 0 })
  reportCount: number;

  /** Why a moderator hid it (shown to the author and the seller). */
  @Column({ type: 'text', nullable: true })
  moderationReason: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
