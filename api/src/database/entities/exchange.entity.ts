import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ExchangeStatus =
  | 'requested'
  | 'approved'
  | 'received'
  | 'ready'
  | 'dispatched'
  | 'delivered'
  | 'rejected';

/**
 * An exchange of one purchased variant/product for another (e.g. a different
 * size). Any price difference is captured so finance can settle it.
 */
@Entity('exchanges')
export class Exchange {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 24 })
  reference: string;

  @Index()
  @Column({ type: 'varchar' })
  orderId: string;

  @Column({ type: 'varchar' })
  orderReference: string;

  @Index()
  @Column({ type: 'varchar', nullable: true })
  customerId: string | null;

  @Column({ type: 'varchar' })
  customerName: string;

  /** The store whose item is exchanged (null on old rows or when it can't be told). */
  @Index()
  @Column({ type: 'varchar', nullable: true })
  sellerId: string | null;

  @Column({ type: 'varchar' })
  fromSku: string;

  @Column({ type: 'varchar' })
  fromName: string;

  @Column({ type: 'varchar' })
  toSku: string;

  @Column({ type: 'varchar' })
  toName: string;

  /** Units exchanged. */
  @Column({ type: 'int', default: 1 })
  qty: number;

  /** The option label of the order line the customer gives back. */
  @Column({ type: 'varchar', nullable: true })
  fromVariant: string | null;

  /** The option label the customer wants instead (null for a product without options). */
  @Column({ type: 'varchar', nullable: true })
  toVariant: string | null;

  /** > 0: the customer pays the difference; < 0: they get money back. Computed on the server. */
  @Column({ type: 'float', default: 0 })
  priceDiffUsd: number;

  /** Money taken from the customer's wallet when the request was made (returned if it is rejected). */
  @Column({ type: 'float', default: 0 })
  heldUsd: number;

  /** Customer photos of the item (upload URLs) as a JSON array. */
  @Column({ type: 'text', nullable: true })
  attachments: string | null;

  /** The seller must answer by then. */
  @Column({ type: 'datetime', nullable: true })
  sellerDueAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  sellerRespondedAt: Date | null;

  /** The seller's reason when they approve or reject. */
  @Column({ type: 'text', nullable: true })
  sellerReason: string | null;

  /** Units taken from the seller's stock for the new item (0 until approved). */
  @Column({ type: 'int', default: 0 })
  stockTaken: number;

  /** The delivery task logistics created to bring the new item (and collect the old one). */
  @Column({ type: 'varchar', nullable: true })
  deliveryTaskId: string | null;

  @Column({ type: 'datetime', nullable: true })
  deliveredAt: Date | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'requested' })
  status: ExchangeStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
