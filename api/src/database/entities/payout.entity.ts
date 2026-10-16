import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { encryptedColumn } from '../../common/crypto/field-crypto';

export type PayoutStatus = 'requested' | 'approved' | 'rejected' | 'paid';

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

  /** Reference of the real transfer, entered by finance when marking it paid. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  providerRef: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
