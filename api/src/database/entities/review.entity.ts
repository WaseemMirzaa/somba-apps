import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ReviewStatus = 'visible' | 'hidden';

/** Review photos are stored as a JSON list of upload URLs in one text column and read back as an array. */
export const photoList = {
  to: (v: string[] | null | undefined): string | null => (Array.isArray(v) && v.length ? JSON.stringify(v) : null),
  from: (v: string | null | undefined): string[] => {
    if (!v) return [];
    try {
      const x = JSON.parse(v);
      return Array.isArray(x) ? x.filter((u) => typeof u === 'string') : [];
    } catch {
      return [];
    }
  },
};

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

  /** Up to 4 photos the customer attached (upload URLs). Hidden together with the review. */
  @Column({ type: 'text', nullable: true, transformer: photoList })
  photos: string[];

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
