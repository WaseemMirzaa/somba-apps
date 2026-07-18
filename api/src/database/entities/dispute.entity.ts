import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type DisputeType = 'dispute' | 'return';
export type DisputeStatus = 'open' | 'resolved' | 'rejected';

@Entity('disputes')
export class Dispute {
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
  @Column({ type: 'varchar' })
  customerId: string;

  @Column({ type: 'varchar' })
  customerName: string;

  @Column({ type: 'varchar', length: 20, default: 'dispute' })
  type: DisputeType;

  @Column({ type: 'text' })
  reason: string;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'open' })
  status: DisputeStatus;

  @Column({ type: 'text', nullable: true })
  resolution: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
