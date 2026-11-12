import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One label set for one or more orders: the same seller, the same customer, the same Kinshasa day, the same delivery address
 * (normalised) and the same delivery mode and warehouses. The boxes (`parcels.groupId`) carry one KOMORIKO code each and
 * those codes are the only thing a rider or the desk scans, however many orders are inside. See docs/contracts/logistics.md §18.
 *
 * Every order that has a label belongs to exactly one group (`parcel_group_orders`, unique per order); an order packed on
 * its own is a group of one. A multi-seller order is a group of one with `sellerKey` null (phase 1 never merges those).
 * The group LOCKS at the first pickup scan: later same-day orders open a new group (`daySeq` + 1).
 */
@Index('UQ_parcel_groups_key_seq', ['groupKey', 'daySeq'], { unique: true })
@Index('IDX_parcel_groups_seller_day', ['sellerKey', 'dayKey'])
@Entity('parcel_groups')
export class ParcelGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The seller key the boxes are sent by (same key as the pickup leg's `sellerId`); null for a multi-seller order's own group. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  sellerKey: string | null;

  @Column({ type: 'varchar', length: 36 })
  customerId: string;

  /** The Kinshasa calendar day (YYYY-MM-DD) the orders were placed. */
  @Column({ type: 'varchar', length: 10 })
  dayKey: string;

  /** 1 for the first group of a key on a day, 2 for the next one once the first is locked (or an order was packed alone). */
  @Column({ type: 'int', default: 1 })
  daySeq: number;

  /** The normalised delivery address: street, commune, city and the map pin rounded to about 50 m. */
  @Column({ type: 'varchar', length: 255, default: '' })
  addressKey: string;

  @Column({ type: 'varchar', length: 16, default: 'standard' })
  deliveryMode: 'standard' | 'express';

  @Column({ type: 'varchar', length: 36, nullable: true })
  originHubId: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  destinationHubId: string | null;

  /** Hash of every field above that decides membership (seller, customer, day, address, mode, hubs): a candidate order has the same one. */
  @Column({ type: 'varchar', length: 64 })
  groupKey: string;

  /** Set at the first pickup scan of any box of the group: from then on the orders and the box count cannot change. */
  @Column({ type: 'datetime', nullable: true })
  lockedAt: Date | null;

  /** Bumped every time the group's contents change after labels were made (an order added or removed, a line cancelled): the seller is told to reprint. */
  @Column({ type: 'int', default: 0 })
  contentsRev: number;

  @CreateDateColumn()
  createdAt: Date;
}
