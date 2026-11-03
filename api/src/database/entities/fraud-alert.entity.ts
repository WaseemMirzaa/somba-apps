import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type FraudStatus = 'open' | 'reviewed' | 'blocked';

@Entity('fraud_alerts')
export class FraudAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  /** cod_risk | failed_payments | new_account_orders | shared_identity | return_rate | address_changes (older rows: velocity | address_block | otp_fail). */
  type: string;

  @Column({ type: 'varchar', length: 10, default: 'medium' })
  severity: 'low' | 'medium' | 'high';

  @Column({ type: 'varchar' })
  customer: string;

  @Column({ type: 'varchar', nullable: true })
  orderId: string | null;

  /** The account the alert is about (rules that have no order, and every new alert). Null on rows from before it existed. */
  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  customerId: string | null;

  /** Why the alert was raised, in plain English and in French: the numbers and the limit that were crossed. */
  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'text', nullable: true })
  reasonFr: string | null;

  /** `type:customerId:YYYY-MM-DD` (UTC): one alert per rule per customer per day. Null for alerts that are per order (COD). */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 96, nullable: true })
  dedupeKey: string | null;

  @Column({ type: 'int', default: 50 })
  score: number;

  @Index()
  @Column({ type: 'varchar', length: 12, default: 'open' })
  status: FraudStatus;

  @CreateDateColumn()
  createdAt: Date;
}
