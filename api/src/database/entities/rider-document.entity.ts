import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { encryptedColumn } from '../../common/crypto/field-crypto';

export type RiderDocumentStatus = 'pending' | 'approved' | 'rejected';

/**
 * A compliance document of a rider (driver licence, vehicle insurance, vehicle registration, ID, other). The scan is a
 * PRIVATE file (`private_files`, never under the public /uploads folder); the row keeps its id. A document starts
 * `pending` and a staff member of the rider's warehouse (or an operations admin) approves or rejects it. The document
 * number is personal data and is encrypted at rest, like the account's email and phone.
 */
@Index('IDX_rider_documents_rider', ['riderId'])
@Index('UQ_rider_documents_file', ['fileId'], { unique: true })
@Entity('rider_documents')
export class RiderDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  riderId: string;

  @Column({ type: 'varchar', length: 30 })
  type: string;

  /** Licence / policy / plate / ID number, optional. Encrypted at rest. */
  @Column({ type: 'text', nullable: true, transformer: encryptedColumn })
  number: string | null;

  /** `YYYY-MM-DD`, the last day the document is valid; null = it does not expire. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  expiresOn: string | null;

  /** The private file (`private_files.id`). */
  @Column({ type: 'varchar', length: 36 })
  fileId: string;

  @Column({ type: 'varchar', length: 40 })
  mime: string;

  @Column({ type: 'int', default: 0 })
  size: number;

  @Column({ type: 'varchar', length: 12, default: 'pending' })
  status: RiderDocumentStatus;

  @Column({ type: 'varchar', length: 36, nullable: true })
  reviewedById: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reviewedByName: string | null;

  @Column({ type: 'datetime', nullable: true })
  reviewedAt: Date | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  rejectionReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
