import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from './order.entity';

/**
 * Where a line stands on the SELLER's side of a multi-seller order. Each seller
 * packs only their own lines (their "package"); the hub consolidates every
 * package into the one delivery the customer receives.
 * open → ready (seller packed it) → received (scanned in at the hub); or cancelled
 * (the seller could not fulfil it: restocked and refunded on its own).
 */
export type ItemFulfilment = 'open' | 'ready' | 'received' | 'cancelled';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column({ type: 'varchar' })
  orderId: string;

  @Index('IDX_order_items_product')
  @Column({ type: 'varchar' })
  productId: string;

  @Column({ type: 'varchar' })
  productName: string;

  @Column({ type: 'varchar', default: 'Default' })
  variant: string;

  /**
   * Served, never stored on the row: the line's name / option label in French, filled when an order is loaded
   * (`OrderItemTranslationSubscriber`) from the `translations` snapshot, else the current product translation.
   */
  productNameFr?: string;

  /** The option label in French. `null` for a product without options (its canonical variant is "Default"): there is nothing to show. */
  variantFr?: string | null;

  @Column({ type: 'int', default: 1 })
  qty: number;

  /** Unit price charged (after any flash sale / campaign discount). */
  @Column({ type: 'float' })
  priceUsd: number;

  /** The listing's normal price at order time (null on orders placed before campaigns existed). */
  @Column({ type: 'float', nullable: true })
  listPriceUsd: number | null;

  /** The campaign whose discount set `priceUsd` (null when none applied). */
  @Column({ type: 'varchar', length: 36, nullable: true })
  campaignId: string | null;

  @Column({ type: 'int', default: 0 })
  campaignPct: number;

  /** The listing's seller at order time (snapshot: later ownership changes don't move the sale). */
  @Index('IDX_order_items_seller')
  @Column({ type: 'varchar', length: 36, nullable: true })
  sellerId: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  sellerName: string | null;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  fulfilment: ItemFulfilment;

  @Column({ type: 'datetime', nullable: true })
  readyAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  receivedAt: Date | null;

  /** Why the seller cancelled this line (shown to the customer and ops). */
  @Column({ type: 'varchar', length: 200, nullable: true })
  cancelReason: string | null;

  /** Money given back for this line alone (seller cancellation). */
  @Column({ type: 'float', default: 0 })
  refundedUsd: number;
  /** Platform commission % frozen when the order was placed (a later rate change never rewrites history). */
  @Column({ type: 'float', default: 0 })
  commissionPct: number;

  /** Commission in USD on this line: round2(priceUsd * qty * commissionPct / 100). */
  @Column({ type: 'float', default: 0 })
  commissionUsd: number;
}
