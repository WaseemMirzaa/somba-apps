import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ReplacementStatus =
  | 'requested'
  | 'approved'
  | 'received'
  | 'allocated'
  | 'dispatched'
  | 'delivered'
  | 'rejected';

/**
 * A like-for-like replacement of a defective/returned item. Raised against an
 * order, inspected by the warehouse, then a fresh unit is allocated and
 * dispatched to the customer.
 */
@Entity('replacements')
export class Replacement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 24 })
  reference: string;

  @Index()
  @Column({ type: 'varchar' })
  orderId: string;

  @Column({ type: 'varchar' })
  orderReference: string;

  @Index()
  @Column({ type: 'varchar', nullable: true })
  customerId: string | null;

  @Column({ type: 'varchar' })
  customerName: string;

  @Column({ type: 'varchar', nullable: true })
  sellerId: string | null;

  @Column({ type: 'varchar' })
  sku: string;

  @Column({ type: 'varchar' })
  productName: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', nullable: true })
  condition: string | null;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'requested' })
  status: ReplacementStatus;

  @Column({ type: 'varchar', nullable: true })
  dispatchStatus: string | null;

  /** How many units to send (the units the customer is unhappy with). */
  @Column({ type: 'int', default: 1 })
  qty: number;

  /** The option label of the order line (so the same variant is sent). */
  @Column({ type: 'varchar', nullable: true })
  variant: string | null;

  /** Customer photos (upload URLs) as a JSON array. */
  @Column({ type: 'text', nullable: true })
  attachments: string | null;

  /** The seller must answer by then. */
  @Column({ type: 'datetime', nullable: true })
  sellerDueAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  sellerRespondedAt: Date | null;

  /** The seller's reason when they approve or reject. */
  @Column({ type: 'text', nullable: true })
  sellerReason: string | null;

  /** Units taken from the seller's stock for this replacement (0 until approved). */
  @Column({ type: 'int', default: 0 })
  stockTaken: number;

  /** The delivery task logistics created to bring the new unit (and collect the old one). */
  @Column({ type: 'varchar', nullable: true })
  deliveryTaskId: string | null;

  @Column({ type: 'datetime', nullable: true })
  deliveredAt: Date | null;

  /** The dispute that led to this replacement (admin decision), if any. */
  @Column({ type: 'varchar', nullable: true })
  disputeId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
