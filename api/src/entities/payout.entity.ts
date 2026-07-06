import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PayoutStatus } from '../common/enums';
import { numeric } from '../common/numeric.transformer';
import { Seller } from './seller.entity';

@Entity('payouts')
export class Payout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  reference: string;

  @ManyToOne(() => Seller, (seller) => seller.payouts, { onDelete: 'CASCADE', eager: true })
  @JoinColumn()
  seller: Seller;

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: numeric })
  amountUsd: number;

  @Column({ type: 'varchar', default: PayoutStatus.REQUESTED })
  status: PayoutStatus;

  @Column({ default: 'bank_transfer' })
  method: string;

  @Column({ type: 'text', nullable: true })
  note?: string;

  @Column({ nullable: true })
  processedBy?: string;

  @Column({ type: 'datetime', nullable: true })
  processedAt?: Date;

  @CreateDateColumn()
  requestedAt: Date;
}
