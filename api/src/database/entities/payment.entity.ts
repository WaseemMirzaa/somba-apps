import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { encryptedColumn } from '../../common/crypto/field-crypto';

export type PaymentPurpose = 'order' | 'topup';

export type PaymentStatus =
  | 'pending' // COD collected on delivery, or mobile money awaiting approval
  | 'succeeded'
  | 'failed'
  | 'refunded';

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

  /** What the money is for: an order, or a wallet top-up. */
  @Column({ type: 'varchar', length: 10, default: 'order' })
  purpose: PaymentPurpose;

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
