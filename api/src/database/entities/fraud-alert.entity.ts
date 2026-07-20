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
  type: string; // cod_risk | velocity | address_block | otp_fail

  @Column({ type: 'varchar', length: 10, default: 'medium' })
  severity: 'low' | 'medium' | 'high';

  @Column({ type: 'varchar' })
  customer: string;

  @Column({ type: 'varchar', nullable: true })
  orderId: string | null;

  @Column({ type: 'int', default: 50 })
  score: number;

  @Index()
  @Column({ type: 'varchar', length: 12, default: 'open' })
  status: FraudStatus;

  @CreateDateColumn()
  createdAt: Date;
}
