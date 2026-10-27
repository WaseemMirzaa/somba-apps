import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** The thread under a dispute or return: customer, seller and Somba staff. */
@Entity('dispute_messages')
export class DisputeMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  disputeId: string;

  @Column({ type: 'varchar' })
  authorId: string;

  /** Display name (first name only for customers). */
  @Column({ type: 'varchar' })
  authorName: string;

  @Column({ type: 'varchar', length: 40 })
  role: string;

  @Column({ type: 'text' })
  text: string;

  /** Upload URLs as a JSON array. */
  @Column({ type: 'text', nullable: true })
  attachments: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
