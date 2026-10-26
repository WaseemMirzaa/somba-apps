import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * A link a truck or driver actually runs between two warehouses (one direction; a two-way link is two rows).
 * Parcels travel between warehouses along the shortest chain of active lanes, by transit time. See docs/contracts/areas.md.
 */
@Index('IDX_hub_lanes_pair', ['fromHubId', 'toHubId'], { unique: true })
@Index('IDX_hub_lanes_toHubId', ['toHubId'])
@Entity('hub_lanes')
export class HubLane {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  fromHubId: string;

  @Column({ type: 'varchar', length: 36 })
  toHubId: string;

  /** How long the trip takes (hours). The route with the least total transit wins, and the estimate adds it. */
  @Column({ type: 'float' })
  transitHours: number;

  /** What one parcel pays for this hop; null = the `deliveryTransferUsd` setting. */
  @Column({ type: 'float', nullable: true })
  costUsd: number | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
