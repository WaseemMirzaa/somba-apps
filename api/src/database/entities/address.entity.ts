import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { encryptedColumn, encryptedJsonColumn } from '../../common/crypto/field-crypto';

/** Map pin picked by the customer (Google Maps). Stored encrypted: it is a precise home location. */
export interface AddressGeo {
  lat: number;
  lng: number;
  placeId?: string;
  formatted?: string;
}

/** A customer delivery address. PII fields are encrypted at rest. */
@Entity('addresses')
export class Address {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'varchar' })
  label: string;

  @Column({ type: 'text', transformer: encryptedColumn })
  line1: string;

  @Column({ type: 'text', nullable: true, transformer: encryptedColumn })
  line2: string | null;

  @Column({ type: 'varchar' })
  city: string;

  @Column({ type: 'varchar', nullable: true })
  commune: string | null;

  @Column({ type: 'varchar', nullable: true })
  region: string | null;

  @Column({ type: 'varchar', nullable: true })
  country: string | null;

  @Column({ type: 'varchar', nullable: true })
  postalCode: string | null;

  @Column({ type: 'text', nullable: true, transformer: encryptedColumn })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  zoneId: string | null;

  @Column({ type: 'text', nullable: true, transformer: encryptedJsonColumn })
  geo: AddressGeo | null;

  /** The most specific delivery area this address is in (a quartier, commune, city…). Decides the warehouse. */
  @Index('IDX_addresses_areaId')
  @Column({ type: 'varchar', length: 36, nullable: true })
  areaId: string | null;

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
