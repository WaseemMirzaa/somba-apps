import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type ReturnCondition = 'resellable' | 'damaged' | 'unsellable';

/** One line (and how many units of it) a return or dispute is about. */
@Entity('dispute_items')
export class DisputeItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  disputeId: string;

  /** The order line. */
  @Index()
  @Column({ type: 'varchar', length: 36 })
  orderItemId: string;

  @Column({ type: 'varchar' })
  productId: string;

  @Column({ type: 'varchar' })
  productName: string;

  @Column({ type: 'varchar', default: 'Default' })
  variant: string;

  @Column({ type: 'int', default: 1 })
  qty: number;

  /** What one unit cost (after any campaign discount). */
  @Column({ type: 'float' })
  unitPriceUsd: number;

  /** Money paid back for this line of the request (promo share included); 0 until refunded. */
  @Column({ type: 'float', default: 0 })
  refundUsd: number;

  /** Warehouse grade; null until graded. */
  @Column({ type: 'varchar', length: 12, nullable: true })
  condition: ReturnCondition | null;

  /** Units put back on the shelf. */
  @Column({ type: 'int', default: 0 })
  restockedQty: number;

  @CreateDateColumn()
  createdAt: Date;
}
