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

  /** The creator's role (customer, seller, rider…), so agents know who they are talking to. */
  @Column({ type: 'varchar', length: 40, default: 'customer' })
  role: string;

  /** The agent handling it (an admin account), if assigned. */
  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  assigneeId: string | null;

  @Column({ type: 'varchar', nullable: true })
  assigneeName: string | null;

  /** Messages the owner has not read yet (staff replies). */
  @Column({ type: 'int', default: 0 })
  userUnread: number;

  /** Messages the agents have not read yet (the owner's replies). */
  @Column({ type: 'int', default: 0 })
  staffUnread: number;

  /**
   * Served, never stored: the thread as a JSON array [{ id, from, role, text, at, attachments }] (rows of
   * `support_messages`), so clients keep reading `ticket.messages` as before.
   */
  messages: string = '[]';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
