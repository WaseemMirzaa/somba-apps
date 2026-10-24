import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Target user (null = broadcast to a whole role). */
  @Index()
  @Column({ type: 'varchar', nullable: true })
  userId: string | null;

  /** Target role room (e.g. 'admin', 'rider') for broadcasts. */
  @Column({ type: 'varchar', nullable: true })
  role: string | null;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'text' })
  body: string;

  // An authored French version (a marketing broadcast) is a `translations` row (entityType 'notification',
  // field title / body, locale fr, origin author); server notices are translated on read (notifications/localize.ts).

  /** Free-form category: order, payout, dispute, delivery, system… */
  @Column({ type: 'varchar', default: 'system' })
  type: string;

  /** Optional deep-link target, e.g. an order id. */
  @Column({ type: 'varchar', nullable: true })
  entityId: string | null;

  @Column({ type: 'boolean', default: false })
  read: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
