import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type FraudSignalKind = 'address_change' | 'device';

/**
 * A small fact the fraud rules count later: an address change while an order was still on its way (`address_change`,
 * key = the address id), or a device (`device`, key = a hash of its push token, never the token) that an account used.
 * One row per (user, kind, key) for devices; address changes are one row per change.
 */
@Index('IDX_fraud_signals_user_kind_created', ['userId', 'kind', 'createdAt'])
@Index('IDX_fraud_signals_kind_key', ['kind', 'key'])
@Entity('fraud_signals')
export class FraudSignal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @Column({ type: 'varchar', length: 16 })
  kind: FraudSignalKind;

  @Column({ type: 'varchar', length: 64 })
  key: string;

  @CreateDateColumn()
  createdAt: Date;
}
