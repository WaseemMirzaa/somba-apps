import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DisputeStatus } from '../common/enums';
import { numeric } from '../common/numeric.transformer';
import { Seller } from './seller.entity';
import { Order } from './order.entity';

@Entity('disputes')
export class Dispute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  code: string;

  @ManyToOne(() => Order, { nullable: true, onDelete: 'SET NULL', eager: true })
  @JoinColumn()
  order?: Order;

  @ManyToOne(() => Seller, { nullable: true, eager: true })
  @JoinColumn()
  seller?: Seller;

  @Column()
  customerName: string;

  @Column()
  reason: string;

  @Column({ type: 'text', nullable: true })
  detail?: string;

  @Column({ type: 'varchar', default: DisputeStatus.OPEN })
  status: DisputeStatus;

  @Column({ type: 'text', nullable: true })
  resolution?: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0, transformer: numeric })
  amountUsd: number;

  @Column({ type: 'simple-array', nullable: true })
  evidenceUrls?: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
