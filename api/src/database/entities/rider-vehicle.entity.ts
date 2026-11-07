import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * The vehicle a rider works with: ONE row per rider (unique `riderId`). Staff (operations admins, and the supervisors and
 * managers of the rider's own warehouse) edit it; the rider only reads it. Dates are plain `YYYY-MM-DD` strings, so a day
 * never shifts with a time zone. Nothing here blocks a rider from working: an expired insurance is only a warning.
 */
@Index('UQ_rider_vehicles_rider', ['riderId'], { unique: true })
@Entity('rider_vehicles')
export class RiderVehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  riderId: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  model: string | null;

  /** `motorbike`, `scooter`, `bicycle`, `car`, `van`, `truck` or `other` (see `rider-compliance/rules.ts`). */
  @Column({ type: 'varchar', length: 20, nullable: true })
  type: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  plate: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  colour: string | null;

  @Column({ type: 'int', nullable: true })
  odometerKm: number | null;

  /** `petrol`, `diesel`, `electric`, `hybrid` or `none` (a bicycle). */
  @Column({ type: 'varchar', length: 20, nullable: true })
  fuel: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  insuranceValidUntil: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  lastServiceOn: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  nextServiceOn: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  updatedById: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  updatedByName: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
