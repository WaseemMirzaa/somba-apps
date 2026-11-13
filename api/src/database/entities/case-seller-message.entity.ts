import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type CaseKind = 'return' | 'exchange' | 'replacement';
export type CaseAuthorSide = 'seller' | 'support';

/**
 * One message in the PRIVATE thread between a store and KOMORIKO support about a return, exchange or replacement
 * (docs/contracts/admin-controls.md §13). The customer never reads it and it is separate from the customer <-> support
 * thread (`dispute_messages`). `textI18n` is not stored here: both languages live in the translation rows keyed by this
 * message's id (stored kind `case_seller_message`), like every other stored text.
 */
@Entity('case_seller_messages')
@Index('IDX_case_seller_messages_case', ['caseKind', 'caseId'])
export class CaseSellerMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 12 })
  caseKind: CaseKind;

  @Column({ type: 'varchar', length: 36 })
  caseId: string;

  @Column({ type: 'varchar', length: 36 })
  sellerId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  authorId: string | null;

  @Column({ type: 'varchar', length: 120, default: '' })
  authorName: string;

  @Column({ type: 'varchar', length: 10 })
  authorSide: CaseAuthorSide;

  @Column({ type: 'text' })
  text: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  readBySellerAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  readBySupportAt: Date | null;
}
