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
 *  - return:  awaiting_support → approved → pickup → received → (refunded: status resolved)
 *             awaiting_support → (refused: status rejected)
 *  - dispute: awaiting_support → (decided: status resolved | rejected)
 * Every request starts with KOMORIKO support (sellers take no part: docs/contracts/admin-controls.md). A request closed by
 * an admin keeps its last stage and carries `status` resolved / rejected.
 * The seller stages below are LEGACY: nothing writes them any more and a migration moved their rows to `awaiting_support`;
 * they stay in the type so an old client or an old export that names one still parses.
 */
export type DisputeStage =
  | 'awaiting_support'
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
  @Column({ type: 'varchar', length: 20, default: 'awaiting_support' })
  stage: DisputeStage;

  /** Customer photos (upload URLs) as a JSON array. */
  @Column({ type: 'text', nullable: true })
  attachments: string | null;

  /** The store whose items are concerned (null when the request spans several stores or the whole order). */
  @Index()
  @Column({ type: 'varchar', nullable: true })
  sellerId: string | null;

  /** Support should answer by then (`sellerResponseHours` after opening; the column keeps its old name). Past it support is alerted once. */
  @Column({ type: 'datetime', nullable: true })
  sellerDueAt: Date | null;

  /** When the support response time ran out with no decision (support was alerted once; null = not lapsed). */
  @Column({ type: 'datetime', nullable: true })
  sellerLapsedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  sellerRespondedAt: Date | null;

  /** LEGACY: the seller's reason from before sellers left the after-sale flow; nothing writes it any more. */
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

  /** Where the customer wants the money (`wallet` by default). `phone` means "back to the method that paid": the paying phone (pawaPay) or the card (Stripe). */
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
