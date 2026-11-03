import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One alert level raised for one open parcel (task). The unique (taskId, level) index is what makes the scheduled
 * job idempotent: a level is claimed by inserting its row, so a second run, a second API instance or a restart never
 * alerts the same parcel at the same level twice.
 */
@Index('UQ_aged_alerts_task_level', ['taskId', 'level'], { unique: true })
@Entity('aged_alerts')
export class AgedAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  taskId: string;

  @Index('IDX_aged_alerts_hubId')
  @Column({ type: 'varchar', length: 36, nullable: true })
  hubId: string | null;

  /** 1 .. 3; the last level escalated to the manager and the admins. */
  @Column({ type: 'int' })
  level: number;

  @Column({ type: 'double' })
  ageHours: number;

  /** How many people were told (0 for a level skipped because a later one was already due when the job first saw the parcel). */
  @Column({ type: 'int', default: 0 })
  notified: number;

  @CreateDateColumn()
  createdAt: Date;
}
