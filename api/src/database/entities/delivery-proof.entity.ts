import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Proof of handover for one delivery leg: the rider's photo of the parcel at the door and/or the customer's signature.
 * The files live in the PRIVATE upload folder (`PRIVATE_UPLOAD_DIR/pod/`), never under the public /uploads; this row only
 * holds their names. Read only through `GET /api/v1/delivery-proofs/:taskId/:part` by staff who may (see DeliveryProofService).
 * One row per task (unique `taskId`); a second upload replaces the files. Optional: a delivery without proof has no row.
 */
@Entity('delivery_proofs')
export class DeliveryProof {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_delivery_proofs_taskId', { unique: true })
  @Column({ type: 'varchar', length: 36 })
  taskId: string;

  @Column({ type: 'varchar', length: 36 })
  orderId: string;

  /** The rider who captured it (always the task's assigned rider at that time). */
  @Column({ type: 'varchar', length: 36 })
  riderId: string;

  /** File name on disk (uuid + `.jpg` / `.png`); null = no photo. */
  @Column({ type: 'varchar', length: 80, nullable: true })
  photoFile: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  photoMime: string | null;

  /** The customer's signature, a PNG drawn on the rider's phone; null = none. */
  @Column({ type: 'varchar', length: 80, nullable: true })
  signatureFile: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  signatureMime: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
