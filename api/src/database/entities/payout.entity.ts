import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { encryptedColumn } from '../../common/crypto/field-crypto';

/** One step: requested → paid (or rejected). `sending` = a pawaPay transfer is on its way. */
export type PayoutStatus = 'requested' | 'sending' | 'rejected' | 'paid';

@Entity('payouts')
export class Payout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 24 })
  reference: string;

  @Index()
  @Column({ type: 'varchar' })
  sellerId: string;

  @Column({ type: 'varchar' })
  sellerName: string;

  @Column({ type: 'float' })
  amountUsd: number;

  @Column({ type: 'varchar', length: 20, default: 'bank' })
  method: string;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'requested' })
  status: PayoutStatus;

  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  /** Where to send the money (method, number/IBAN, holder) — encrypted at rest. */
  @Column({ type: 'text', nullable: true, transformer: encryptedColumn })
  account: string | null;

  /** Reference of the real transfer, entered by finance when marking it paid (the pawaPay payoutId when sent through pawaPay). */
  @Index()
  @Column({ type: 'varchar', length: 100, nullable: true })
  providerRef: string | null;

  /** The network's receipt number for a pawaPay payout. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  receiptRef: string | null;

  /** Settlement statement totals (null on payouts issued before statements existed). */
  @Column({ type: 'float', nullable: true })
  statementGrossUsd: number | null;

  @Column({ type: 'float', nullable: true })
  statementCommissionUsd: number | null;

  @Column({ type: 'float', nullable: true })
  statementRefundsUsd: number | null;

  @Column({ type: 'float', nullable: true })
  statementNetUsd: number | null;

  /** Balance carried in: available before this statement's new lines. */
  @Column({ type: 'float', nullable: true })
  openingBalanceUsd: number | null;

  /** Balance left after this payout: available - amountUsd. */
  @Column({ type: 'float', nullable: true })
  closingBalanceUsd: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
