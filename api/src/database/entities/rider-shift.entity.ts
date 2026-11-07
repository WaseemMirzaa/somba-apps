import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** How a shift ended: the rider clocked out, or the server closed it after {@link MAX_SHIFT_HOURS} open hours. */
export type ShiftEndReason = 'rider' | 'auto';

/**
 * One working shift of a rider: clock-in, clock-out and the minutes spent on breaks. The shift is the rider's duty
 * state: a rider is "on shift" while a row of theirs has no `endedAt`. Rows are closed, never deleted.
 *
 * A rider has at most ONE open shift. `openRiderId` carries that rule into the database (C-shift-one-open): it holds the
 * rider's id while the shift is open and is NULL once it is closed, and it is UNIQUE (MySQL and SQLite both allow many
 * NULLs under a unique index), so two racing clock-ins cannot both succeed.
 */
@Index('IDX_rider_shifts_rider_started', ['riderId', 'startedAt'])
@Index('IDX_rider_shifts_hubId', ['hubId'])
@Index('UQ_rider_shifts_openRiderId', ['openRiderId'], { unique: true })
@Entity('rider_shifts')
export class RiderShift {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  riderId: string;

  /** The rider's home warehouse when the shift started (what a warehouse supervisor's view is scoped by). */
  @Column({ type: 'varchar', length: 36, nullable: true })
  hubId: string | null;

  /** = `riderId` while the shift is open, NULL once it is closed. Unique: one open shift per rider. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  openRiderId: string | null;

  @Column({ type: 'datetime' })
  startedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  endedAt: Date | null;

  /** Minutes of finished breaks (a break still running is `breakStartedAt`). */
  @Column({ type: 'int', default: 0 })
  breakMinutes: number;

  /** Set while the rider is on a break. */
  @Column({ type: 'datetime', nullable: true })
  breakStartedAt: Date | null;

  @Column({ type: 'varchar', length: 12, nullable: true })
  endReason: ShiftEndReason | null;

  @CreateDateColumn()
  createdAt: Date;
}
