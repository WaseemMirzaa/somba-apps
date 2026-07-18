import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type WalletTxType =
  | 'credit'
  | 'debit'
  | 'cashback'
  | 'refund'
  | 'topup';

@Entity('wallet_transactions')
export class WalletTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'varchar', length: 20 })
  type: WalletTxType;

  @Column({ type: 'float' })
  amount: number;

  /** Running balance after this transaction. */
  @Column({ type: 'float' })
  balance: number;

  @Column({ type: 'varchar' })
  description: string;

  @CreateDateColumn()
  createdAt: Date;
}
