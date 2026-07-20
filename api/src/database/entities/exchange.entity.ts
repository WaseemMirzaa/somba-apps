import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ExchangeStatus =
  | 'requested'
  | 'approved'
  | 'received'
  | 'ready'
  | 'dispatched'
  | 'rejected';

/**
 * An exchange of one purchased variant/product for another (e.g. a different
 * size). Any price difference is captured so finance can settle it.
 */
@Entity('exchanges')
export class Exchange {
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

  @Column({ type: 'varchar' })
  fromSku: string;

  @Column({ type: 'varchar' })
  fromName: string;

  @Column({ type: 'varchar' })
  toSku: string;

  @Column({ type: 'varchar' })
  toName: string;

  @Column({ type: 'float', default: 0 })
  priceDiffUsd: number;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'requested' })
  status: ExchangeStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
