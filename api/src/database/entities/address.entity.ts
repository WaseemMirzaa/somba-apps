import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { encryptedColumn } from '../../common/crypto/field-crypto';

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

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
