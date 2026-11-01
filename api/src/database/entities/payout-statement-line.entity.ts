import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type StatementLineKind = 'sale' | 'refund';

/**
 * One line of a payout's settlement statement: a delivered sale (net of the
 * commission stored on the order line) or the clawback of a sale settled on an
 * earlier statement whose order was later returned. A rejected payout's lines
 * are kept for history but no longer count as settled.
 */
@Entity('payout_statement_lines')
export class PayoutStatementLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_payout_statement_lines_payout')
  @Column({ type: 'varchar', length: 36 })
  payoutId: string;

  @Column({ type: 'varchar' })
  sellerId: string;

  @Index('IDX_payout_statement_lines_item')
  @Column({ type: 'varchar', length: 36 })
  orderItemId: string;

  @Column({ type: 'varchar', length: 36 })
  orderId: string;

  @Column({ type: 'varchar' })
  orderReference: string;

  @Column({ type: 'varchar' })
  productName: string;

  @Column({ type: 'varchar' })
  variant: string;

  @Column({ type: 'int' })
  qty: number;

  /** 'sale' | 'refund' */
  @Column({ type: 'varchar', length: 10 })
  kind: StatementLineKind;

  @Column({ type: 'float' })
  grossUsd: number;

  @Column({ type: 'float' })
  commissionPct: number;

  @Column({ type: 'float' })
  commissionUsd: number;

  @Column({ type: 'float', default: 0 })
  refundUsd: number;

  @Column({ type: 'float' })
  netUsd: number;

  @Column({ type: 'datetime', nullable: true })
  deliveredAt: Date | null;

  /** Set when the payout this line belongs to is paid (a rejected payout never sets it). */
  @Column({ type: 'datetime', nullable: true })
  paidOutAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
