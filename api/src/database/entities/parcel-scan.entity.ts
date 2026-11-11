import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type ParcelScanStage = 'pickup' | 'dropoff';

/**
 * One scan of one parcel on one leg: `pickup` = the rider collected it (at the seller, the customer or a warehouse),
 * `dropoff` = it was handed over (at a warehouse or to the customer). A scan is recorded once per (parcel, leg, stage):
 * a repeat of the same scan is idempotent. `manual` = the code was typed instead of read by the camera; `reason` is set
 * when warehouse staff marked the parcel by hand (damaged label).
 */
@Index('UQ_parcel_scans_parcel_task_stage', ['parcelId', 'taskId', 'stage'], { unique: true })
@Index('IDX_parcel_scans_taskId', ['taskId'])
@Entity('parcel_scans')
export class ParcelScan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  parcelId: string;

  /** The leg (delivery task) the scan belongs to. */
  @Column({ type: 'varchar', length: 36 })
  taskId: string;

  @Column({ type: 'varchar', length: 8 })
  stage: ParcelScanStage;

  @Column({ type: 'varchar', length: 36, nullable: true })
  actorId: string | null;

  @Column({ type: 'varchar', length: 40 })
  actorRole: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  hubId: string | null;

  @Column({ type: 'datetime' })
  at: Date;

  @Column({ type: 'boolean', default: false })
  manual: boolean;

  /** Why staff marked it by hand (null for a real scan). */
  @Column({ type: 'varchar', length: 200, nullable: true })
  reason: string | null;
}
