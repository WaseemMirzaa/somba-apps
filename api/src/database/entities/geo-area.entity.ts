import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type AreaLevel = 'country' | 'province' | 'city' | 'district' | 'commune' | 'quartier';

/**
 * One place in the delivery geography: country -> province -> city -> district -> commune -> quartier.
 * Warehouses cover areas (`hub_coverage`); addresses, sellers and orders point at the most specific area they know.
 * See docs/contracts/areas.md.
 */
@Index('IDX_geo_areas_code', ['code'], { unique: true })
@Index('IDX_geo_areas_parentId', ['parentId'])
@Index('IDX_geo_areas_path', ['path'])
@Entity('geo_areas')
export class GeoArea {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stable code: ISO 3166-2 for provinces (`CD-KN`), internal codes below (`CD-KN-KIN`, `CD-KN-LIM`). */
  @Column({ type: 'varchar', length: 64 })
  code: string;

  @Column({ type: 'varchar', length: 12 })
  level: AreaLevel;

  /** Official name (French). */
  @Column({ type: 'varchar', length: 150 })
  name: string;

  /** English name when it differs (null = same as `name`). */
  @Column({ type: 'varchar', length: 150, nullable: true })
  nameEn: string | null;

  /** The exact spelling Google Geocoding returns with `language=fr`. */
  @Column({ type: 'varchar', length: 150 })
  googleName: string;

  /** The exact spelling Google Geocoding returns with `language=en` (= `googleName` when the same). */
  @Column({ type: 'varchar', length: 150 })
  googleNameEn: string;

  /** Other spellings people type; used for matching only. */
  @Column({ type: 'simple-json', nullable: true })
  aliases: string[] | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  parentId: string | null;

  /** Codes from the country down to this area, joined by `/`. */
  @Column({ type: 'varchar', length: 255 })
  path: string;

  /** country 0, province 1, city 2, district 3, commune 4, quartier 5 (a level is skipped when a city has no districts). */
  @Column({ type: 'int', default: 0 })
  depth: number;

  @Column({ type: 'double', nullable: true })
  lat: number | null;

  @Column({ type: 'double', nullable: true })
  lng: number | null;

  /** false = hidden from the pickers (it still routes). */
  @Column({ type: 'boolean', default: true })
  active: boolean;

  /** Facts that do not drive routing: a city's status (`official` | `decree-2013`), a commune's population and surface… */
  @Column({ type: 'simple-json', nullable: true })
  meta: Record<string, unknown> | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
