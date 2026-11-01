import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Who has read a role-wide notice (one row per person; user-addressed notices carry their own `read` flag). */
@Entity('notification_reads')
@Index('IDX_notification_reads_unique', ['notificationId', 'userId'], { unique: true })
export class NotificationRead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  notificationId: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @CreateDateColumn()
  createdAt: Date;
}
