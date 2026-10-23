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

@Index('IDX_delivery_tasks_status', ['status'])
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

  /** The warehouse whose riders deliver this task (from the zone's warehouse; null = any rider). */
  @Index()
  @Column({ type: 'varchar', nullable: true })
  hubId: string | null;

  /** COD amount to collect (USD); 0 for prepaid. */
  @Column({ type: 'float', default: 0 })
  codAmountUsd: number;

  /** Live rider position, updated over the socket. */
  @Column({ type: 'float', nullable: true })
  lat: number | null;

  @Column({ type: 'float', nullable: true })
  lng: number | null;

  /** Which attempt this is (1 = first); a failed task is followed by a new one until the limit. */
  @Column({ type: 'int', default: 1 })
  attempts: number;

  /** Why the rider could not deliver (set when status = failed). */
  @Column({ type: 'varchar', length: 200, nullable: true })
  failureReason: string | null;

  /** Where the rider collects the parcel (seller / hub), encrypted at rest. */
  @Column({ type: 'text', nullable: true, transformer: encryptedColumn })
  pickupAddress: string | null;

  /** 4-digit code the customer gives the rider on handover (never sent to staff or riders). */
  @Column({ type: 'text', nullable: true, select: false, transformer: encryptedColumn })
  proofCode: string | null;

  /** The seller marked the parcel ready for pickup. */
  @Column({ type: 'datetime', nullable: true })
  readyAt: Date | null;

  /** The hub scanned the parcel in. */
  @Column({ type: 'datetime', nullable: true })
  receivedAt: Date | null;

  /** The rider collected the parcel (status picked_up). */
  @Column({ type: 'datetime', nullable: true })
  pickedUpAt: Date | null;

  /** The parcel was handed over to the customer (status delivered). */
  @Column({ type: 'datetime', nullable: true })
  deliveredAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
