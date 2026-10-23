import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { encryptedColumn } from '../../common/crypto/field-crypto';

export type PaymentPurpose = 'order' | 'topup' | 'plan';

export type PaymentStatus =
  | 'pending' // COD collected on delivery, or mobile money awaiting approval
  | 'succeeded'
  | 'failed'
  | 'refunded';

@Index('IDX_payments_status_created', ['status', 'createdAt'])
@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 24 })
  reference: string;

  /** null for wallet top-ups, which have no order. */
  @Index()
  @Column({ type: 'varchar', nullable: true })
  orderId: string | null;

  @Column({ type: 'varchar', nullable: true })
  orderReference: string | null;

  /** What the money is for: an order, a wallet top-up, or a seller plan ('plan'). */
  @Column({ type: 'varchar', length: 10, default: 'order' })
  purpose: PaymentPurpose;

  /** For purpose 'plan': the plan id being bought. */
  @Column({ type: 'varchar', length: 60, nullable: true })
  subject: string | null;

  /** The mobile-money aggregator's own transaction id (for reconciliation). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  providerRef: string | null;

  /** Subscriber number that approves the charge. Encrypted at rest. */
  @Column({ type: 'text', nullable: true, transformer: encryptedColumn })
  phone: string | null;

  @Index()
  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'varchar', length: 20 })
  method: string; // stripe_card | cod | airtel_money | wallet

  @Column({ type: 'float' })
  amountUsd: number;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: PaymentStatus;

  @Column({ type: 'varchar', nullable: true })
  failureReason: string | null;

  /** Where a refund went: the customer's wallet, or back to the paying phone (pawaPay). */
  @Column({ type: 'varchar', length: 10, nullable: true })
  refundTo: 'wallet' | 'phone' | null;

  /** pawaPay refundId of a phone refund. */
  @Index()
  @Column({ type: 'varchar', length: 100, nullable: true })
  refundRef: string | null;

  /** sending (phone refund in flight) | completed | failed (then credited to the wallet). */
  @Column({ type: 'varchar', length: 20, nullable: true })
  refundStatus: 'sending' | 'completed' | 'failed' | null;

  /** What was actually paid back (lines refunded earlier by a seller are not paid twice). */
  @Column({ type: 'float', nullable: true })
  refundedUsd: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
