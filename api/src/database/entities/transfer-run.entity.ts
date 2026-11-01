import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type TransferRunStatus = 'planned' | 'dispatched' | 'arrived' | 'closed';

/**
 * One trip between two warehouses carrying many parcels (a manifest): "Run TR-0042 · Entrepôt Kinshasa -> Entrepôt Limete
 * · 18 parcels". Its parcels are transfer legs (`delivery_tasks.runId`).
 */
@Index('IDX_transfer_runs_reference', ['reference'], { unique: true })
@Index('IDX_transfer_runs_fromHubId', ['fromHubId'])
@Index('IDX_transfer_runs_toHubId', ['toHubId'])
@Index('IDX_transfer_runs_riderId', ['riderId'])
@Entity('transfer_runs')
export class TransferRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** TR-0042 */
  @Column({ type: 'varchar', length: 20 })
  reference: string;

  @Column({ type: 'varchar', length: 36 })
  fromHubId: string;

  @Column({ type: 'varchar', length: 36 })
  toHubId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  riderId: string | null;

  @Column({ type: 'varchar', length: 12, default: 'planned' })
  status: TransferRunStatus;

  /** Who made the run (a staff member or an admin). */
  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById: string | null;

  @Column({ type: 'datetime', nullable: true })
  dispatchedAt: Date | null;

  /** The driver reported the run on the road. */
  @Column({ type: 'datetime', nullable: true })
  inTransitAt: Date | null;

  /** The first parcel was scanned in at the receiving warehouse. */
  @Column({ type: 'datetime', nullable: true })
  arrivedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  closedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
