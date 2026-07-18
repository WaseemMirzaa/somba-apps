import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { encryptedColumn } from '../../common/crypto/field-crypto';

export type DeliveryStatus =
  | 'unassigned'
  | 'assigned'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'failed';

@Entity('delivery_tasks')
export class DeliveryTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar' })
  orderId: string;

  @Column({ type: 'varchar' })
  orderReference: string;

  @Index()
  @Column({ type: 'varchar', nullable: true })
  riderId: string | null;

  @Column({ type: 'varchar', length: 20, default: 'unassigned' })
  status: DeliveryStatus;

  /** Encrypted at rest — delivery address text. */
  @Column({ type: 'text', nullable: true, transformer: encryptedColumn })
  address: string | null;

  @Column({ type: 'varchar', nullable: true })
  zoneId: string | null;

  /** COD amount to collect (USD); 0 for prepaid. */
  @Column({ type: 'float', default: 0 })
  codAmountUsd: number;

  /** Live rider position, updated over the socket. */
  @Column({ type: 'float', nullable: true })
  lat: number | null;

  @Column({ type: 'float', nullable: true })
  lng: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
