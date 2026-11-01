import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A customer <-> seller chat. One conversation per (customer, store, context): the context is a product, an order,
 * or neither (`contextKey` = 'p:<id>' | 'o:<id>' | ''), so asking about two products opens two threads.
 * Unread counters are per SIDE: the seller side is shared by the owner and the team members allowed to answer.
 */
@Index('IDX_conversations_unique', ['buyerId', 'sellerId', 'contextKey'], { unique: true })
@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_conversations_buyer')
  @Column({ type: 'varchar', length: 36 })
  buyerId: string;

  @Column({ type: 'varchar', length: 100 })
  buyerName: string;

  @Index('IDX_conversations_seller')
  @Column({ type: 'varchar', length: 36 })
  sellerId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  productId: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  orderId: string | null;

  @Column({ type: 'varchar', length: 80, default: '' })
  contextKey: string;

  @Column({ type: 'datetime', nullable: true })
  lastMessageAt: Date | null;

  @Column({ type: 'varchar', length: 200, default: '' })
  lastMessagePreview: string;

  @Column({ type: 'int', default: 0 })
  buyerUnread: number;

  @Column({ type: 'int', default: 0 })
  sellerUnread: number;

  @CreateDateColumn()
  createdAt: Date;
}
