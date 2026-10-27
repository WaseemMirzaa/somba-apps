import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A warehouse covers an area (a province, city, district, commune or quartier). One owner per area: `areaId` is unique.
 * The most specific covered area on the way up from an address decides its warehouse.
 */
@Index('IDX_hub_coverage_areaId', ['areaId'], { unique: true })
@Index('IDX_hub_coverage_hubId', ['hubId'])
@Entity('hub_coverage')
export class HubCoverage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  hubId: string;

  @Column({ type: 'varchar', length: 36 })
  areaId: string;

  /** When set, the delivery fee for addresses decided by this row is this flat amount (replaces base + per km). */
  @Column({ type: 'float', nullable: true })
  feeOverrideUsd: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
