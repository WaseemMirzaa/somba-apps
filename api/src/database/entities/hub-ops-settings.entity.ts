import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * How one warehouse runs its floor (managers and admins edit it): working hours, the largest batch, whether new tasks
 * are given to a rider automatically, the ages at which an open parcel raises an alert, and the delivery-time target
 * the analytics measure against. A warehouse with no row uses the defaults in `logistics/hub-ops-rules.ts`.
 * Riders are salaried and never accept or refuse: auto-assignment assigns, exactly as a supervisor would.
 */
@Entity('hub_ops_settings')
export class HubOpsSettings {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  hubId: string;

  /** Working hours, "HH:MM" 24 h, in `timezone`; `workDays` are ISO weekdays (1 = Monday .. 7 = Sunday), comma-separated. */
  @Column({ type: 'varchar', length: 5, default: '08:00' })
  workStart: string;

  @Column({ type: 'varchar', length: 5, default: '18:00' })
  workEnd: string;

  @Column({ type: 'varchar', length: 20, default: '1,2,3,4,5,6' })
  workDays: string;

  /** IANA time zone the working hours are read in. */
  @Column({ type: 'varchar', length: 64, default: 'Africa/Kinshasa' })
  timezone: string;

  /** The most parcels one batch may hold at this warehouse. */
  @Column({ type: 'int', default: 20 })
  batchSize: number;

  @Column({ type: 'boolean', default: false })
  autoAssign: boolean;

  /** `least_busy`: the active rider of the warehouse with the fewest open tasks. */
  @Column({ type: 'varchar', length: 20, default: 'least_busy' })
  autoAssignRule: string;

  /** Hours an open parcel may wait before alert level 1, 2 and 3 (3 is the last: it escalates to the manager and admins). */
  @Column({ type: 'int', default: 24 })
  agedLevel1Hours: number;

  @Column({ type: 'int', default: 48 })
  agedLevel2Hours: number;

  @Column({ type: 'int', default: 72 })
  agedLevel3Hours: number;

  /** A customer delivery is on time when it is handed over within this many hours of opening at the warehouse. */
  @Column({ type: 'double', default: 24 })
  deliveryTargetHours: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  updatedById: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  updatedByName: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
