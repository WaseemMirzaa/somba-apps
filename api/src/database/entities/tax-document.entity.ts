import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * The platform's commission invoice to one seller for one month. Generated on request from the delivered lines of
 * that month (so it can be re-issued: the same row is refreshed, the number never changes) and rendered to a PDF
 * under /uploads/invoices in the seller's language.
 */
@Index('UQ_tax_documents_seller_period', ['sellerId', 'period'], { unique: true })
@Entity('tax_documents')
export class TaxDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The seller's user id (the id payouts and statements use). */
  @Index('IDX_tax_documents_seller')
  @Column({ type: 'varchar', length: 36 })
  sellerId: string;

  /** The month, "YYYY-MM". */
  @Column({ type: 'varchar', length: 7 })
  period: string;

  /** Invoice number, e.g. "CI-202610-4F3A2B". */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 24 })
  number: string;

  @Column({ type: 'varchar', length: 5, default: 'en' })
  locale: string;

  @Column({ type: 'int', default: 0 })
  orders: number;

  @Column({ type: 'int', default: 0 })
  units: number;

  /** Sales of the month (after store coupons). */
  @Column({ type: 'float', default: 0 })
  grossUsd: number;

  /** What the platform charged: the invoice total. */
  @Column({ type: 'float', default: 0 })
  commissionUsd: number;

  /** Commission handed back on lines returned in the month. */
  @Column({ type: 'float', default: 0 })
  creditedUsd: number;

  @Column({ type: 'float', default: 0 })
  netUsd: number;

  /** Public URL of the PDF. */
  @Column({ type: 'varchar', length: 500 })
  url: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
