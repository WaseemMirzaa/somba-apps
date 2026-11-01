import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type ReviewReportStatus = 'open' | 'resolved';

/** A seller's report of a review to the moderators. One per seller and review. */
@Entity('review_reports')
@Index('IDX_review_reports_unique', ['reviewId', 'reporterId'], { unique: true })
export class ReviewReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  reviewId: string;

  @Column({ type: 'varchar', length: 36 })
  reporterId: string;

  @Column({ type: 'varchar', length: 100 })
  reporterName: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'varchar', length: 10, default: 'open' })
  status: ReviewReportStatus;

  @CreateDateColumn()
  createdAt: Date;
}
