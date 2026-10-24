import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type TranslationJobStatus = 'pending' | 'done' | 'failed';

/** The work queue behind machine translation, so a Google outage never blocks (or loses) a save. */
@Index('IDX_translation_jobs_unique', ['entityType', 'entityId'], { unique: true })
@Index('IDX_translation_jobs_due', ['status', 'nextAttemptAt'])
@Entity('translation_jobs')
export class TranslationJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 24 })
  entityType: string;

  @Column({ type: 'varchar', length: 36 })
  entityId: string;

  @Column({ type: 'varchar', length: 10, default: 'pending' })
  status: TranslationJobStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'datetime', nullable: true })
  nextAttemptAt: Date | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  lastError: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
