import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('hubs')
export class Hub {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar' })
  city: string;

  @Column({ type: 'varchar', nullable: true })
  country: string | null;

  @Column({ type: 'int', default: 500 })
  capacity: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  address: string | null;

  /** Inactive hubs stay in the directory but cannot take new transfers or orders. */
  @Column({ type: 'boolean', default: true })
  active: boolean;

  /** Where the warehouse is (WGS84). Routing picks the nearest active warehouse that has riders. Null = not placed yet. */
  @Column({ type: 'double', nullable: true })
  lat: number | null;

  @Column({ type: 'double', nullable: true })
  lng: number | null;

  /** Where the warehouse is: its location area (usually a city or a commune). What it COVERS is in `hub_coverage`. */
  @Index('IDX_hubs_areaId')
  @Column({ type: 'varchar', length: 36, nullable: true })
  areaId: string | null;
}
