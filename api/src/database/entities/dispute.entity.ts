import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type DisputeType = 'dispute' | 'return';
/** Coarse state: open until someone closes it. `stage` says where an open request is. */
export type DisputeStatus = 'open' | 'resolved' | 'rejected';

/**
 * Where a request stands.
 *  - return:  awaiting_seller → approved → pickup → received → (refunded: status resolved)
 *             awaiting_seller → seller_rejected | seller_timeout → escalated → approved | (rejected: status rejected)
 *  - dispute: awaiting_seller → seller_replied → (decided: status resolved | rejected)
 * A request closed by an admin keeps its last stage and carries `status` resolved / rejected.
 */
export type DisputeStage =
  | 'awaiting_seller'
  | 'seller_replied'
  | 'seller_rejected'
  | 'seller_timeout'
  | 'escalated'
  | 'approved'
  | 'pickup'
  | 'received'
  | 'closed';

export type DisputeOutcome =
  | 'refund_full'
  | 'refund_partial'
  | 'replacement'
  | 'reject'
  | 'return_refund';

@Entity('disputes')
export class Dispute {
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
  @Column({ type: 'varchar' })
  customerId: string;

  @Column({ type: 'varchar' })
  customerName: string;

  @Column({ type: 'varchar', length: 20, default: 'dispute' })
  type: DisputeType;

  /** dispute: missing | damaged | wrong_item | not_received | other; return: a free reason code. */
  @Column({ type: 'varchar', length: 24, nullable: true })
  category: string | null;

  @Column({ type: 'text' })
  reason: string;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'open' })
  status: DisputeStatus;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'awaiting_seller' })
  stage: DisputeStage;

  /** Customer photos (upload URLs) as a JSON array. */
  @Column({ type: 'text', nullable: true })
  attachments: string | null;

  /** The store whose items are concerned (null when the request spans several stores or the whole order). */
  @Index()
  @Column({ type: 'varchar', nullable: true })
  sellerId: string | null;

  /** The seller must answer by then (returns). Past it the request moves to `seller_timeout`. */
  @Column({ type: 'datetime', nullable: true })
  sellerDueAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  sellerRespondedAt: Date | null;

  /** The seller's reason when they accept or reject. */
  @Column({ type: 'text', nullable: true })
  sellerReason: string | null;

  @Column({ type: 'datetime', nullable: true })
  escalatedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  resolution: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  outcome: DisputeOutcome | null;

  /** Money given back for this request. */
  @Column({ type: 'float', default: 0 })
  refundUsd: number;

  /** Where the customer wants the money (`wallet` by default; `phone` needs a pawaPay payment). */
  @Column({ type: 'varchar', length: 10, default: 'wallet' })
  refundTo: 'wallet' | 'phone';

  /** The warehouse confirmed the returned goods arrived (required before a refund on a return). */
  @Column({ type: 'datetime', nullable: true })
  receivedAt: Date | null;

  /** The warehouse graded the returned goods (and put the resellable ones back in stock). */
  @Column({ type: 'datetime', nullable: true })
  gradedAt: Date | null;

  /** The return pickup task created by logistics. */
  @Column({ type: 'varchar', nullable: true })
  pickupTaskId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
