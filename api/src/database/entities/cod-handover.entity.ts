import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One receipt of a rider's COD cash at the warehouse (C-cod): who handed it in, who took it, how much and when. A
 * rider's balance is `sum(delivery_tasks.codCollectedUsd) - sum(delivery_tasks.codHandedOverUsd)`; each receipt spreads
 * its amount over the rider's oldest unsettled tasks, never past what a task collected. Rows are never edited or deleted.
 */
@Index('IDX_cod_handovers_riderId', ['riderId'])
@Index('IDX_cod_handovers_hubId', ['hubId'])
@Index('IDX_cod_handovers_clientRef', ['clientRef'], { unique: true })
@Entity('cod_handovers')
export class CodHandover {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  riderId: string;

  @Column({ type: 'varchar', length: 255 })
  riderName: string;

  /** The warehouse that took the cash (the receiver's, or the rider's home warehouse when an admin took it). */
  @Column({ type: 'varchar', length: 36, nullable: true })
  hubId: string | null;

  @Column({ type: 'double' })
  amountUsd: number;

  /** What the rider still held right before this receipt (so a statement reads: held, handed in, left). */
  @Column({ type: 'double' })
  heldBeforeUsd: number;

  @Column({ type: 'varchar', length: 36 })
  receivedById: string;

  @Column({ type: 'varchar', length: 255 })
  receivedByName: string;

  @Column({ type: 'varchar', length: 40 })
  receivedByRole: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  note: string | null;

  /** Idempotency key from the client: sending the same receipt twice (a double tap, a retry) records it once. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  clientRef: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
