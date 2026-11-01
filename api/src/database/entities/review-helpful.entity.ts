import { CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Column } from 'typeorm';

/** Who found which review helpful: one vote per user and review. */
@Entity('review_helpful')
@Index('IDX_review_helpful_unique', ['reviewId', 'userId'], { unique: true })
export class ReviewHelpful {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  reviewId: string;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @CreateDateColumn()
  createdAt: Date;
}
