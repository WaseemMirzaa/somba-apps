import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One physical box with a KOMORIKO label. The code on the label never changes from the seller to the customer: every leg
 * of the journey scans the same code. A seller package may be split into several boxes (`boxNo` of `boxCount`), each with
 * its own label. A parcel a customer sends back (return / exchange) has no seller and carries its case in `returnId`.
 *
 * Parcels are never deleted: when the seller changes the box count before the first pickup scan, the old parcels are
 * voided (`voidedAt`) and new ones are made, so an old label scanned by mistake is refused with a precise message.
 */
@Index('UQ_parcels_code', ['code'], { unique: true })
@Index('IDX_parcels_orderId', ['orderId'])
@Index('IDX_parcels_returnId', ['returnId'])
@Index('IDX_parcels_groupId', ['groupId'])
@Index('UQ_parcels_live_slot', ['liveSlot'], { unique: true })
@Entity('parcels')
export class Parcel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** PKG- followed by 8 characters of an unambiguous alphabet (no 0 / O / 1 / I). */
  @Column({ type: 'varchar', length: 16 })
  code: string;

  @Column({ type: 'varchar', length: 36 })
  orderId: string;

  /** The seller key the package is sent by (the same key as the pickup leg's `sellerId`); null for a return parcel. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  sellerId: string | null;

  /** The after-sale case (return / dispute / exchange) a customer's parcel belongs to; null for a seller's parcel. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  returnId: string | null;

  /** The parcel group (label set) this box belongs to; `orderId` is the group's first order (the anchor). Null on a return parcel. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  groupId: string | null;

  /**
   * `groupId:sellerId:boxNo` while the box is live, null once it is voided: the UNIQUE index on it is "one live box per slot",
   * which MySQL cannot say as a partial index. Two clicks (or two tabs) can therefore never make a second set of boxes.
   */
  @Column({ type: 'varchar', length: 96, nullable: true })
  liveSlot: string | null;

  @Column({ type: 'int', default: 1 })
  boxNo: number;

  @Column({ type: 'int', default: 1 })
  boxCount: number;

  @CreateDateColumn()
  createdAt: Date;

  /** Set when the label was replaced (box count changed) or the package was cancelled. */
  @Column({ type: 'datetime', nullable: true })
  voidedAt: Date | null;
}
