import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type TicketStatus = 'open' | 'pending' | 'resolved' | 'closed';

@Entity('support_tickets')
export class SupportTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 24 })
  reference: string;

  @Index()
  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'varchar' })
  userName: string;

  @Column({ type: 'varchar' })
  subject: string;

  @Column({ type: 'varchar', default: 'general' })
  category: string;

  @Column({ type: 'varchar', nullable: true })
  orderId: string | null;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'open' })
  status: TicketStatus;

  /** Messages stored as a JSON array [{ from, role, text, at }]. */
  @Column({ type: 'text', default: '[]' })
  messages: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
