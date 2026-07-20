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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
