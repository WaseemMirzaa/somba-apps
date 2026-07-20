import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ExceptionType =
  | 'damaged'
  | 'missing_item'
  | 'wrong_item'
  | 'address_issue'
  | 'lost'
  | 'other';
export type ExceptionSeverity = 'low' | 'medium' | 'high';
export type ExceptionStatus = 'open' | 'investigating' | 'resolved' | 'escalated';

/**
 * A warehouse/logistics incident raised against a parcel (delivery task) —
 * damage, a missing/wrong item, an address problem. Ops triage and resolve it.
 */
@Entity('warehouse_exceptions')
export class WarehouseException {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 24 })
  reference: string;

  @Index()
  @Column({ type: 'varchar', nullable: true })
  taskId: string | null;

  @Column({ type: 'varchar', nullable: true })
  orderReference: string | null;

  @Column({ type: 'varchar', length: 20, default: 'other' })
  type: ExceptionType;

  @Column({ type: 'varchar', length: 10, default: 'medium' })
  severity: ExceptionSeverity;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'open' })
  status: ExceptionStatus;

  @Column({ type: 'varchar', nullable: true })
  hub: string | null;

  @Column({ type: 'text' })
  notes: string;

  @Column({ type: 'text', nullable: true })
  resolution: string | null;

  @Column({ type: 'varchar', nullable: true })
  raisedBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
