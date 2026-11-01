import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type ChatSide = 'buyer' | 'seller';

@Index('IDX_conversation_messages_thread', ['conversationId', 'createdAt'])
@Entity('conversation_messages')
export class ConversationMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  conversationId: string;

  /** The account that wrote it (a team member's own id, not the owner's). */
  @Column({ type: 'varchar', length: 36 })
  senderId: string;

  @Column({ type: 'varchar', length: 10 })
  senderSide: ChatSide;

  @Column({ type: 'varchar', length: 100 })
  senderName: string;

  @Column({ type: 'text' })
  text: string;

  /** JSON array (string) of platform image URLs (`POST /api/v1/uploads`), max 4. */
  @Column({ type: 'text', nullable: true })
  attachments: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
