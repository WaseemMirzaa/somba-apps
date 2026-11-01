import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Why money went back to the customer:
 *  - `admin`: finance refunded what was left of an order (`orders:refund`);
 *  - `cancellation`: the order was cancelled (by the customer, by support, or after failed deliveries);
 *  - `return`: the returned items were paid back once the goods reached the warehouse;
 *  - `dispute`: an admin decided a dispute with a full or partial refund;
 *  - `seller_cancel`: a seller cancelled some lines of a paid order;
 *  - `late_payment`: a mobile-money approval arrived after the order was closed, so the money was parked in the wallet;
 *  - `legacy`: refunded before this ledger existed (written by the migration; the money is real, the detail is not known).
 */
export type RefundKind = 'admin' | 'cancellation' | 'return' | 'dispute' | 'seller_cancel' | 'late_payment' | 'legacy';

/** completed | sending (a phone refund pawaPay has not confirmed yet) | failed (pawaPay could not; the wallet got it instead). */
export type RefundStatus = 'completed' | 'sending' | 'failed';

/**
 * One refund of a payment: the single record every refund path writes (C-refund), so the admin Refunds page lists
 * it (amount, where it went, when, which return) and the finance figures count it. `payments.refundedUsd` is the
 * running total of these rows; no refund may take the total past `payments.amountUsd`.
 */
@Entity('payment_refunds')
export class PaymentRefund {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  paymentId: string;

  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  orderId: string | null;

  @Column({ type: 'varchar', nullable: true })
  orderReference: string | null;

  /** The customer who got the money. */
  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @Column({ type: 'float' })
  amountUsd: number;

  /** Where the money went: the customer's wallet, or back to the paying phone (pawaPay). */
  @Column({ type: 'varchar', length: 10 })
  refundTo: 'wallet' | 'phone';

  @Column({ type: 'varchar', length: 12, default: 'completed' })
  status: RefundStatus;

  /** pawaPay refundId of a phone refund. */
  @Index()
  @Column({ type: 'varchar', length: 100, nullable: true })
  refundRef: string | null;

  @Column({ type: 'varchar', length: 16 })
  kind: RefundKind;

  /** The return or dispute this refund belongs to (kinds `return` and `dispute`). */
  @Column({ type: 'varchar', length: 36, nullable: true })
  disputeId: string | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  disputeReference: string | null;

  /** The wallet history line, in English (`localize.ts` has the French). */
  @Column({ type: 'varchar', nullable: true })
  memo: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
