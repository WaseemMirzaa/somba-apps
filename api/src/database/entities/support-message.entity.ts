import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** One message of a support ticket. Rows, not a JSON blob, so two people replying at once never lose each other's. */
@Entity('support_messages')
export class SupportMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  ticketId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  fromId: string | null;

  @Column({ type: 'varchar' })
  from: string;

  /** The sender's real role (customer, seller, rider, admin_support…). */
  @Column({ type: 'varchar', length: 40 })
  role: string;

  @Column({ type: 'text' })
  text: string;

  /** Photo URLs (uploads) as a JSON array. */
  @Column({ type: 'text', nullable: true })
  attachments: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
